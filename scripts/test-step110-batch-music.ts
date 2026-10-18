import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Stage 7 is browser-only, so this regression test verifies the deterministic
// control-flow contract without attempting OfflineAudioContext rendering.
const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");

assert.match(studio, /const generateAllMusic = async \(\)/, "Stage 7 must have one batch entry point");
assert.match(studio, /musicBatchRunningRef\.current/, "duplicate batch clicks must be guarded synchronously");
assert.match(studio, /hasUsableMediaReference\(scene\.backgroundMusicUrl\)[\s\S]{0,120}results\[scene\.sceneNumber\] = "skipped"/, "saved tracks must be skipped");
assert.match(studio, /decision\.outcome === "silence"[\s\S]{0,700}results\[scene\.sceneNumber\] = "silent"/, "intentional silence must never be rendered");
assert.match(studio, /for \(let index = 0; index < candidates\.length; index \+= 1\)[\s\S]{0,2600}catch \(sceneError\)[\s\S]{0,450}results\[scene\.sceneNumber\] = "failed"/, "one scene failure must be recorded without aborting later candidates");
assert.match(studio, /Generating music \$\{batchProgress\.current\}\/\$\{batchProgress\.total\}/, "batch progress must be visible");
assert.match(studio, /Generate All Music/, "the footer must expose the batch action");
assert.match(studio, /Regenerate Saved Score/, "completed scores must have a separate explicit replacement action");
assert.doesNotMatch(studio, /Apply Scene-Aware Decisions/, "the obsolete decision-only action must be removed");

console.log("Step 110 batch music guards, saved-track skipping, silence exclusion, independent failures, and progress UI passed.");
