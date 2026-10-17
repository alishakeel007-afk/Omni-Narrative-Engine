import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const narration = read("app/api/story/narrate/route.ts");
const image = read("app/api/video/image/route.ts");
const tts = read("app/api/video/tts/route.ts");
const videoGenerate = read("app/api/video/generate/route.ts");
const imageService = read("lib/image/image-service.ts");
const customAudio = read("screens/AudioGenerationScreen.tsx");
const legacyVoice = read("screens/VideoVoiceScreen.tsx");
const studio = read("screens/VideoStudioScreen.tsx");

// Saved media must be targeted and authorized before an external provider or
// Storage uploader can be reached. These assertions intentionally inspect the
// route boundary rather than invoking provider-backed code.
assert.match(narration, /Narration requires a valid saved draft and positive scene number/);
assert.match(narration, /getOwnedSceneMediaTarget[\s\S]{0,900}DEEPGRAM_TTS_ENDPOINT/);
assert.match(narration, /Project does not match the requested draft/);
assert.match(narration, /text\.length > MAX_NARRATION_CHARS/);

assert.match(image, /Browser-local previews must explicitly request transient media/);
assert.match(image, /Provide a valid draft and scene target for saved scene media/);
assert.ok(
  image.indexOf("await getOwnedSceneMediaTarget(") < image.indexOf("const result = await generateSceneImage"),
  "Image ownership resolution must occur before the provider call."
);
assert.match(image, /getOwnedSceneMediaTargetById/);
assert.match(image, /saveSceneImageById/);
assert.match(image, /Project does not match the requested draft/);
assert.match(image, /persist: !isTransient/);
assert.match(image, /MAX_CHARACTER_COUNT/);
assert.match(imageService, /params\.persist === false/);
assert.match(imageService, /data:\$\{generated\.contentType\};base64/);
assert.match(imageService, /MAX_TRANSIENT_IMAGE_BYTES/);

assert.match(tts, /Browser-local previews must explicitly request transient audio/);
assert.match(tts, /Provide matching projectId and draftId for saved video audio/);
assert.match(tts, /validateSubmittedScript/);
assert.match(tts, /MAX_SCENES/);
assert.match(tts, /MAX_DIALOGUE_LINES/);
assert.match(tts, /MAX_TRANSIENT_AUDIO_BYTES/);
assert.match(tts, /project: \{ userId: user\.id \}/);
assert.match(tts, /params\.persistent[\s\S]{0,250}uploadTtsAudioToStorage/);

// Persisted Video Studio and Custom projects remain scoped; genuinely
// browser-local callers explicitly use transient response data and therefore
// do not receive default-bucket objects.
assert.match(studio, /projectId: flow\.projectId, draftId: flow\.draftId/);
assert.match(studio, /draftId: flow\.draftId,[\s\S]{0,160}sceneNumber: scene\.sceneNumber/);
assert.match(studio, /persistenceSceneId: scene\.persistenceSceneId/);
assert.match(customAudio, /draft\.projectId && draft\.draftId \? \{ projectId: draft\.projectId, draftId: draft\.draftId \} : \{ transient: true \}/);
assert.match(customAudio, /customSceneId: scene\.id \} : \{ transient: true \}/);
assert.match(legacyVoice, /script, transient: true/);
assert.match(videoGenerate, /Inline audio generation is unavailable/);
assert.match(videoGenerate, /const includeAudio = false/);

console.log("Step 37 media API authorization and browser-local compatibility tests passed.");
