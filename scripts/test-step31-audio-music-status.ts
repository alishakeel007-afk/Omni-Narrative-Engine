import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { summarizeVideoAudio, summarizeVideoMusic, videoAudioStatus, videoMusicStatus } from "../lib/video-studio-media-summary.ts";
import type { MovieScene } from "../types/video";

const scene = (patch: Partial<MovieScene> = {}): MovieScene => ({
  sceneNumber: 1, title: "Fixture", narration: "A narrator speaks.", location: "Tower", mood: "Tense",
  directorNotes: "", sceneGenre: "Fantasy", sceneTone: "Cinematic", soundDesign: "Wind", visualPrompt: "Tower", imagePrompt: "Tower", estimatedDuration: "15 seconds",
  dialogues: [{ id: "line-1", character: "Ari", line: "Stay close.", delivery: "quiet", voiceProfile: { archetype: "hero", character: "Ari", deepgramModel: "aura", description: "", gender: "male", tone: "calm", voiceName: "Orion" } }],
  ...patch,
});

const restored = [
  scene({ narrationAudioUrl: "https://media.example/narration.mp3", dialogues: [{ ...scene().dialogues[0], audioUrl: "https://media.example/ari.wav" }], backgroundMusicStatus: "silent" }),
  scene({ sceneNumber: 2, narration: "", dialogues: [{ ...scene().dialogues[0], id: "line-2", line: "", audioUrl: "https://media.example/placeholder.mp3" }], backgroundMusicUrl: "https://media.example/music.wav", backgroundMusicStatus: "completed" }),
];
const restoredAudio = summarizeVideoAudio(restored);
assert.deepEqual(restoredAudio, { dialogueLines: 1, dialogueClips: 1, narrationRequired: 1, narrationClips: 1, failedDialogueLines: 0, missingDialogueClips: 0, missingNarrationClips: 0, outdatedDialogueClips: 0, outdatedNarrationClips: 0, totalClips: 2 });
assert.equal(videoAudioStatus(restoredAudio, false), "Ready");
assert.equal(videoAudioStatus(restoredAudio, true), "Needs regeneration");

const missing = summarizeVideoAudio([scene({ narrationAudioUrl: undefined, dialogues: [{ ...scene().dialogues[0], audioUrl: undefined }] })]);
assert.equal(videoAudioStatus(missing, false), "Not generated");
const failed = summarizeVideoAudio([scene({ narration: "", dialogues: [{ ...scene().dialogues[0], audioUrl: "https://media.example/old.wav", audioError: "Provider failed" }] })]);
assert.equal(failed.dialogueClips, 0);
assert.equal(videoAudioStatus(failed, false), "Audio failed");
const outdated = summarizeVideoAudio([scene({ narrationAudioOutdated: true, dialogues: [{ ...scene().dialogues[0], audioUrl: "https://media.example/old.wav", audioOutdated: true }] })]);
assert.equal(outdated.outdatedDialogueClips, 1);
assert.equal(outdated.outdatedNarrationClips, 1);
assert.equal(videoAudioStatus(outdated, false), "Audio outdated");

const noMusic = summarizeVideoMusic([scene({ narration: "", dialogues: [], backgroundMusicStatus: "unavailable" })]);
assert.deepEqual(noMusic, { availableTracks: 0, intentionalSilence: 0, unavailable: 1, failed: 0, outdated: 0 });
assert.equal(videoMusicStatus(noMusic), "No music tracks imported");
assert.equal(videoMusicStatus(summarizeVideoMusic([scene({ narration: "", dialogues: [], backgroundMusicStatus: "silent" })])), "Intentional silence");
assert.equal(videoMusicStatus(summarizeVideoMusic([scene({ narration: "", dialogues: [], backgroundMusicStatus: "completed", backgroundMusicUrl: "https://media.example/imported.wav" })])), "1 track available");
assert.equal(videoMusicStatus(summarizeVideoMusic([scene({ narration: "", dialogues: [], backgroundMusicStatus: "completed", backgroundMusicUrl: "https://media.example/imported.wav", backgroundMusicOutdated: true })])), "Music outdated");

const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
const preview = readFileSync(resolve(process.cwd(), "screens/VideoPreviewScreen.tsx"), "utf8");
for (const expected of ["summarizeVideoAudio", "Dialogue clips", "Narration clips", "Music availability", "videoAudioStatus", "videoMusicStatus"]) {
  assert.ok(`${studio}\n${preview}`.includes(expected), `missing Step 31 UI contract: ${expected}`);
}

console.log("Step 31 persisted audio/music status, restoration, silence, and import summary tests passed.");
