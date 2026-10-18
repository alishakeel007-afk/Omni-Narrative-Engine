import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Focused Node tests load the TypeScript helper directly.
import { prepareCustomDraftForPersistence } from "../lib/custom-story-persistence.ts";

const draft = {
  clientImportId: "custom-import-regression",
  language: "en" as const,
  storyTitle: "Safe local draft",
  genres: ["Fantasy"], tones: ["Hopeful"], includeNarration: true, numberOfScenes: 1,
  selectedMode: "create-your-own" as const, updatedAt: new Date().toISOString(),
  characters: [{ id: "hero", name: "Hero", role: "Hero", personalityTone: "Brave", voiceStyle: "Warm male" }],
  audio: { voiceStatus: "ready" as const, voiceMessage: "Preview ready", backgroundMusicStatus: "idle" as const, backgroundMusicMessage: "No music" },
  visuals: { status: "ready" as const, message: "Preview ready" },
  video: { status: "idle" as const, message: "Not rendered" },
  scenes: [{
    id: "scene-local", sceneNumber: 1, title: "Opening", storyDescription: "A beginning.", selectedSuggestion: "",
    sceneGenre: "Fantasy", sceneTone: "Hopeful", activeCharacterIds: ["hero"], suggestions: [],
    generatedImageUrl: "data:image/png;base64," + "a".repeat(8_000), generatedImageStatus: "ready" as const,
    narrationAudioUrl: "data:audio/mpeg;base64," + "b".repeat(8_000),
    backgroundMusicUrl: "https://storage.example/music.wav", backgroundMusicStatus: "ready" as const,
    dialogues: [
      { id: "line-local", characterId: "hero", characterName: "Hero", text: "We begin.", audioUrl: "blob:https://app.example/preview" },
      { id: "line-saved", characterId: "hero", characterName: "Hero", text: "Saved line.", audioUrl: "https://storage.example/line.mp3" },
    ],
  }],
};

const prepared = prepareCustomDraftForPersistence(draft);
const scene = prepared.draft.scenes[0]!;
assert.equal(prepared.omittedTransientMedia, true, "browser-only previews must be identified");
assert.equal(scene.generatedImageUrl, undefined, "large transient image URLs must not fail project save validation");
assert.equal(scene.generatedImageStatus, "idle", "an omitted transient image must not appear saved or ready");
assert.equal(scene.narrationAudioUrl, undefined, "transient narration must not be persisted as a fake durable reference");
assert.equal(scene.dialogues[0]!.audioUrl, undefined, "transient dialogue must not be persisted");
assert.equal(scene.dialogues[1]!.audioUrl, "https://storage.example/line.mp3", "existing durable dialogue media must be retained");
assert.equal(scene.backgroundMusicUrl, "https://storage.example/music.wav", "existing durable music must be retained");

const client = readFileSync(resolve(process.cwd(), "lib/custom-story-db.ts"), "utf8");
const builder = readFileSync(resolve(process.cwd(), "screens/StoryBuilderScreen.tsx"), "utf8");
assert.match(client, /prepareCustomDraftForPersistence\(draft\)/, "the save request must sanitize browser-only media");
assert.match(client, /saveErrorForStatus/, "failed API responses must surface a safe diagnostic");
assert.match(builder, /Temporary local previews were not uploaded/, "the UI must explain the safe transient-media result");

console.log("Step 130C Custom Mode save preserves authored data, retains durable media, and safely excludes transient browser previews.");
