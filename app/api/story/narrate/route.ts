import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEnvValue } from "@/lib/env";
import { uploadTtsAudioToStorage } from "@/lib/audio/tts-storage";
import { saveSceneNarration } from "@/lib/story-database";

export const runtime = "nodejs";

const DEEPGRAM_TTS_ENDPOINT = "https://api.deepgram.com/v1/speak";
const DEFAULT_NARRATOR_MODEL = "aura-2-orion-en";
const MAX_NARRATION_CHARS = 1800;

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "No narration text provided." }, { status: 400 });
    }

    const deepgramApiKey = getEnvValue(["DEEPGRAM_TTS_API_KEY", "DEEPGRAM_API_KEY", "deepgramtts"]);
    if (!deepgramApiKey) {
      return NextResponse.json(
        { error: "Deepgram TTS key is missing. Add DEEPGRAM_TTS_API_KEY or deepgramtts in .env.local." },
        { status: 500 }
      );
    }

    const model = typeof body.voiceModel === "string" && body.voiceModel
      ? body.voiceModel
      : getEnvValue(["DEEPGRAM_TTS_MODEL", "deepgramttsmodel"]) || DEFAULT_NARRATOR_MODEL;

    const url = new URL(DEEPGRAM_TTS_ENDPOINT);
    url.searchParams.set("model", model);

    const deepgramResponse = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: text.slice(0, MAX_NARRATION_CHARS) })
    });

    if (!deepgramResponse.ok) {
      const errorText = await deepgramResponse.text();
      throw new Error(`Deepgram TTS failed (${deepgramResponse.status}): ${errorText.slice(0, 300)}`);
    }

    const audioBuffer = await deepgramResponse.arrayBuffer();
    const contentType = deepgramResponse.headers.get("content-type") ?? "audio/mpeg";

    const draftId = typeof body.draftId === "string" ? body.draftId : undefined;
    const sceneNumber = typeof body.sceneNumber === "number" ? body.sceneNumber : undefined;

    const audioUrl = await uploadTtsAudioToStorage({
      audioBuffer,
      contentType,
      projectId: typeof body.projectId === "string" ? body.projectId : undefined,
      dialogueId: `narration-${draftId ?? "draft"}-${sceneNumber ?? Date.now()}`
    });

    if (draftId && typeof sceneNumber === "number") {
      await saveSceneNarration(draftId, sceneNumber, {
        url: audioUrl,
        prompt: text.slice(0, 300),
        provider: "Deepgram TTS"
      });
    }

    return NextResponse.json({ success: true, audioUrl, provider: "Deepgram TTS" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Narration generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
