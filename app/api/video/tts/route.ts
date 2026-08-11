import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import type {
  MovieDialogueLine,
  MovieScene,
  VideoGenerationResponse
} from "@/types/video";
import { getEnvValue } from "@/lib/env";

export const runtime = "nodejs";

const DEEPGRAM_TTS_ENDPOINT = "https://api.deepgram.com/v1/speak";
const DEFAULT_DEEPGRAM_TTS_MODEL = "aura-2-thalia-en";
const MAX_AUDIO_LINES = 18;



function getSubmittedScript(value: unknown): VideoGenerationResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as { script?: unknown; scenes?: unknown };
  const script = source.script && typeof source.script === "object"
    ? source.script
    : value;

  if (!Array.isArray((script as { scenes?: unknown }).scenes)) {
    return null;
  }

  return script as VideoGenerationResponse;
}

function applySituationalSpeechPacing(line: MovieDialogueLine, scene: MovieScene) {
  const situation = `${scene.sceneTone} ${scene.mood} ${line.delivery} ${line.voiceProfile.tone}`.toLowerCase();
  let text = line.line.trim();

  if (!text) {
    return text;
  }

  if (
    situation.includes("suspense") ||
    situation.includes("tense") ||
    situation.includes("fear") ||
    situation.includes("whisper")
  ) {
    text = text.replace(/, /g, "... ");

    if (!/[.!?]$/.test(text)) {
      text += "...";
    }
  } else if (
    situation.includes("funny") ||
    situation.includes("comic") ||
    situation.includes("playful") ||
    situation.includes("awkward")
  ) {
    if (text.length < 120 && !/[!?]$/.test(text)) {
      text = text.replace(/\.$/, "");
      text += "!";
    }
  } else if (
    situation.includes("emotional") ||
    situation.includes("sad") ||
    situation.includes("soft") ||
    situation.includes("shaken")
  ) {
    text = text.replace(/, /g, "... ");

    if (text.endsWith(".")) {
      text = text.slice(0, -1) + "...";
    }
  } else if (
    situation.includes("epic") ||
    situation.includes("heroic") ||
    situation.includes("angry")
  ) {
    if (text.endsWith(".")) {
      text = text.slice(0, -1) + "!";
    }
  }

  return text;
}

async function generateDeepgramDialogueAudio(params: {
  apiKey: string;
  fallbackModel: string;
  line: MovieDialogueLine;
  scene: MovieScene;
}) {
  const url = new URL(DEEPGRAM_TTS_ENDPOINT);
  url.searchParams.set(
    "model",
    params.line.voiceProfile.deepgramModel || params.fallbackModel
  );

  const response = await fetch(url.toString(), {
    body: JSON.stringify({
      text: applySituationalSpeechPacing(params.line, params.scene)
    }),
    headers: {
      Authorization: `Token ${params.apiKey}`,
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram TTS ${params.line.id} failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const audio = await response.arrayBuffer();
  const base64Audio = Buffer.from(audio).toString("base64");
  const contentType = response.headers.get("content-type") ?? "audio/mpeg";

  return {
    ...params.line,
    audioMimeType: contentType,
    audioUrl: `data:${contentType};base64,${base64Audio}`
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function attachDeepgramDialogueAudio(scenes: MovieScene[], apiKey: string) {
  const fallbackModel =
    getEnvValue(["DEEPGRAM_TTS_MODEL", "deepgramttsmodel"]) || DEFAULT_DEEPGRAM_TTS_MODEL;
  const allDialogueRefs = scenes.flatMap((scene, sceneIndex) =>
    scene.dialogues.map((line, dialogueIndex) => ({
      dialogueIndex,
      line,
      scene,
      sceneIndex
    }))
  );
  const dialogueRefs = allDialogueRefs.slice(0, MAX_AUDIO_LINES);
  const errors: string[] = [];
  let generatedCount = 0;

  const generatedLines = await mapWithConcurrency(dialogueRefs, 3, async (reference) => {
    try {
      const line = await generateDeepgramDialogueAudio({
        apiKey,
        fallbackModel,
        line: reference.line,
        scene: reference.scene
      });
      generatedCount += 1;
      return { ...reference, line };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Deepgram TTS audio error";
      errors.push(message);
      return {
        ...reference,
        line: {
          ...reference.line,
          audioError: message
        }
      };
    }
  });

  const nextScenes = scenes.map((scene) => ({
    ...scene,
    dialogues: scene.dialogues.map((dialogue) => ({ ...dialogue }))
  }));

  for (const generatedLine of generatedLines) {
    nextScenes[generatedLine.sceneIndex].dialogues[generatedLine.dialogueIndex] = generatedLine.line;
  }

  if (dialogueRefs.length < allDialogueRefs.length) {
    errors.push(`Audio was limited to the first ${MAX_AUDIO_LINES} dialogue lines to control response size and API usage.`);
  }

  return {
    errors,
    generatedCount,
    scenes: nextScenes
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const script = getSubmittedScript(body);

    if (!script) {
      return NextResponse.json(
        { error: "Please provide a confirmed film sequence before generating voices." },
        { status: 400 }
      );
    }

    const deepgramTtsApiKey = getEnvValue([
      "DEEPGRAM_TTS_API_KEY",
      "DEEPGRAM_API_KEY",
      "deepgramtts"
    ]);

    if (!deepgramTtsApiKey) {
      return NextResponse.json(
        { error: "Deepgram TTS key is missing. Add DEEPGRAM_TTS_API_KEY or deepgramtts in .env.local." },
        { status: 500 }
      );
    }

    const audioResult = await attachDeepgramDialogueAudio(script.scenes, deepgramTtsApiKey);
    const payload: VideoGenerationResponse = {
      ...script,
      audio: {
        errors: audioResult.errors,
        generatedCount: audioResult.generatedCount,
        provider: "Deepgram TTS",
        requested: true
      },
      generatedAt: new Date().toISOString(),
      scenes: audioResult.scenes
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
