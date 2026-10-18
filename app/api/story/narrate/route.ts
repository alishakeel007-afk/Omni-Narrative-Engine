import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEnvValue } from "@/lib/env";
import { uploadTtsAudioAssetToStorage } from "@/lib/audio/tts-storage";
import { getOwnedSceneMediaTarget, saveSceneNarration } from "@/lib/story-database";
import { resolveDeepgramVoiceModel } from "@/lib/audio/voice-consistency";

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
    if (!text || text.length > MAX_NARRATION_CHARS) {
      return NextResponse.json({ error: `Narration text is required and must be at most ${MAX_NARRATION_CHARS} characters.` }, { status: 400 });
    }

    const draftId = typeof body.draftId === "string" && body.draftId.trim() ? body.draftId : undefined;
    const sceneNumber = Number.isInteger(body.sceneNumber) && body.sceneNumber > 0 ? body.sceneNumber : undefined;
    const hasAnyTargetIdentifier = body.draftId !== undefined || body.sceneNumber !== undefined || body.projectId !== undefined;
    if (!draftId || sceneNumber === undefined || !hasAnyTargetIdentifier) {
      return NextResponse.json({ error: "Narration requires a valid saved draft and positive scene number." }, { status: 400 });
    }
    // Authorize before external synthesis so another user's scene can never
    // consume provider quota or receive a storage object.
    const target = await getOwnedSceneMediaTarget(draftId, sceneNumber, user.id);
    if (!target) {
      return NextResponse.json({ error: "Saved scene not found or access denied." }, { status: 404 });
    }
    if (typeof body.projectId === "string" && body.projectId !== target.draft.storyProjectId) {
      return NextResponse.json({ error: "Project does not match the requested draft." }, { status: 400 });
    }

    const deepgramApiKey = getEnvValue(["DEEPGRAM_TTS_API_KEY", "DEEPGRAM_API_KEY", "deepgramtts"]);
    if (!deepgramApiKey) {
      return NextResponse.json(
        { error: "Deepgram TTS key is missing. Add DEEPGRAM_TTS_API_KEY or deepgramtts in .env.local." },
        { status: 500 }
      );
    }

    const configuredModel = getEnvValue(["DEEPGRAM_TTS_MODEL", "deepgramttsmodel"]) || DEFAULT_NARRATOR_MODEL;
    const model = resolveDeepgramVoiceModel(typeof body.voiceModel === "string" ? body.voiceModel : undefined, configuredModel);

    const url = new URL(DEEPGRAM_TTS_ENDPOINT);
    url.searchParams.set("model", model);

    const deepgramResponse = await fetch(url.toString(), {
      method: "POST",
      headers: {
        Authorization: `Token ${deepgramApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text })
    });

    if (!deepgramResponse.ok) {
      const errorText = await deepgramResponse.text();
      throw new Error(`Deepgram TTS failed (${deepgramResponse.status}): ${errorText.slice(0, 300)}`);
    }

    const audioBuffer = await deepgramResponse.arrayBuffer();
    if (audioBuffer.byteLength < 100) throw new Error("Deepgram TTS returned empty audio.");
    const contentType = deepgramResponse.headers.get("content-type") ?? "audio/mpeg";

    const uploadedAudio = await uploadTtsAudioAssetToStorage({
      audioBuffer,
      contentType,
      projectId: target.draft.storyProjectId,
      dialogueId: `narration-${draftId}-${sceneNumber}`
    });

    await saveSceneNarration(draftId, sceneNumber, {
      url: uploadedAudio.audioUrl,
      prompt: text.slice(0, 300),
      provider: "Deepgram TTS",
      storagePath: uploadedAudio.storagePath,
    });

    return NextResponse.json({ success: true, audioUrl: uploadedAudio.audioUrl, provider: "Deepgram TTS" });
  } catch (error) {
    return NextResponse.json({ error: "Narration generation could not be completed. Please try again." }, { status: 500 });
  }
}
