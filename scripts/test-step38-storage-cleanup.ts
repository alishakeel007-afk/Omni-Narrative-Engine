import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  excludeSharedProjectStorageObjects,
  getOwnedProjectStorageObject,
  planOwnedProjectStorageCleanup,
  // @ts-expect-error Node's native TypeScript runner requires source extensions.
} from "../lib/project-storage-cleanup.ts";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const cleanupRoute = read("app/api/story/[projectId]/route.ts");
const storage = read("lib/supabase-storage.ts");

const projectId = "project-a";
const imagePath = "images/project-a/scene-1.png";
const narrationPath = "audio/tts/project-a/narration-1.mp3";
const musicPath = "audio/music/project-a/scene-1/track.wav";

assert.deepEqual(getOwnedProjectStorageObject(imagePath, projectId), {
  bucket: "images", path: "project-a/scene-1.png", storagePath: imagePath,
});
assert.deepEqual(getOwnedProjectStorageObject(narrationPath, projectId), {
  bucket: "audio", path: "tts/project-a/narration-1.mp3", storagePath: narrationPath,
});
assert.equal(getOwnedProjectStorageObject("images/project-b/scene-1.png", projectId), null, "another project's object must not be eligible");
assert.equal(getOwnedProjectStorageObject("audio/tts/default/legacy.mp3", projectId), null, "legacy default paths must be retained");
assert.equal(getOwnedProjectStorageObject("images/project-a/../other/file.png", projectId), null, "path traversal must be rejected");
assert.equal(getOwnedProjectStorageObject("images\\project-a\\scene.png", projectId), null, "Windows separators must be rejected");

const plan = planOwnedProjectStorageCleanup(projectId, [imagePath, imagePath, narrationPath, musicPath, "audio/default/legacy.wav", null]);
assert.equal(plan.objects.length, 3, "safe media paths should deduplicate");
assert.deepEqual(plan.retainedStoragePaths, ["audio/default/legacy.wav"]);

const shared = excludeSharedProjectStorageObjects(plan.objects, [narrationPath]);
assert.deepEqual(shared.deletable.map((object) => object.storagePath).sort(), [imagePath, musicPath].sort());
assert.deepEqual(shared.retainedSharedStoragePaths, [narrationPath]);

// The route queries only records belonging to the owned project, checks for
// cross-project references, then completes Storage work before DB deletion.
assert.match(cleanupRoute, /draft: \{ storyProjectId: owned\.projectId \}/);
assert.match(cleanupRoute, /storyProjectId: \{ not: owned\.projectId \}/);
assert.match(cleanupRoute, /allowNotFound: true/);
assert.ok(cleanupRoute.indexOf("deleteFromSupabaseStorage") < cleanupRoute.indexOf("prisma.storyProject.delete"));
assert.match(cleanupRoute, /Project media cleanup could not be completed/);
assert.match(storage, /allowNotFound/);
assert.match(storage, /storage\/v1\/object\/public/);

console.log("Step 38 Storage privacy and safe cleanup tests passed.");
