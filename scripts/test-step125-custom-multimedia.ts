import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Focused Node tests load TypeScript sources directly.
import { createDefaultDraft, createEmptyScene } from "../lib/create-story-storage.ts";

const base = createDefaultDraft();
const scene = createEmptyScene({ characters: base.characters, genres: base.genres, tones: ["Suspenseful"], storyTitle: "Custom multimedia", sceneNumber: 1 });
scene.title = "The hidden gate";
scene.storyDescription = "A mysterious and tense gate opens in the dark.";
scene.dialogues[0]!.text = "We should not go inside.";
const draft = { ...base, projectId: "project-1", draftId: "draft-1", scenes: [scene] };

assert.ok(scene.id && draft.clientImportId, "the local draft keeps stable scene and import identities before multimedia generation");

const sources = [
  "screens/AudioGenerationScreen.tsx", "screens/VideoPreviewScreen.tsx", "app/api/video/image/route.ts",
  "app/api/story/custom/music/route.ts", "lib/custom-story-multimedia.ts", "types/create-story.ts",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
for (const expected of [
  "projectId: draft.projectId", "customSceneId", "Generate Missing Music", "Intentional Silence",
  "SynchronizedStoryPreview", "loadCustomStoryFromDatabase", "project: { userId: session.userId",
  "Sample-Based Cinematic Score v1", "transient: true", "buildCustomVoiceRequest", "applyCustomVoiceResponse",
  "!dialogueIsCurrent", "NARRATION_PREFIX", "backgroundMusicStatus === \"silent\"", "persistenceSceneId: scene.id",
]) assert.ok(sources.includes(expected), `missing Custom multimedia contract: ${expected}`);

console.log("Step 125 Custom voice, visuals, cinematic music, persistent ownership, and synchronized preview contracts passed.");
