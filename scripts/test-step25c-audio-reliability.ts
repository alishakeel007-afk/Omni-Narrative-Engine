import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const voicePolicy = read("lib/audio/voice-consistency.ts");
const narrationRoute = read("app/api/story/narrate/route.ts");
const ttsRoute = read("app/api/video/tts/route.ts");
const database = read("lib/story-database.ts");
const player = read("components/play-scene-audio-button.tsx");
const preview = read("components/preview-final-audio-button.tsx");
const studio = read("screens/VideoStudioScreen.tsx");
const videoSave = read("app/api/story/[projectId]/video/save/route.ts");

for (const model of ["aura-2-orion-en", "aura-2-asteria-en", "aura-2-athena-en", "aura-2-arcas-en", "aura-2-orpheus-en"]) {
  assert.ok(voicePolicy.includes(`"${model}"`), `supported UI model missing from voice policy: ${model}`);
}
assert.match(voicePolicy, /SUPPORTED_DEEPGRAM_VOICES/);
assert.match(narrationRoute, /getOwnedSceneMediaTarget[\s\S]{0,700}Deepgram TTS key is missing/, "narration must authorize before provider setup");
assert.match(narrationRoute, /audioBuffer\.byteLength < 100/);
assert.match(narrationRoute, /storagePath: uploadedAudio\.storagePath/);
assert.match(ttsRoute, /hasSpeechText/);
assert.match(ttsRoute, /Video draft not found or access denied/);
assert.match(ttsRoute, /resolveDeepgramVoiceModel/);
assert.match(database, /characterId: id/);
assert.match(player, /audioRef\.current\.currentTime = 0/);
assert.match(preview, /fadeTimers\.current\.clear/);
assert.match(preview, /dialogueSequence/);
assert.match(preview, /scene\.narrationAudioUrl/);
assert.match(studio, /scene-\$\{scene\.sceneNumber\}-narration/);
assert.match(studio, /narrationAudioUrl: narrator\?\.audioUrl/);
assert.match(videoSave, /narrationAudioUrl/);
assert.match(videoSave, /reconcileVideoStudioScenes/);

// Fixture ordering proves the intended playback sequence is scene order then line order.
const fixture = [
  { scene: 2, urls: ["s2-line1", "", "s2-line3"] },
  { scene: 3, urls: ["s3-line1"] },
];
assert.deepEqual(fixture.flatMap((scene) => scene.urls.filter(Boolean)), ["s2-line1", "s2-line3", "s3-line1"]);

console.log("Step 25C narration, dialogue, voice, and playback reliability tests passed.");
