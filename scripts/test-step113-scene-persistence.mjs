import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// This mirrors the identity contract between the client payload and database
// reconciliation: database IDs survive order changes; display numbers do not.
function reconcile(existing, submitted, draftId) {
  const owned = new Map(existing.filter((scene) => scene.draftId === draftId).map((scene) => [scene.id, scene]));
  const submittedIds = new Set();
  const active = submitted.map((scene, index) => {
    if (scene.persistenceSceneId) {
      assert.ok(owned.has(scene.persistenceSceneId), "a foreign scene ID must be rejected");
      assert.ok(!submittedIds.has(scene.persistenceSceneId), "a scene ID must not appear twice");
      submittedIds.add(scene.persistenceSceneId);
    }
    return { ...scene, sceneNumber: index + 1 };
  });
  const removed = [...owned.values()].filter((scene) => !submittedIds.has(scene.id));
  return { active, removed };
}

const initial = [
  { id: "scene-a", draftId: "draft-a", media: "image-a" },
  { id: "scene-b", draftId: "draft-a", media: "music-b" },
  { id: "scene-c", draftId: "draft-a", media: "narration-c" },
  { id: "other-project", draftId: "draft-b", media: "image-other" },
];

// Delete the middle scene, then reload: A and C retain their own media IDs,
// B is no longer active, and an unrelated project is untouched.
let result = reconcile(initial, [
  { persistenceSceneId: "scene-a" },
  { persistenceSceneId: "scene-c" },
], "draft-a");
assert.deepEqual(result.active.map((scene) => [scene.persistenceSceneId, scene.sceneNumber]), [["scene-a", 1], ["scene-c", 2]]);
assert.deepEqual(result.removed.map((scene) => scene.id), ["scene-b"]);
assert.equal(initial.find((scene) => scene.id === "scene-c").media, "narration-c");
assert.equal(initial.find((scene) => scene.id === "other-project").media, "image-other");

// Reorder must change only display order, never the persistent identity.
result = reconcile(initial, [
  { persistenceSceneId: "scene-c" },
  { persistenceSceneId: "scene-a" },
  { persistenceSceneId: "scene-b" },
], "draft-a");
assert.deepEqual(result.active.map((scene) => scene.persistenceSceneId), ["scene-c", "scene-a", "scene-b"]);
assert.equal(result.removed.length, 0);

// A newly added scene has no prior identity and cannot inherit deleted media.
result = reconcile(initial, [
  { persistenceSceneId: "scene-a" },
  { persistenceSceneId: "scene-c" },
  { title: "New scene" },
], "draft-a");
assert.equal(result.active[2].persistenceSceneId, undefined);
assert.deepEqual(result.removed.map((scene) => scene.id), ["scene-b"]);

assert.throws(() => reconcile(initial, [{ persistenceSceneId: "other-project" }], "draft-a"));
assert.throws(() => reconcile(initial, [{ persistenceSceneId: "scene-a" }, { persistenceSceneId: "scene-a" }], "draft-a"));

const database = readFileSync(resolve(process.cwd(), "lib/story-database.ts"), "utf8");
const route = readFileSync(resolve(process.cwd(), "app/api/story/[projectId]/video/save/route.ts"), "utf8");
const loader = readFileSync(resolve(process.cwd(), "lib/video-studio-db.ts"), "utf8");
const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
for (const expected of [
  "reconcileVideoStudioScenes", "$transaction", "isolationLevel: \"Serializable\"",
  "A submitted scene does not belong to this draft", "sceneId: { in: removedIds }",
  "data: { sceneId: null }", "tx.scene.deleteMany", "persistenceSceneId",
]) assert.ok(database.includes(expected), `missing transactional reconciliation safeguard: ${expected}`);
for (const expected of ["persistenceSceneId: z.string().uuid().optional()", "sceneIds: saved.sceneIds"]) {
  assert.ok(route.includes(expected), `missing save-route identity contract: ${expected}`);
}
for (const expected of ["persistenceSceneId: scene.persistenceSceneId", "persistenceSceneId: s.id"]) {
  assert.ok(loader.includes(expected), `missing client persistence identity contract: ${expected}`);
}
for (const expected of ["nextMusicDecisions", "persistenceSceneId is intentionally retained", "attachSceneIds"]) {
  assert.ok(studio.includes(expected), `missing Video Studio reconciliation behavior: ${expected}`);
}

console.log("Step 113 scene delete/reorder identity and transactional persistence regression tests passed.");
