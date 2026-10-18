import { NextResponse } from "next/server";
import type {
  MovieDialogueLine,
  MovieScene,
  VideoGenerationResponse,
  VideoLanguage
} from "@/types/video";
import { getEnvValue } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { uploadTtsAudioAssetToStorage } from "@/lib/audio/tts-storage";
import { generateUrduElevenLabsSpeech } from "@/lib/audio/elevenlabs-urdu-tts";
import { hasSpeechText, resolveDeepgramVoiceModel } from "@/lib/audio/voice-consistency";
import {
  deepgramSpeedForEmotion,
  formatDeepgramEmotionInformedText,
  resolveDialogueEmotion,
} from "@/lib/audio/emotion-informed-delivery";
import { prisma } from "@/lib/prisma";
import { validateUrduAudienceScript } from "@/lib/video-language";

const ELEVENLABS_PROVIDER_LABEL = "ElevenLabs Eleven v3";
const DEEPGRAM_PROVIDER_LABEL = "Deepgram TTS";

export const runtime = "nodejs";

const DEEPGRAM_TTS_ENDPOINT = "https://api.deepgram.com/v1/speak";
const DEFAULT_DEEPGRAM_TTS_MODEL = "aura-2-thalia-en";
const MAX_AUDIO_LINES = 18;
const MAX_SCENES = 20;
const MAX_DIALOGUE_LINES = 60;
const MAX_SPEECH_CHARS = 1_800;
const MAX_TRANSIENT_AUDIO_BYTES = 4 * 1024 * 1024;

function diagnosticTextFingerprint(text: string) {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = (((hash << 5) + hash) ^ text.charCodeAt(index)) >>> 0;
  return hash.toString(36);
}

function logTtsClipDiagnostic(stage: "request" | "stored", params: { scene: MovieScene; line: MovieDialogueLine; storagePath?: string }) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("Custom/Guided TTS clip diagnostic", {
    stage,
    sceneId: params.scene.persistenceSceneId ?? params.scene.sceneNumber,
    dialogueId: params.line.id,
    speaker: params.line.character,
    textFingerprint: diagnosticTextFingerprint(params.line.line),
    storageObject: params.storagePath?.split("/").pop() ?? "transient",
  });
}



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

function validateSubmittedScript(script: VideoGenerationResponse): string | null {
  if (script.scenes.length === 0 || script.scenes.length > MAX_SCENES) {
    return `Voice generation supports between 1 and ${MAX_SCENES} scenes.`;
  }

  let dialogueCount = 0;
  const dialogueKeys = new Set<string>();
  for (const scene of script.scenes) {
    if (!Array.isArray(scene.dialogues)) return "Each scene must contain valid dialogue data.";
    dialogueCount += scene.dialogues.length;
    for (const line of scene.dialogues) {
      const key = `${scene.persistenceSceneId ?? scene.sceneNumber}:${line.id}`;
      if (!line.id || dialogueKeys.has(key)) return "Each audio line must have a unique stable scene and dialogue identity.";
      dialogueKeys.add(key);
      if (typeof line.line !== "string" || line.line.length > MAX_SPEECH_CHARS) {
        return `Dialogue lines must be at most ${MAX_SPEECH_CHARS} characters.`;
      }
    }
  }
  return dialogueCount > MAX_DIALOGUE_LINES
    ? `Voice generation supports at most ${MAX_DIALOGUE_LINES} submitted dialogue lines.`
    : null;
}

function transientAudioUrl(audio: ArrayBuffer, contentType: string): string {
  if (audio.byteLength > MAX_TRANSIENT_AUDIO_BYTES) {
    throw new Error("Temporary audio preview is too large to return safely.");
  }
  return `data:${contentType};base64,${Buffer.from(audio).toString("base64")}`;
}

