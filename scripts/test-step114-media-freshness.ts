import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { collectVideoMediaFreshness, applyVideoMediaFreshness } from "../lib/video-media-freshness.ts";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { getSceneMediaReadiness } from "../lib/video-studio-readiness.ts";
import type { MovieScene } from "../types/video";

const scene = (patch: Partial<MovieScene> = {}): MovieScene => ({
  persistenceSceneId: "11111111-1111-4111-8111-111111111111",
  sceneNumber: 1, title: "Arrival", narration: "The gate opened.", location: "Gate", mood: "Tense",
  directorNotes: "Wide shot", sceneGenre: "Fantasy", sceneTone: "Tense", soundDesign: "Wind", visualPrompt: "A gate", imagePrompt: "A gate", estimatedDuration: "20 seconds",
  generatedImageUrl: "https://media.example/image.png", generatedImageStatus: "completed",
  narrationAudioUrl: "https://media.example/narration.mp3",
  backgroundMusicUrl: "https://media.example/music.wav", backgroundMusicStatus: "completed" as const,
  dialogues: [{ id: "line-a", character: "Ari", line: "Stay close.", delivery: "quiet", audioUrl: "https://media.example/line.mp3", voiceProfile: { archetype: "hero", character: "Ari", deepgramModel: "aura-2-orion-en", description: "", gender: "male", tone: "calm", voiceName: "Orion" } }],
  ...patch,
});

const fresh = scene();
assert.deepEqual(getSceneMediaReadiness(fresh), { image: "ready", narration: "ready", dialogue: "ready", music: "ready" });
assert.equal(getSceneMediaReadiness(scene({ dialogues: [{ ...fresh.dialogues[0], audioOutdated: true }] })).dialogue, "outdated", "a text or voice edit only stales that line");
assert.equal(getSceneMediaReadiness(scene({ narrationAudioOutdated: true })).narration, "outdated");
assert.equal(getSceneMediaReadiness(scene({ generatedImageOutdated: true })).image, "outdated");
assert.equal(getSceneMediaReadiness(scene({ backgroundMusicOutdated: true })).music, "outdated");
assert.equal(getSceneMediaReadiness(scene({ backgroundMusicOutdated: true, backgroundMusicStatus: "silent", backgroundMusicUrl: undefined })).music, "not_required", "intentional silence stays valid");
assert.equal(getSceneMediaReadiness(scene({ generatedImageOutdated: false, dialogues: fresh.dialogues })).dialogue, "ready", "unrelated visual edits do not stale audio");

const freshness = collectVideoMediaFreshness([scene({ generatedImageOutdated: true, narrationAudioOutdated: true, backgroundMusicOutdated: true, dialogues: [{ ...fresh.dialogues[0], audioOutdated: true }] })]);
assert.deepEqual(freshness, { "11111111-1111-4111-8111-111111111111": { image: true, narration: true, music: true, dialogueIndices: [0] } });
const restored = applyVideoMediaFreshness(scene({ sceneNumber: 9 }), freshness["11111111-1111-4111-8111-111111111111"] as Parameters<typeof applyVideoMediaFreshness>[1]);
assert.equal(restored.sceneNumber, 9, "freshness uses stable persistence ID, not display order");
assert.equal(restored.dialogues[0].audioOutdated, true);

const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
const database = readFileSync(resolve(process.cwd(), "lib/video-studio-db.ts"), "utf8");
for (const expected of ["narrationAudioOutdated: true", "generatedImageOutdated: true", "backgroundMusicOutdated", "audioOutdated: true", "Outdated — Regenerate recommended"]) {
  assert.ok(studio.includes(expected), `missing invalidation/UI contract: ${expected}`);
}
assert.ok(database.includes("collectVideoMediaFreshness(script.scenes)"), "freshness must persist with the saved draft");
assert.ok(database.includes("applyVideoMediaFreshness"), "freshness must restore with saved scenes");

console.log("Step 114 media freshness dependency, persistence, silence, and readiness tests passed.");
