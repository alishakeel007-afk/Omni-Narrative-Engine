import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const studio = source("screens/VideoStudioScreen.tsx");
const preview = source("screens/VideoPreviewScreen.tsx");
const database = source("lib/video-studio-db.ts");
const persistence = source("lib/story-database.ts");
const saveRoute = source("app/api/story/[projectId]/video/save/route.ts");
const schema = source("prisma/schema.prisma");
const timeline = source("lib/story-preview-timeline.ts");
const dashboard = source("screens/DashboardScreen.tsx");

// A Stage 4–7 edit must be committed before the database-backed preview route
// is opened; otherwise it can restore an older story snapshot.
assert.match(studio, /const saved = await queueDatabaseSave\(snapshot, true\)/);
assert.match(studio, /if \(!saved\.success\)[\s\S]*Could not save the current project for preview/);
assert.match(studio, /router\.push\(`\/video-preview\?mode=guided&project=\$\{encodeURIComponent\(snapshot\.projectId!?\)\}`\)/);
assert.doesNotMatch(studio, /encodeURIComponent\(flow\.projectId \?\? ""\)/,
  "Guided preview links must never be emitted with an empty project id");

// An explicit Guided preview must never substitute arbitrary browser cache.
assert.match(preview, /Guided media preview is database-backed/);
assert.match(preview, /setRestoreState\("missing"\)/);
assert.match(preview, /previousVideoStudioStage\("preview"\)/);
assert.match(preview, /Save Changes/);
assert.match(preview, /Previous Step/);
assert.doesNotMatch(preview, /Back to Edit Dialogues/);
assert.doesNotMatch(preview, /Back to Audio & Music/);
assert.match(dashboard, /video-preview\?mode=guided&project=\$\{encodeURIComponent\(flow\.projectId\)\}/);

// Narration is a scene MediaAsset while dialogue clips remain on their exact
// Dialogue rows; the timeline keeps them as separate ordered clip kinds.
assert.match(persistence, /narrationAudioUrl: s\.mediaAssets\.find\(\(m\) => m\.type === MediaType\.AUDIO\)/);
assert.match(persistence, /audioUrl: d\.audioUrl/);
assert.match(timeline, /kind: "narration"/);
assert.match(timeline, /kind: "dialogue"/);

// Dialogue position is persisted and read deterministically, avoiding a
// database relation's unspecified ordering from moving an audio URL to another
// line after save/resume.
assert.match(schema, /position\s+Int\s+@default\(0\)/);
assert.match(saveRoute, /position: z\.number\(\)\.int\(\)\.min\(0\)\.optional\(\)/);
assert.match(database, /dialogues: scene\.dialogues\.map\(\(d, position\)/);
assert.match(database, /id: d\.id/);
assert.match(database, /sort\(\(left, right\) => left\.position - right\.position\)/);
assert.match(persistence, /orderBy: \[\{ position: "asc" \}, \{ createdAt: "asc" \}, \{ id: "asc" \}\]/);
assert.match(persistence, /Number\.isSafeInteger\(dialogue\.position\)/);

console.log("Step 131B canonical Guided preview, scene/media identity, and dialogue ordering regressions passed.");
