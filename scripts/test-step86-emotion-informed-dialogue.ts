import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const emotionModule = await import(new URL("../lib/audio/emotion-informed-delivery.ts", import.meta.url).href);
const {
  DIALOGUE_EMOTIONS,
  deepgramSpeedForEmotion,
  elevenLabsTagForEmotion,
  formatDeepgramEmotionInformedText,
  formatElevenLabsEmotionInformedText,
  resolveDialogueEmotion,
} = emotionModule;

const baseLine = { line: "We need to keep moving", delivery: "natural", voiceProfile: { tone: "neutral" } };
const scene = { mood: "calm", sceneTone: "cinematic" };

const explicitSamples: Record<(typeof DIALOGUE_EMOTIONS)[number], string> = {
  sadness: "softly sorrowful", anger: "furious and forceful", fear: "frightened", happiness: "excited and joyful",
  affection: "warmly affectionate", suspense: "quiet and tense", urgency: "urgent", calmness: "calm and steady",
  confusion: "confused and hesitant", sarcasm: "dry and sarcastic", neutral: "natural",
};
for (const emotion of DIALOGUE_EMOTIONS) {
  const result = resolveDialogueEmotion({ line: { ...baseLine, delivery: explicitSamples[emotion] }, scene: emotion === "neutral" ? { mood: "", sceneTone: "" } : scene });
  assert.equal(result.emotion, emotion, `must resolve ${emotion}`);
}

assert.deepEqual(
  resolveDialogueEmotion({ line: { ...baseLine, delivery: "natural", voiceProfile: { tone: "urgent and afraid" } }, scene: { mood: "angry", sceneTone: "tense" } }),
  { emotion: "urgency", source: "voice-tone" },
  "line voiceTone must outrank scene mood, while explicit delivery is still considered first"
);
assert.equal(
  resolveDialogueEmotion({ line: { ...baseLine, delivery: "not angry, calm and steady" }, scene }).emotion,
  "calmness",
  "negated emotional descriptors must not win inference"
);
assert.equal(resolveDialogueEmotion({ line: { ...baseLine, delivery: "natural" }, scene: { mood: "dark", sceneTone: "suspenseful" } }).emotion, "suspense");
assert.equal(resolveDialogueEmotion({ line: { ...baseLine, delivery: "urgent" }, scene }).emotion, "urgency");

for (const emotion of DIALOGUE_EMOTIONS) {
  const speed = deepgramSpeedForEmotion(emotion);
  assert.ok(speed >= 0.7 && speed <= 1.5, `${emotion} speed must be inside Deepgram's documented range`);
}
assert.equal(formatDeepgramEmotionInformedText("Stay close", "fear"), "Stay close...");
assert.equal(formatDeepgramEmotionInformedText("Stay close!", "fear"), "Stay close!", "existing punctuation must remain unchanged");
assert.equal(formatElevenLabsEmotionInformedText("Do not leave me.", "sadness"), "[sighs] Do not leave me.");
assert.equal(formatElevenLabsEmotionInformedText("I care about you.", "affection"), "I care about you.", "unsupported tags must not be invented");
assert.equal(formatElevenLabsEmotionInformedText("[shouts] Do not leave me.", "sadness"), "[sighs] (shouts) Do not leave me.", "untrusted inline tags must not reach ElevenLabs");
assert.equal(elevenLabsTagForEmotion("urgency"), undefined, "no uncontrolled tag injection for unsupported delivery");

const original = "[shouts] This remains author text.";
assert.equal(formatDeepgramEmotionInformedText(original, "calmness"), original, "original dialogue text is never stripped or rewritten");

const ttsRoute = readFileSync(resolve(process.cwd(), "app/api/video/tts/route.ts"), "utf8");
const urduProvider = readFileSync(resolve(process.cwd(), "lib/audio/elevenlabs-urdu-tts.ts"), "utf8");
assert.match(ttsRoute, /url\.searchParams\.set\("speed"/);
assert.match(ttsRoute, /resolveDeepgramVoiceModel/);
assert.match(ttsRoute, /formatDeepgramEmotionInformedText/);
assert.match(urduProvider, /formatElevenLabsEmotionInformedText/);
assert.match(urduProvider, /model_id: ELEVENLABS_URDU_MODEL/);
assert.doesNotMatch(ttsRoute, /emotion["']\s*:/i, "Deepgram request must not invent an unsupported emotion parameter");

console.log("Step 86 emotion-informed dialogue tests passed.");
