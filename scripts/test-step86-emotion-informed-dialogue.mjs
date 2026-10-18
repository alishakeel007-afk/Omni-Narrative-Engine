import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

// The repository intentionally has no runtime TypeScript test runner. Compile
// this dependency-only module in memory-compatible CommonJS for a deterministic
// offline test; its only import is type-only and is erased by TypeScript.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const sourcePath = resolve(process.cwd(), "lib/audio/emotion-informed-delivery.ts");
const temporaryModule = resolve(process.cwd(), ".tmp-step86-emotion-module.cjs");
try {
  const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  writeFileSync(temporaryModule, compiled, "utf8");
  const {
    DIALOGUE_EMOTIONS, deepgramSpeedForEmotion, elevenLabsTagForEmotion,
    formatDeepgramEmotionInformedText, formatElevenLabsEmotionInformedText,
    resolveDialogueEmotion,
  } = require(temporaryModule);

  const baseLine = { line: "We need to keep moving", delivery: "natural", voiceProfile: { tone: "neutral" } };
  const scene = { mood: "calm", sceneTone: "cinematic" };
  const explicitSamples = {
    sadness: "softly sorrowful", anger: "furious and forceful", fear: "frightened", happiness: "excited and joyful",
    affection: "warmly affectionate", suspense: "quiet and tense", urgency: "urgent", calmness: "calm and steady",
    confusion: "confused and hesitant", sarcasm: "dry and sarcastic", neutral: "natural",
  };
  for (const emotion of DIALOGUE_EMOTIONS) {
    assert.equal(resolveDialogueEmotion({ line: { ...baseLine, delivery: explicitSamples[emotion] }, scene: emotion === "neutral" ? { mood: "", sceneTone: "" } : scene }).emotion, emotion);
  }
  assert.deepEqual(
    resolveDialogueEmotion({ line: { ...baseLine, delivery: "natural", voiceProfile: { tone: "urgent and afraid" } }, scene: { mood: "angry", sceneTone: "tense" } }),
    { emotion: "urgency", source: "voice-tone" },
  );
  assert.equal(resolveDialogueEmotion({ line: { ...baseLine, delivery: "not angry, calm and steady" }, scene }).emotion, "calmness");
  assert.equal(resolveDialogueEmotion({ line: { ...baseLine, delivery: "natural" }, scene: { mood: "dark", sceneTone: "suspenseful" } }).emotion, "suspense");
  for (const emotion of DIALOGUE_EMOTIONS) assert.ok(deepgramSpeedForEmotion(emotion) >= 0.7 && deepgramSpeedForEmotion(emotion) <= 1.5);
  assert.equal(formatDeepgramEmotionInformedText("Stay close", "fear"), "Stay close...");
  assert.equal(formatDeepgramEmotionInformedText("Stay close!", "fear"), "Stay close!");
  assert.equal(formatElevenLabsEmotionInformedText("Do not leave me.", "sadness"), "[sighs] Do not leave me.");
  assert.equal(formatElevenLabsEmotionInformedText("I care about you.", "affection"), "I care about you.");
  assert.equal(formatElevenLabsEmotionInformedText("[shouts] Do not leave me.", "sadness"), "[sighs] (shouts) Do not leave me.");
  assert.equal(elevenLabsTagForEmotion("urgency"), undefined);
  const stableVoice = { tone: "tense", deepgramModel: "aura-2-orion-en" };
  resolveDialogueEmotion({ line: { ...baseLine, delivery: "fearful", voiceProfile: stableVoice }, scene });
  assert.equal(stableVoice.deepgramModel, "aura-2-orion-en", "emotion resolution must never change character voice identity");

  const ttsRoute = readFileSync(resolve(process.cwd(), "app/api/video/tts/route.ts"), "utf8");
  const urduProvider = readFileSync(resolve(process.cwd(), "lib/audio/elevenlabs-urdu-tts.ts"), "utf8");
  const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
  const persistence = readFileSync(resolve(process.cwd(), "lib/video-studio-db.ts"), "utf8");
  assert.match(ttsRoute, /url\.searchParams\.set\("speed"/);
  assert.match(ttsRoute, /resolveDeepgramVoiceModel/);
  assert.match(ttsRoute, /formatDeepgramEmotionInformedText/);
  assert.match(urduProvider, /formatElevenLabsEmotionInformedText/);
  assert.doesNotMatch(ttsRoute, /emotion["']\s*:/i);
  assert.match(studio, /Regenerate emotional delivery/);
  assert.match(persistence, /dialogueEmotions/);
  console.log("Step 86 emotion-informed dialogue tests passed.");
} finally {
  rmSync(temporaryModule, { force: true });
}
