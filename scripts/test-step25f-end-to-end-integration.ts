import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { fetchGeminiWithRetry } from "../lib/gemini-retry.ts";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { extractAtomicMemories } from "../lib/memory/memory-extractor.ts";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { decideSceneMusic } from "../lib/audio/music-policy.ts";
import type { StoryScene } from "../types/story";
import type { VideoStudioFlowState } from "../lib/video-storage";
import type { MovieScene, VideoGenerationResponse } from "../types/video";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");
const temporaryModules: string[] = [];

/**
 * Node's built-in TypeScript execution does not implement tsconfig path aliases.
 * Compile only the database adapter under test with tiny deterministic stand-ins
 * for its two alias-based helper imports; the save/load implementation itself is
 * still executed against the mocked fetch API below.
 */
function loadVideoStudioDatabaseAdapter() {
  const sourcePath = resolve(process.cwd(), "lib/video-studio-db.ts");
  const source = readFileSync(sourcePath, "utf8")
    .replace(/import \{ resolveDialogueEmotion, type DialogueEmotion \} from "@\/lib\/audio\/emotion-informed-delivery";\r?\n/, "const resolveDialogueEmotion = () => ({ emotion: 'neutral' });\n")
    .replace(/import \{ applyVideoMediaFreshness, collectVideoMediaFreshness \} from "@\/lib\/video-media-freshness";\r?\n/, "const applyVideoMediaFreshness = (scene) => scene; const collectVideoMediaFreshness = () => ({});\n");
  const temporaryPath = resolve(process.cwd(), ".tmp-step25f-video-studio-db.cjs");
  temporaryModules.push(temporaryPath);
  writeFileSync(temporaryPath, ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, "utf8");
  return require(temporaryPath) as {
    loadVideoStudioFromDatabase(projectId: string): Promise<VideoStudioFlowState | null>;
    saveVideoStudioToDatabase(flow: VideoStudioFlowState): Promise<{ success: boolean }>;
  };
}

const { loadVideoStudioFromDatabase, saveVideoStudioToDatabase } = loadVideoStudioDatabaseAdapter();

const scene = (sceneNumber: number, title: string): MovieScene => ({
  sceneNumber,
  title,
  narration: `Narration for ${title}.`,
  location: sceneNumber === 1 ? "Observatory" : "Moonlit bridge",
  mood: sceneNumber === 1 ? "Hopeful" : "Suspenseful",
  directorNotes: "The protagonist acts after considering the established risk.",
  sceneGenre: "Fantasy",
  sceneTone: "Cinematic",
  soundDesign: "Wind and a restrained atmospheric bed.",
  visualPrompt: "Cinematic frame focused on the protagonist.",
  imagePrompt: "Cinematic frame focused on the protagonist.",
  estimatedDuration: "20 seconds",
  dialogues: [{
    id: `line-${sceneNumber}`,
    character: "Ari",
    line: `Ari speaks in scene ${sceneNumber}.`,
    delivery: "calm",
    audioUrl: `https://media.test/dialogue-${sceneNumber}.wav`,
    voiceProfile: { archetype: "hero", character: "Ari", deepgramModel: "aura-2-orion-en", description: "Warm", gender: "masculine", tone: "calm", voiceName: "Orion" },
  }],
  generatedImageUrl: `https://media.test/image-${sceneNumber}.png`,
  generatedImagePrompt: "Cinematic frame focused on Ari.",
  narrationAudioUrl: `https://media.test/narration-${sceneNumber}.wav`,
  backgroundMusicUrl: sceneNumber === 1 ? undefined : `https://media.test/music-${sceneNumber}.wav`,
  backgroundMusicPrompt: sceneNumber === 1 ? undefined : "Instrumental suspense music. No vocals.",
  backgroundMusicProvider: sceneNumber === 1 ? undefined : "Legacy WAV Import",
  backgroundMusicStatus: sceneNumber === 1 ? "silent" : "completed",
});

const script: VideoGenerationResponse = {
  id: "video-draft-a", title: "Edited Film Title", logline: "Ari protects an important memory.",
  genre: "Fantasy", tone: "Cinematic", estimatedRuntime: "40 seconds", generatedAt: "2026-01-01T00:00:00.000Z",
  characterVoices: [{ archetype: "hero", character: "Ari", deepgramModel: "aura-2-orion-en", description: "Warm", gender: "masculine", tone: "calm", voiceName: "Orion" }],
  audio: { errors: [], generatedCount: 0, provider: "Deepgram TTS", requested: false },
  scenes: [scene(1, "The observatory"), scene(2, "The crossing")],
};

const flow: VideoStudioFlowState = {
  projectId: "project-a", draftId: "draft-a", acceptedStory: "Saved story", generatedStory: "Saved story",
  genres: ["Fantasy"], tones: ["Cinematic"], roughIdea: "Ari must protect a memory before dawn.",
  language: "en" as const, stage: "preview" as const, sceneCount: 2, script, voiceResult: { ...script, title: "STALE TITLE" },
  images: { message: "ready", provider: "Cloudflare", status: "ready" as const },
  music: { message: "ready", mood: "suspense", provider: "Legacy WAV Import", status: "ready" as const, title: "", trackUrl: "" },
  musicDecisions: {
    "1": { outcome: "silence" as const, reason: "Dialogue-heavy opening." },
    "2": { outcome: "music" as const, category: "suspense" as const, reason: "Tension rises." },
  },
  scenesNeedRegeneration: false, voiceNeedsRegeneration: false, videoOutdated: false, updatedAt: "2026-01-01T00:00:00.000Z",
};

