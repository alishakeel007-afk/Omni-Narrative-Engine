import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { getSceneMediaReadiness, validateSceneMedia } from "../lib/video-studio-readiness.ts";
import type { MovieScene } from "../types/video";

const scene = (patch: Partial<MovieScene> = {}): MovieScene => ({
  sceneNumber: 1, title: "Validation fixture", narration: "The narrator speaks.", location: "Tower", mood: "Tense",
  directorNotes: "", sceneGenre: "Fantasy", sceneTone: "Cinematic", soundDesign: "Wind", visualPrompt: "Tower", imagePrompt: "Tower", estimatedDuration: "15 seconds",
  dialogues: [{ id: "line-1", character: "Ari", line: "Stay close.", delivery: "quiet", voiceProfile: { archetype: "hero", character: "Ari", deepgramModel: "aura-2-orion-en", description: "", gender: "male", tone: "calm", voiceName: "Orion" } }],
  ...patch,
});

const complete = scene({
  generatedImageUrl: "https://media.example/scene.png", generatedImageStatus: "completed",
  narrationAudioUrl: "https://media.example/narration.mp3",
  dialogues: [{ ...scene().dialogues[0], audioUrl: "https://media.example/line.wav", audioMimeType: "audio/wav" }],
  backgroundMusicStatus: "silent",
});
assert.equal(validateSceneMedia(complete).status, "ready");
assert.equal(validateSceneMedia(complete).remoteAvailability, "unverified");

const completedWithoutUrl = scene({ generatedImageStatus: "completed", backgroundMusicStatus: "completed" });
const completedWithoutUrlReadiness = getSceneMediaReadiness(completedWithoutUrl);
assert.equal(completedWithoutUrlReadiness.image, "missing", "A completed image status without a URL is not ready.");
assert.equal(completedWithoutUrlReadiness.music, "missing", "A completed music status without a URL is not ready.");
assert.equal(validateSceneMedia(completedWithoutUrl).status, "needs_attention");

const missing = validateSceneMedia(scene());
assert.equal(missing.status, "needs_attention");
assert.ok(missing.issues.some((issue) => issue.includes("Scene image is missing")));
assert.ok(missing.issues.some((issue) => issue.includes("Narration audio is missing")));
assert.ok(missing.issues.some((issue) => issue.includes("Dialogue audio is missing")));
assert.ok(missing.issues.some((issue) => issue.includes("Background music")));

// Stages 4–7 must only flag assets the user can act on in that stage. The
// complete validator remains the Stage 8 / final-preview contract.
const authoring = validateSceneMedia(scene(), "authoring");
assert.equal(authoring.status, "ready", "Stage 4 must not demand future-stage media");
assert.deepEqual(authoring.issues, []);
const voiceOnly = validateSceneMedia(scene(), "voice");
assert.ok(voiceOnly.issues.some((issue) => issue.includes("Narration audio is missing")));
assert.ok(voiceOnly.issues.some((issue) => issue.includes("Dialogue audio is missing")));
assert.ok(voiceOnly.issues.every((issue) => !issue.includes("Scene image") && !issue.includes("Background music")));
const imageOnly = validateSceneMedia(scene(), "image");
assert.deepEqual(imageOnly.issues, ["Scene image is missing."]);
const musicOnly = validateSceneMedia(scene(), "music");
assert.deepEqual(musicOnly.issues, ["Background music is required for this scene but is missing."]);
const staleAuthoring = validateSceneMedia(scene({
  generatedImageUrl: "https://media.example/old.png", generatedImageOutdated: true,
  narrationAudioUrl: "https://media.example/old.mp3", narrationAudioOutdated: true,
  dialogues: [{ ...scene().dialogues[0], audioUrl: "https://media.example/old-line.mp3", audioOutdated: true }],
  backgroundMusicUrl: "https://media.example/old.wav", backgroundMusicOutdated: true,
}), "authoring");
assert.equal(staleAuthoring.status, "needs_attention", "Stage 4 must retain stale-media warnings after a revisit");
assert.equal(staleAuthoring.issues.length, 4);

assert.equal(validateSceneMedia(scene({ dialogues: [], narration: "", backgroundMusicStatus: "silent", generatedImageUrl: "https://media.example/image.webp" })).status, "ready");
assert.equal(validateSceneMedia(scene({ generatedImageUrl: "not a url", narration: "", dialogues: [], backgroundMusicStatus: "silent" })).status, "needs_attention");
assert.ok(validateSceneMedia(scene({ generatedImageUrl: "https://media.example/image.gif", narration: "", dialogues: [], backgroundMusicStatus: "silent" })).issues.some((issue) => issue.includes("unsupported format")));
assert.equal(validateSceneMedia(scene({ generatedImageUrl: "https://media.example/generated", narration: "", dialogues: [], backgroundMusicStatus: "silent" })).status, "unavailable");
assert.ok(validateSceneMedia(scene({ generatedImageStatus: "failed", narration: "", dialogues: [], backgroundMusicStatus: "failed" })).issues.some((issue) => issue.includes("generation failed")));

const sceneOne = validateSceneMedia(complete);
const sceneTwo = validateSceneMedia(scene({ narration: "", dialogues: [], backgroundMusicStatus: "silent" }));
assert.equal(sceneOne.status, "ready", "scene validation must not read another scene's assets");
assert.equal(sceneTwo.status, "needs_attention");

const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
const readiness = readFileSync(resolve(process.cwd(), "lib/video-studio-readiness.ts"), "utf8");
for (const expected of ["validateSceneMedia", "authoring", "Previously generated media", "hasUsableMediaReference", "Validation: ", "Needs attention", "Validation unavailable", "Remote availability is unverified", "new URL(value)", "backgroundMusicStatus === \"silent\"", "saveState === \"failed\""]) {
  assert.ok(`${studio}\n${readiness}`.includes(expected), `missing Step 29 validation contract: ${expected}`);
}

console.log("Step 29 scene media validation, intentional silence, malformed URL, and isolation tests passed.");
