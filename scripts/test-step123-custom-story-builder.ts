import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Focused Node tests load TypeScript sources directly.
import { createEmptyScene, createDefaultDraft, normalizeCreateStoryDraft } from "../lib/create-story-storage.ts";

const draft = createDefaultDraft();
const emptyScene = createEmptyScene({
  characters: draft.characters,
  genres: draft.genres,
  sceneNumber: 1,
  storyTitle: "Manual story",
  tones: draft.tones,
});
assert.deepEqual(emptyScene.suggestions, [], "Custom scenes do not receive unsolicited AI-like suggestions");

const restored = normalizeCreateStoryDraft({
  ...draft,
  storyTitle: "A User-Renamed Story",
  scenes: [{ ...emptyScene, storyDescription: "A manually authored scene.", suggestions: [] }],
});
assert.equal(restored.storyTitle, "A User-Renamed Story");
assert.equal(restored.scenes[0]?.storyDescription, "A manually authored scene.");
assert.deepEqual(restored.scenes[0]?.suggestions, []);

const builder = readFileSync(resolve(process.cwd(), "screens/StoryBuilderScreen.tsx"), "utf8");
const route = readFileSync(resolve(process.cwd(), "app/api/story/suggest-scene/route.ts"), "utf8");
for (const expected of [
  'id="custom-story-title"', "updateStoryTitle", "moveScene", "persistDraft", "Suggest 3 Next Scenes",
  "Ignore these suggestions", "window.confirm", "Your writing was kept unchanged", "dialogues:",
]) assert.ok(builder.includes(expected), `missing Custom Builder user-control contract: ${expected}`);
for (const expected of [
  "Generate exactly 3 distinct, coherent next-scene directions", "meaningful alternatives, not paraphrases",
  "Established scene, event, and relationship context", "distinctSuggestions.length !== 3", "dialogueContext",
]) assert.ok(route.includes(expected), `missing context-aware suggestion contract: ${expected}`);

console.log("Step 123 Custom Story Builder title, manual-authoring, suggestion, and continuity contracts passed.");
