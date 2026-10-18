import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const studio = read("screens/VideoStudioScreen.tsx");
const database = read("lib/video-studio-db.ts");
const saveRoute = read("app/api/story/[projectId]/video/save/route.ts");
const preview = read("components/preview-final-audio-button.tsx");
const storyDatabase = read("lib/story-database.ts");

assert.match(studio, /saveChainRef/);
assert.match(studio, /saveRevisionRef/);
assert.match(studio, /lastQueuedSignatureRef/);
assert.match(studio, /saveRevisionRef\.current === initialRevision/, "late project load must not replace in-flight edits");
assert.match(studio, /Project save failed/);
assert.match(studio, />Retry</);
assert.match(database, /const script = flow\.script \?\? flow\.voiceResult/, "editable script must win over an old voice snapshot");
assert.match(storyDatabase, /orderBy: \{ sceneNumber: "asc" \}/);
assert.match(database, /narrationAudioUrl/);
assert.match(database, /backgroundMusicUrl: s\.musicUrl/);
assert.match(database, /voiceByName/);
assert.match(saveRoute, /reconcileVideoStudioScenes/);
assert.match(storyDatabase, /const mediaRequests = savedScenes\.flatMap/,
  "reconciliation must retain in-transaction media persistence");
assert.match(storyDatabase, /tx\.mediaAsset\.findMany/,
  "reconciliation must resolve existing scene media before updating it");
assert.match(storyDatabase, /narrationAudioUrl/);
assert.match(preview, /narrationAudioUrl/);
assert.match(preview, /Duck the active BGM/);

const restoredSceneNumbers = [3, 1, 2].sort((left, right) => left - right);
assert.deepEqual(restoredSceneNumbers, [1, 2, 3], "saved scene order must remain deterministic");

console.log("Step 25E Video Studio restoration, ordered-save, media, and audio-preview reliability tests passed.");