const originalFetch = globalThis.fetch;
let savedBody: any;
try {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/video/save")) {
      savedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    if (url.endsWith("/video/load")) {
      // Deliberately unordered fixture proves the client does not scramble
      // scene playback if an intermediary returns an unexpected order.
      return new Response(JSON.stringify({ videoStudioState: {
        projectId: "project-a", draftId: "draft-a", genres: ["Fantasy"], tones: ["Cinematic"],
        videoStudioState: { stage: "preview", roughIdea: "idea", acceptedStory: "story", generatedStory: "story", language: "en", title: "Edited Film Title", logline: "logline", estimatedRuntime: "40 seconds", scenesNeedRegeneration: false, voiceNeedsRegeneration: false, videoOutdated: false, musicDecisions: flow.musicDecisions },
        characterVoices: [{ name: "Ari", voiceProfile: script.characterVoices[0] }],
        scenes: [2, 1].map((number) => ({
          sceneNumber: number, title: `Scene ${number}`, narration: `Narration ${number}`, location: "Bridge", mood: "Tense", directorNotes: "Act", sceneGenre: "Fantasy", sceneTone: "Cinematic", soundDesign: "Wind", visualPrompt: "Ari", estimatedDuration: "20 seconds",
          dialogues: [{ character: "Ari", line: `Line ${number}`, delivery: "calm", audioUrl: `https://media.test/dialogue-${number}.wav` }],
          imageUrl: `https://media.test/image-${number}.png`, imagePrompt: "Ari", narrationAudioUrl: `https://media.test/narration-${number}.wav`,
          musicUrl: number === 2 ? "https://media.test/music-2.wav" : null, musicPrompt: null, musicProvider: number === 2 ? "Legacy WAV Import" : null,
        })),
      }}), { status: 200 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  assert.equal((await saveVideoStudioToDatabase(flow)).success, true);
  assert.equal(savedBody.flowState.title, "Edited Film Title", "the editable title must be persisted");
  assert.equal(savedBody.scenes[0].title, "The observatory", "the editable script must win over a stale voice snapshot");
  assert.equal(savedBody.scenes[1].backgroundMusicProvider, "Legacy WAV Import", "existing stored WAV provenance must survive saving");

  const restored = await loadVideoStudioFromDatabase("project-a");
  assert.ok(restored?.script);
  assert.deepEqual(restored!.script!.scenes.map((item) => item.sceneNumber), [1, 2]);
  assert.equal(restored!.script!.title, "Edited Film Title");
  assert.equal(restored!.script!.scenes[0].backgroundMusicStatus, "silent");
  assert.equal(restored!.script!.scenes[1].backgroundMusicUrl, "https://media.test/music-2.wav");
  assert.equal(restored!.script!.scenes[0].narrationAudioUrl, "https://media.test/narration-1.wav");
  assert.equal(restored!.script!.scenes[0].dialogues[0].voiceProfile.deepgramModel, "aura-2-orion-en");

  const storyScene: StoryScene = {
    cast: [], chapter: "Chapter 1", location: "Moonlit bridge", mood: "Suspenseful", options: ["Protect it"], sceneNumber: 2,
    text: "Ari protects the memory on the bridge.", title: "The crossing", resultSummary: "Ari keeps the memory safe.",
    media: { audioMoodPrompt: "", backgroundMusicMood: "", imageLabel: "", imagePrompt: "", narrationDuration: "", narrationLabel: "", playerState: "ready" },
  };
  const facts = extractAtomicMemories(storyScene, "Protect it");
  assert.ok(facts.some((fact) => fact.type === "CHOICE"), "scene decisions must produce retrievable memory facts");
  const musicDecision = decideSceneMusic({ sceneTitle: "The crossing", mood: "Suspenseful", dialogueCount: 1 });
  assert.equal(musicDecision.outcome, "music");
  if (musicDecision.outcome === "music") assert.equal(musicDecision.category, "suspense");

  let requests = 0;
  const geminiResult = await fetchGeminiWithRetry({ request: async () => {
    requests += 1;
    return new Response(requests === 1 ? "busy" : "ok", { status: requests === 1 ? 503 : 200 });
  }, sleep: async () => undefined });
  assert.equal(geminiResult.status, 200);
  assert.equal(requests, 2, "temporary Gemini failure must make one bounded retry");

  globalThis.fetch = async () => new Response("save failed", { status: 500 });
  assert.equal((await saveVideoStudioToDatabase(flow)).success, false, "a failed save must be observable by the Studio retry UI");
} finally {
  globalThis.fetch = originalFetch;
  for (const temporaryPath of temporaryModules) rmSync(temporaryPath, { force: true });
}

console.log("Step 25F deterministic end-to-end integration fixture passed.");
