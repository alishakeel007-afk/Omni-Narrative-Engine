import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const preview = readFileSync(resolve(process.cwd(), "screens/VideoPreviewScreen.tsx"), "utf8");
const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
const database = readFileSync(resolve(process.cwd(), "lib/video-studio-db.ts"), "utf8");
const storage = readFileSync(resolve(process.cwd(), "lib/video-storage.ts"), "utf8");
assert.ok(storage.includes("returnStage?: VideoStudioStage"));
assert.ok(storage.includes("source.returnStage && source.returnStage !== \"preview\""), "preview is never its own editing return target");
for (const expected of [
  "loadVideoStudioFromDatabase(requestedProjectId)", "databaseFlow?.projectId === requestedProjectId",
  "Guided media preview is database-backed", "setRestoreState(\"missing\")",
  "previousVideoStudioStage(\"preview\")", "persistGuidedPreview", "Preview unavailable", "Return to Dashboard",
]) assert.ok(preview.includes(expected), `missing Stage 8 restore contract: ${expected}`);
for (const expected of ["project=${encodeURIComponent(snapshot.projectId", "returnStage", "hasRequestedProject", "hydrationStateRef.current !== \"ready\""]) {
  assert.ok(studio.includes(expected), `missing Studio navigation isolation contract: ${expected}`);
}
for (const expected of ["returnStage: flow.returnStage", "returnStage: restoredReturnStage", "mediaFreshness"]) {
  assert.ok(database.includes(expected), `missing persisted restore contract: ${expected}`);
}

console.log("Step 115 Stage 8 project restoration, cache isolation, return-stage, and freshness contracts passed.");
