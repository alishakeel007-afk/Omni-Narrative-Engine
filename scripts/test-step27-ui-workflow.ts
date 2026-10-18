import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { getSceneMediaReadiness } from "../lib/video-studio-readiness.ts";
import type { MovieScene } from "../types/video";

const scene = (patch: Partial<MovieScene> = {}): MovieScene => ({
  sceneNumber: 1, title: "Test scene", narration: "A narrator describes the action.", location: "Workshop", mood: "Tense",
  directorNotes: "Keep focus on the device.", sceneGenre: "Sci-Fi", sceneTone: "Cinematic", soundDesign: "Quiet machinery.",
  visualPrompt: "A workshop", imagePrompt: "A workshop", estimatedDuration: "20 seconds", dialogues: [{
    id: "line-1", character: "Ari", line: "We should go.", delivery: "calm",
    voiceProfile: { archetype: "hero", character: "Ari", deepgramModel: "aura-2-orion-en", description: "Warm", gender: "masculine", tone: "calm", voiceName: "Orion" },
  }],
  ...patch,
});

assert.deepEqual(getSceneMediaReadiness(scene()), { image: "missing", narration: "missing", dialogue: "missing", music: "missing" });
assert.deepEqual(getSceneMediaReadiness(scene({
  generatedImageUrl: "https://example.test/image.png", narrationAudioUrl: "https://example.test/narration.wav",
  dialogues: [{ ...scene().dialogues[0], audioUrl: "https://example.test/line.wav" }], backgroundMusicStatus: "silent",
})), { image: "ready", narration: "ready", dialogue: "ready", music: "not_required" });
assert.equal(getSceneMediaReadiness(scene({ dialogues: [], narration: "", backgroundMusicStatus: "generating" })).dialogue, "not_required");
assert.equal(getSceneMediaReadiness(scene({ generatedImageStatus: "failed", backgroundMusicStatus: "failed" })).image, "failed");
assert.equal(getSceneMediaReadiness(scene({ generatedImageStatus: "generating" })).image, "generating");

const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
for (const expected of [
  "Media readiness", "Intentional silence", "aria-current={isCurrent ? \"step\" : undefined}",
  "You are in", "saveChainRef", "Project save failed", "isGeneratingImages", "isGeneratingVoice", "isGeneratingMusic",
  "label=\"Stage 6\"", "label=\"Stage 7\"", "label=\"Stage 8\"",
]) assert.ok(studio.includes(expected), `missing workflow UI contract: ${expected}`);

console.log("Step 27 UI workflow, readiness, silence, loading, and save-state tests passed.");