// Punctuation-only pacing: it inserts/adjusts ASCII "," "." "!" characters and
// never touches letters, so it is reused unchanged for Urdu dialogue. If Urdu
// text uses Arabic-script punctuation (،  ؟) instead of ASCII, these regexes
// simply find no match and the text passes through unmodified - safe either way.
async function generateDeepgramDialogueAudio(params: {
  apiKey: string;
  fallbackModel: string;
  line: MovieDialogueLine;
  scene: MovieScene;
  projectId?: string;
  persistent: boolean;
}) {
  logTtsClipDiagnostic("request", params);
  const emotion = resolveDialogueEmotion({ line: params.line, scene: params.scene });
  const url = new URL(DEEPGRAM_TTS_ENDPOINT);
  url.searchParams.set(
    "model",
    resolveDeepgramVoiceModel(params.line.voiceProfile.deepgramModel, params.fallbackModel)
  );
  // Deepgram documents `speed`; no unsupported emotion/style parameters are sent.
  url.searchParams.set("speed", String(deepgramSpeedForEmotion(emotion.emotion)));

  const response = await fetch(url.toString(), {
    body: JSON.stringify({
      text: formatDeepgramEmotionInformedText(params.line.line, emotion.emotion)
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
  if (audio.byteLength < 100) throw new Error(`Deepgram TTS ${params.line.id} returned empty audio.`);
  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  const uploaded = params.persistent
    ? await uploadTtsAudioAssetToStorage({
      audioBuffer: audio,
      contentType,
      projectId: params.projectId,
      dialogueId: params.line.id,
    })
    : undefined;
  const audioUrl = uploaded?.audioUrl ?? transientAudioUrl(audio, contentType);
  logTtsClipDiagnostic("stored", { ...params, storagePath: uploaded?.storagePath });

  return {
    ...params.line,
    emotion: emotion.emotion,
    audioMimeType: contentType,
    audioStoragePath: uploaded?.storagePath,
    audioUrl
  };
}

async function generateElevenLabsDialogueAudio(params: {
  line: MovieDialogueLine;
  scene: MovieScene;
  projectId?: string;
  persistent: boolean;
}) {
  logTtsClipDiagnostic("request", params);
  const emotion = resolveDialogueEmotion({ line: params.line, scene: params.scene });
  const speech = await generateUrduElevenLabsSpeech({
    text: params.line.line,
    voiceProfile: params.line.voiceProfile,
    emotion: emotion.emotion,
  });

  const uploaded = params.persistent
    ? await uploadTtsAudioAssetToStorage({
      audioBuffer: speech.audioBuffer,
      contentType: speech.contentType,
      projectId: params.projectId,
      dialogueId: params.line.id,
    })
    : undefined;
  const audioUrl = uploaded?.audioUrl ?? transientAudioUrl(speech.audioBuffer, speech.contentType);
  logTtsClipDiagnostic("stored", { ...params, storagePath: uploaded?.storagePath });

  return {
    ...params.line,
    emotion: emotion.emotion,
    audioMimeType: speech.contentType,
    audioStoragePath: uploaded?.storagePath,
    audioUrl
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

async function attachDeepgramDialogueAudio(scenes: MovieScene[], apiKey: string, projectId: string | undefined, persistent: boolean) {
  const fallbackModel =
    getEnvValue(["DEEPGRAM_TTS_MODEL", "deepgramttsmodel"]) || DEFAULT_DEEPGRAM_TTS_MODEL;
  const allDialogueRefs = scenes.flatMap((scene, sceneIndex) =>
    scene.dialogues.map((line, dialogueIndex) => ({
      dialogueIndex,
      line,
      scene,
      sceneIndex
    })).filter((reference) => hasSpeechText(reference.line.line))
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
        scene: reference.scene,
        projectId,
        persistent
      });
      generatedCount += 1;
      return { ...reference, line };
    } catch {
      // Provider response bodies can contain implementation detail. Retain a
      // per-line failure state without reflecting that detail to the browser.
      const safeMessage = `Dialogue audio could not be generated for ${reference.line.character || "this character"}. Please retry this clip.`;
      errors.push(safeMessage);
      return {
        ...reference,
        line: {
          ...reference.line,
          audioError: safeMessage
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

async function attachElevenLabsDialogueAudio(scenes: MovieScene[], projectId: string | undefined, persistent: boolean) {
  const allDialogueRefs = scenes.flatMap((scene, sceneIndex) =>
    scene.dialogues.map((line, dialogueIndex) => ({
      dialogueIndex,
      line,
      scene,
      sceneIndex
    })).filter((reference) => hasSpeechText(reference.line.line))
  );
  const dialogueRefs = allDialogueRefs.slice(0, MAX_AUDIO_LINES);
  const errors: string[] = [];
  let generatedCount = 0;

  const generatedLines = await mapWithConcurrency(dialogueRefs, 3, async (reference) => {
    try {
      const line = await generateElevenLabsDialogueAudio({
        line: reference.line,
        scene: reference.scene,
        projectId,
        persistent
      });
      generatedCount += 1;
      return { ...reference, line };
    } catch {
      // Unsupported archetypes / missing voice IDs land here per-line, so one
      // unconfigured character never blocks audio for the rest of the cast -
      // and this line is never silently retried against an English Deepgram voice.
      const safeMessage = `Urdu dialogue audio could not be generated for ${reference.line.character || "this character"}. Please retry this clip.`;
      errors.push(safeMessage);
      return {
        ...reference,
        line: {
          ...reference.line,
          audioError: safeMessage
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
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const script = getSubmittedScript(body);
    const projectId = typeof body?.projectId === "string" ? body.projectId : undefined;
    const draftId = typeof body?.draftId === "string" ? body.draftId : undefined;
    const transient = body?.transient === true;
    const language: VideoLanguage = body?.language === "ur" ? "ur" : "en";
    const scriptLanguage: VideoLanguage | undefined = body?.scriptLanguage === "ur"
      ? "ur"
      : body?.scriptLanguage === "en" ? "en" : undefined;

    if (!script) {
      return NextResponse.json(
        { error: "Please provide a confirmed film sequence before generating voices." },
        { status: 400 }
      );
    }
    if (!scriptLanguage || scriptLanguage !== language) {
      return NextResponse.json(
        { error: "This script was generated for a different language. Regenerate scenes before synthesising voice audio." },
        { status: 409 },
      );
    }
    if (language === "ur") {
      const urduError = validateUrduAudienceScript(script);
      if (urduError) return NextResponse.json({ error: urduError }, { status: 422 });
    }

    const scriptError = validateSubmittedScript(script);
    if (scriptError) return NextResponse.json({ error: scriptError }, { status: 400 });

    const hasAnyPersistentIdentifier = body?.projectId !== undefined || body?.draftId !== undefined;
    const hasPersistentTarget = Boolean(projectId?.trim() && draftId?.trim());
    if (hasAnyPersistentIdentifier && (!hasPersistentTarget || transient)) {
      return NextResponse.json({ error: "Provide matching projectId and draftId for saved video audio." }, { status: 400 });
    }
    if (!hasPersistentTarget && !transient) {
      return NextResponse.json({ error: "A saved video draft is required. Browser-local previews must explicitly request transient audio." }, { status: 400 });
    }

    if (hasPersistentTarget) {
      const draft = await prisma.storyDraft.findFirst({
        where: { id: draftId, storyProjectId: projectId, project: { userId: user.id } }, select: { id: true },
      });
      if (!draft) return NextResponse.json({ error: "Video draft not found or access denied." }, { status: 403 });
    }

    if (language === "ur") {
      const elevenLabsApiKey = getEnvValue(["ELEVENLABS_API_KEY"]);
      if (!elevenLabsApiKey) {
        return NextResponse.json(
          { error: "ElevenLabs API key is missing. Add ELEVENLABS_API_KEY in .env.local." },
          { status: 500 }
        );
      }

      const audioResult = await attachElevenLabsDialogueAudio(script.scenes, projectId, hasPersistentTarget);
      const payload: VideoGenerationResponse = {
        ...script,
        audio: {
          errors: audioResult.errors,
          generatedCount: audioResult.generatedCount,
          provider: ELEVENLABS_PROVIDER_LABEL,
          requested: true
        },
        generatedAt: new Date().toISOString(),
        scenes: audioResult.scenes
      };

      return NextResponse.json(payload);
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

    const audioResult = await attachDeepgramDialogueAudio(script.scenes, deepgramTtsApiKey, projectId, hasPersistentTarget);
    const payload: VideoGenerationResponse = {
      ...script,
      audio: {
        errors: audioResult.errors,
        generatedCount: audioResult.generatedCount,
        provider: DEEPGRAM_PROVIDER_LABEL,
        requested: true
      },
      generatedAt: new Date().toISOString(),
      scenes: audioResult.scenes
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json({ error: "Voice generation could not be completed. Please try again." }, { status: 500 });
  }
}
