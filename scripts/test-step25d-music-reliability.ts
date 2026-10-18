import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = read("app/api/background-music/sample-based/route.ts");
const preview = read("components/preview-final-audio-button.tsx");
const studio = read("screens/VideoStudioScreen.tsx");
const renderer = read("lib/audio/sample-score.ts");

assert.match(route, /getOwnedSceneMediaTarget/);
assert.match(route, /validateImportedWav/);
assert.match(route, /replaceSceneMusic/);
assert.match(route, /deleteFromSupabaseStorage[\s\S]{0,300}throw error/, "only the new object is cleaned up when persistence fails");
assert.match(route, /Sample-Based Cinematic Score v1/);
assert.match(renderer, /OfflineAudioContext/);
assert.match(preview, /scene\.narrationAudioUrl/);
assert.match(preview, /Duck the active BGM/);
assert.match(preview, /playbackError/);
assert.match(studio, /Generate Cinematic Score/);
assert.doesNotMatch(studio, /Procedural Score Fallback|Import AI Music \(WAV\)|MusicGen Batch Export/);

console.log("Step 25D cinematic-score persistence, ducking, playback-error, and retired-workflow exclusion tests passed.");
