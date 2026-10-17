import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error Node's existing local TypeScript test runner requires the explicit extension.
import { buildStoryPreviewTimeline, VISUAL_ONLY_SCENE_DURATION_MS } from "../lib/story-preview-timeline.ts";
import type { MovieScene } from "../types/video.ts";

const dialogue = (id: string, audioUrl?: string) => ({
  id,
  character: "Ari",
  line: "A saved line.",
  delivery: "calm",
  voiceProfile: { archetype: "hero_male", character: "Ari", deepgramModel: "aura-asteria-en", description: "", gender: "male", tone: "calm", voiceName: "Ari" },
  ...(audioUrl ? { audioUrl } : {}),
});

const scene = (sceneNumber: number, overrides: Partial<MovieScene> = {}): MovieScene => ({
  persistenceSceneId: `scene-${sceneNumber}`,
  sceneNumber,
  title: `Scene ${sceneNumber}`,
  directorNotes: "",
  dialogues: [],
  estimatedDuration: "",
  imagePrompt: "",
  location: "",
  mood: "",
  narration: "",
  sceneGenre: "",
  sceneTone: "",
  soundDesign: "",
  visualPrompt: "",
  ...overrides,
});

const timeline = buildStoryPreviewTimeline([
  scene(3, {
    generatedImageUrl: "https://media.test/three.webp",
    narration: "Narration",
    narrationAudioUrl: "https://media.test/three-narration.mp3",
    dialogues: [dialogue("d3", "https://media.test/three-dialogue.mp3")],
    backgroundMusicUrl: "https://media.test/three.wav",
    backgroundMusicStatus: "completed",
  }),
  scene(1, { backgroundMusicStatus: "silent" }),
  scene(2, {
    narration: "Old narration",
    narrationAudioUrl: "https://media.test/old.mp3",
    narrationAudioOutdated: true,
    dialogues: [dialogue("d2")],
    backgroundMusicUrl: "https://media.test/old.wav",
    backgroundMusicStatus: "completed",
    backgroundMusicOutdated: true,
  }),
]);

assert.deepEqual(timeline.map((item) => item.sceneNumber), [3, 1, 2], "timeline preserves saved array order, not scene number");
assert.equal(timeline[0].id, "scene-3", "stable persistence identity is retained");
assert.deepEqual(timeline[0].clips.map((clip) => clip.kind), ["narration", "dialogue"], "narration plays before dialogue");
assert.equal(timeline[0].musicUrl, "https://media.test/three.wav", "scene-specific music is retained");
assert.equal(timeline[1].intentionallySilent, true, "intentional silence remains a valid no-music state");
assert.equal(timeline[1].musicUrl, undefined, "silent scenes never receive a music track");
assert.equal(timeline[1].fallbackDurationMs, VISUAL_ONLY_SCENE_DURATION_MS, "visual-only scenes receive a conservative duration");
assert.equal(timeline[2].clips.length, 0, "outdated narration is not treated as current playback audio");
assert.ok(timeline[2].outdated.includes("Narration audio"), "outdated narration is surfaced");
assert.ok(timeline[2].outdated.includes("Background music"), "outdated music is surfaced");
assert.ok(timeline[2].missing.some((item) => item.startsWith("Dialogue audio")), "missing dialogue is identified without blocking preview");

const failed = buildStoryPreviewTimeline([scene(4, {
  generatedImageStatus: "failed",
  narration: "A failed clip",
  dialogues: [{ ...dialogue("failed-line"), audioError: "decode failed" }],
  backgroundMusicStatus: "failed",
})])[0]!;
assert.ok(failed.missing.includes("Scene image failed"), "failed image is distinguished from a generic missing image");
assert.ok(failed.missing.some((item) => item.startsWith("Dialogue audio failed")), "failed dialogue is distinguished from a missing clip");
assert.ok(failed.missing.includes("Background music failed"), "failed music is distinguished from intentional silence");

const source = fs.readFileSync(path.resolve("components/synchronized-story-preview.tsx"), "utf8");
for (const marker of [
  "Play Complete Story",
  "Pause Story",
  "Restart",
  "clearTimers()",
  "projectKey",
  "fadeAudio",
  "DUCKED_MUSIC_VOLUME",
  "onended",
  "onerror",
  "playbackRunRef",
  "run !== playbackRunRef.current",
  "Invalidates delayed callbacks",
  "Outdated — regenerate recommended",
]) assert.ok(source.includes(marker), `preview contains ${marker}`);

console.log("Step 116 synchronized Story Preview deterministic tests passed.");
