import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Focused Node tests load TypeScript sources directly.
import { createDefaultDraft, createEmptyScene, normalizeCreateStoryDraft } from "../lib/create-story-storage.ts";
// @ts-expect-error Focused Node tests load TypeScript sources directly.
import { partitionMyProjects } from "../lib/my-projects.ts";

const original = createDefaultDraft();
const sceneA = createEmptyScene({ characters: original.characters, genres: original.genres, tones: original.tones, storyTitle: "Account custom story", sceneNumber: 1 });
const sceneB = createEmptyScene({ characters: original.characters, genres: original.genres, tones: original.tones, storyTitle: "Account custom story", sceneNumber: 2 });
const restored = normalizeCreateStoryDraft({
  ...original,
  projectId: "00000000-0000-4000-8000-000000000001",
  draftId: "00000000-0000-4000-8000-000000000002",
  storyTitle: "Account custom story",
  scenes: [
    { ...sceneB, sceneNumber: 1, storyDescription: "Second scene, deliberately reordered." },
    { ...sceneA, sceneNumber: 2, storyDescription: "First scene with preserved dialogue." },
  ],
});
assert.equal(restored.storyTitle, "Account custom story");
assert.equal(restored.clientImportId, original.clientImportId, "local import key stays stable across saves");
assert.deepEqual(restored.scenes.map((scene) => scene.id), [sceneB.id, sceneA.id], "stable scene IDs survive reorder");
assert.equal(restored.scenes[1]?.dialogues[0]?.characterId, original.characters[0]?.id, "dialogue and character identity survive restore");

const customProject = {
  id: "custom-project", status: "IN_PROGRESS" as const, workflow: "custom-builder" as const,
  completion: { eligible: false, reasons: ["Preview is not ready."] },
};
const guidedProject = { ...customProject, id: "guided-project", workflow: "video-studio" as const };
const legacyProject = { ...customProject, id: "legacy-project", workflow: "story" as const };
const groups = partitionMyProjects([customProject, guidedProject, legacyProject]);
assert.deepEqual(groups.inProgress.map((project) => project.id), ["custom-project", "guided-project"], "only owned creation workflows appear in My Projects");

const sources = [
  "app/api/story/custom/save/route.ts", "app/api/story/[projectId]/custom/load/route.ts", "lib/custom-story-db.ts",
  "screens/StoryBuilderScreen.tsx", "screens/MyProjectsScreen.tsx", "lib/project-summary.ts",
].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
for (const expected of [
  "clientImportId", "isolationLevel: Prisma.TransactionIsolationLevel.Serializable", "project: { userId: user.id", "mode: StoryMode.CUSTOM",
  "progressState", "Save to My Projects", "Save failed — your local draft is safe", "custom-builder",
  "/story-builder?project=", "loadCustomStoryFromDatabase", "isActive: true",
]) assert.ok(sources.includes(expected), `missing Custom persistence contract: ${expected}`);

console.log("Step 124 Custom Mode account persistence, stable identity, ownership, import, and My Projects contracts passed.");
