import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const temporaryPath = resolve(process.cwd(), ".tmp-step108-urdu-voice-fallback.cjs");
const keys = [
  "ELEVENLABS_URDU_NARRATOR_VOICE_ID",
  "ELEVENLABS_URDU_HERO_MALE_VOICE_ID",
  "ELEVENLABS_URDU_HERO_FEMALE_VOICE_ID",
  "ELEVENLABS_URDU_VILLAIN_MALE_VOICE_ID",
];
const previous = new Map(keys.map((key) => [key, process.env[key]]));

function loadProvider() {
  let source = readFileSync(resolve(process.cwd(), "lib/audio/elevenlabs-urdu-tts.ts"), "utf8");
  source = source
    .replace(/import type \{ MovieCharacterVoice \} from "@\/types\/video";\r?\n/, "")
    .replace(/import \{ getEnvValue \} from "@\/lib\/env";\r?\n/, "const getEnvValue = (keys) => process.env[keys[0]];\n")
    .replace(/import \{ formatElevenLabsEmotionInformedText, type DialogueEmotion \} from "@\/lib\/audio\/emotion-informed-delivery";\r?\n/, "const formatElevenLabsEmotionInformedText = (text) => text;\n");
  writeFileSync(temporaryPath, ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, "utf8");
  return require(temporaryPath);
}

try {
  for (const key of keys) delete process.env[key];
  process.env.ELEVENLABS_URDU_NARRATOR_VOICE_ID = "narrator-base";
  process.env.ELEVENLABS_URDU_HERO_MALE_VOICE_ID = "male-base";
  process.env.ELEVENLABS_URDU_HERO_FEMALE_VOICE_ID = "female-base";
  const provider = loadProvider();

  const maleArchetypes = ["hero_male", "villain_male", "mentor_male", "elder_male", "young_male", "neutral_male"];
  for (const archetype of maleArchetypes) {
    const resolved = provider.resolveUrduElevenLabsVoice({ archetype, gender: "masculine" });
    assert.equal(resolved.archetype, archetype);
    assert.equal(resolved.voiceId, "male-base");
  }

  const femaleArchetypes = ["hero_female", "villain_female", "mentor_female", "elder_female", "young_female", "neutral_female"];
  for (const archetype of femaleArchetypes) {
    const resolved = provider.resolveUrduElevenLabsVoice({ archetype, gender: "feminine" });
    assert.equal(resolved.archetype, archetype);
    assert.equal(resolved.voiceId, "female-base");
  }

  assert.equal(provider.resolveUrduElevenLabsVoice({ archetype: "narrator", gender: "feminine" }).voiceId, "narrator-base");
  assert.equal(provider.resolveUrduElevenLabsVoice({ archetype: "child", gender: "feminine" }).voiceId, "female-base");
  assert.equal(provider.resolveUrduElevenLabsVoice({ archetype: "creature_robot", gender: "masculine" }).voiceId, "male-base");
  assert.throws(() => provider.resolveUrduElevenLabsVoice({ archetype: "child", gender: "unknown" }), /ELEVENLABS_URDU_CHILD_VOICE_ID/);
  assert.throws(() => provider.resolveUrduElevenLabsVoice({ archetype: "creature_robot", gender: "" }), /ELEVENLABS_URDU_CREATURE_ROBOT_VOICE_ID/);

  process.env.ELEVENLABS_URDU_VILLAIN_MALE_VOICE_ID = "explicit-villain";
  assert.equal(provider.resolveUrduElevenLabsVoice({ archetype: "villain_male", gender: "masculine" }).voiceId, "explicit-villain");
  delete process.env.ELEVENLABS_URDU_HERO_MALE_VOICE_ID;
  assert.throws(() => provider.resolveUrduElevenLabsVoice({ archetype: "mentor_male", gender: "masculine" }), /ELEVENLABS_URDU_HERO_MALE_VOICE_ID/);
  delete process.env.ELEVENLABS_URDU_NARRATOR_VOICE_ID;
  assert.throws(() => provider.resolveUrduElevenLabsVoice({ archetype: "narrator", gender: "masculine" }), /ELEVENLABS_URDU_NARRATOR_VOICE_ID/);

  console.log("Step 108 Urdu voice fallback tests passed.");
} finally {
  rmSync(temporaryPath, { force: true });
  for (const key of keys) {
    const value = previous.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
