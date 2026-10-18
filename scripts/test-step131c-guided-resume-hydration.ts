import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
const database = readFileSync(resolve(process.cwd(), "lib/video-studio-db.ts"), "utf8");
const projects = readFileSync(resolve(process.cwd(), "screens/MyProjectsScreen.tsx"), "utf8");

// My Projects carries the stable project identity into the database-backed
// Guided restore path; it does not supply a mutable stage override.
assert.match(projects, /\/video\?project=\$\{encodeURIComponent\(project\.id\)\}/);
assert.match(studio, /setFlow\(null\);/);
assert.match(studio, /loadVideoStudioFromDatabase\(requestedProjectId\)/);
assert.match(studio, /hydrationStateRef\.current = "ready"/);
assert.match(studio, /hydrationStateRef\.current = "failed"/);
assert.match(studio, /Retry restore/);
assert.match(studio, /hydrationStateRef\.current !== "ready"/);
assert.doesNotMatch(studio, /setFlow\(createDefaultVideoStudioFlow\(\)\)/,
  "a failed owned-project restore must never replace it with Stage 1");

// The loader accepts only the known stage IDs and otherwise falls back to the
// persisted-story-safe scenes stage, not a blank setup document.
assert.match(database, /VIDEO_STAGE_LABELS\.some\(\(item\) => item\.id === meta\?\.stage\)/);
assert.match(database, /: "scenes";/);

for (const stage of ["scenes", "voice", "images", "music", "preview"]) {
  assert.ok(studio.includes(`"${stage}"`), `Guided workflow retains the ${stage} stage definition`);
}

console.log("Step 131C Guided hydration, resume-stage, retry, and autosave-gate regressions passed.");
