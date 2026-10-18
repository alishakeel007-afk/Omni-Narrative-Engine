import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const temporaryModules = [];

function loadTypeOnlyModule(relativePath, replacements = []) {
  const sourcePath = resolve(process.cwd(), relativePath);
  let source = readFileSync(sourcePath, "utf8");
  for (const [from, to] of replacements) source = source.replace(from, to);
  const temporaryPath = resolve(process.cwd(), `.tmp-step89-${temporaryModules.length}.cjs`);
  temporaryModules.push(temporaryPath);
  writeFileSync(temporaryPath, ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, "utf8");
  return require(temporaryPath);
}

try {
  const language = loadTypeOnlyModule("lib/video-language.ts");
  const urduScript = {
    title: "خاموش دروازہ",
    logline: "ایک نوجوان خوف کے باوجود دروازہ کھولتا ہے۔",
    scenes: [{ narration: "رات کے وقت شہر خاموش ہو جاتا ہے۔", dialogues: [{ line: "ہمیں ابھی جانا ہوگا۔" }] }],
  };
  assert.equal(language.textDirectionForVideoLanguage("ur"), "rtl");
  assert.equal(language.containsUrduScript(urduScript.title), true);
  assert.equal(language.validateUrduAudienceScript(urduScript), null);
  assert.match(language.validateUrduAudienceScript({ ...urduScript, title: "Silent Gate", logline: "A story", scenes: [{ narration: "The city sleeps.", dialogues: [{ line: "We must go." }] }] }), /Roman Urdu or English-only/);
  assert.equal(JSON.parse(JSON.stringify(urduScript)).scenes[0].dialogues[0].line, "ہمیں ابھی جانا ہوگا۔", "Unicode must survive JSON persistence");

  const emotion = loadTypeOnlyModule("lib/audio/emotion-informed-delivery.ts");
  const baseLine = { line: "میں بہت اداس ہوں", delivery: "natural", voiceProfile: { tone: "neutral" } };
  assert.equal(emotion.resolveDialogueEmotion({ line: baseLine, scene: { mood: "", sceneTone: "" } }).emotion, "sadness");
  assert.equal(emotion.resolveDialogueEmotion({ line: { ...baseLine, delivery: "urgent" }, scene: { mood: "", sceneTone: "" } }).emotion, "urgency", "explicit delivery remains higher priority");
  assert.equal(emotion.formatElevenLabsEmotionInformedText("[shouts] مجھے مت چھوڑو", "sadness"), "[sighs] (shouts) مجھے مت چھوڑو");

  const urduTts = loadTypeOnlyModule("lib/audio/elevenlabs-urdu-tts.ts", [
    [/import type \{ MovieCharacterVoice \} from "@\/types\/video";\r?\n/, ""],
    [/import \{ getEnvValue \} from "@\/lib\/env";\r?\n/, "const getEnvValue = (keys) => process.env[keys[0]];\n"],
    [/import \{ formatElevenLabsEmotionInformedText, type DialogueEmotion \} from "@\/lib\/audio\/emotion-informed-delivery";\r?\n/, "const formatElevenLabsEmotionInformedText = (text) => text;\n"],
  ]);
  assert.equal(urduTts.getUrduVoiceEnvironmentName("hero_male"), "ELEVENLABS_URDU_HERO_MALE_VOICE_ID");
  assert.equal(urduTts.getUrduVoiceEnvironmentName("narrator"), "ELEVENLABS_URDU_NARRATOR_VOICE_ID");
  assert.throws(() => urduTts.resolveUrduElevenLabsVoice({ archetype: "hero_female" }), /ELEVENLABS_URDU_HERO_FEMALE_VOICE_ID/);
  process.env.ELEVENLABS_URDU_HERO_MALE_VOICE_ID = "test-voice-only";
  assert.equal(urduTts.resolveUrduElevenLabsVoice({ archetype: "hero_male" }).archetype, "hero_male");
  delete process.env.ELEVENLABS_URDU_HERO_MALE_VOICE_ID;
  assert.equal(urduTts.isPlausibleMp3Audio(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]).buffer), true);
  assert.equal(urduTts.isPlausibleMp3Audio(new Uint8Array([0xff, 0xfb, 0x90, 0x64]).buffer), true);
  assert.equal(urduTts.isPlausibleMp3Audio(new Uint8Array([1, 2, 3, 4]).buffer), false);

  const ttsRoute = readFileSync(resolve(process.cwd(), "app/api/video/tts/route.ts"), "utf8");
  const saveRoute = readFileSync(resolve(process.cwd(), "app/api/story/[projectId]/video/save/route.ts"), "utf8");
  const storyDatabase = readFileSync(resolve(process.cwd(), "lib/story-database.ts"), "utf8");
  const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
  const storage = readFileSync(resolve(process.cwd(), "lib/video-storage.ts"), "utf8");
  const preview = readFileSync(resolve(process.cwd(), "components/preview-final-audio-button.tsx"), "utf8");
  const previewScreen = readFileSync(resolve(process.cwd(), "screens/VideoPreviewScreen.tsx"), "utf8");
  const legacyVoice = readFileSync(resolve(process.cwd(), "screens/VideoVoiceScreen.tsx"), "utf8");
  const localAudio = readFileSync(resolve(process.cwd(), "screens/AudioGenerationScreen.tsx"), "utf8");
  assert.match(ttsRoute, /scriptLanguage !== language/);
  assert.match(ttsRoute, /validateUrduAudienceScript/);
  // The route authorizes and delegates persistence; provider attribution is
  // now intentionally owned by the transactional database reconciliation.
  assert.match(saveRoute, /reconcileVideoStudioScenes/);
  assert.match(storyDatabase, /params\.flowState\.scriptLanguage === "ur" \? "ElevenLabs Eleven v3" : "Deepgram TTS"/);
  assert.match(studio, /scriptLanguage: flow\.language/);
  assert.match(studio, /Language changed after this script was generated/);
  assert.match(studio, /dir=\{rtl \? "rtl" : undefined\}/);
  assert.match(storage, /scriptLanguage\?: VideoLanguage/);
  assert.match(preview, /scene\.narrationAudioUrl/);
  assert.match(preview, /dialogue\.audioUrl/);
  assert.match(previewScreen, /textDirectionForVideoLanguage\(videoFlow\.language\)/);
  assert.match(legacyVoice, /scriptLanguage: "en"/);
  assert.match(localAudio, /language: draft\.language/);
  assert.match(localAudio, /scriptLanguage: draft\.language/, "Custom audio requests must preserve the authored language rather than hard-coding English");
  console.log("Step 89 Urdu Video Studio integration tests passed.");
} finally {
  for (const temporaryPath of temporaryModules) rmSync(temporaryPath, { force: true });
}
