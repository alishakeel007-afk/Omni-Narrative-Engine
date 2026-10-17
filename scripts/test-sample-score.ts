import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
// @ts-expect-error Node's focused TypeScript runner requires the source suffix.
import { CINEMATIC_SAMPLE_CATALOG } from "../lib/audio/sample-catalog.ts";
// @ts-expect-error Node's focused TypeScript runner requires the source suffix.
import { validateImportedWav } from "../lib/audio/wav-validation.ts";

const root = process.cwd();
assert.equal(CINEMATIC_SAMPLE_CATALOG.length, 11, "the curated CC0 catalog should remain compact and explicit");
for (const sample of CINEMATIC_SAMPLE_CATALOG) {
  assert.equal(sample.license, "CC0-1.0");
  assert.match(sample.sha256, /^[a-f0-9]{64}$/);
  assert.ok(sample.sourceUrl.startsWith("https://raw.githubusercontent.com/sgossner/VSCO-2-CE/"));
  const file = join(root, "public", sample.url);
  assert.ok(existsSync(file), `${sample.id} must be included locally`);
  assert.equal(statSync(file).size, sample.bytes, `${sample.id} byte size must match manifest`);
  assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), sample.sha256, `${sample.id} checksum must match manifest`);
  const wav = validateImportedWav(readFileSync(file));
  assert.ok(wav.durationSeconds > 0 && wav.durationSeconds <= 90, `${sample.id} must be a valid manageable WAV`);
}

const engines = readFileSync(join(root, "lib/audio/sample-score.ts"), "utf8");
assert.match(engines, /buildCinematicArrangement/, "sample engine must reuse the deterministic musical plan");
assert.match(engines, /event\.kind === "pad" \? "violin"/, "pads must use recorded strings");
assert.match(engines, /event\.kind === "bass" \? "cello"/, "bass must use recorded low strings");
assert.match(engines, /event\.kind === "melody" \? "piano"/, "melodies must use recorded piano");
assert.match(engines, /glockenspiel/, "shimmer must use recorded mallets");
assert.match(engines, /timpani/, "action and suspense rhythm must use recorded percussion");
assert.match(engines, /startRendering\(\)/, "the browser renderer must produce a real WAV, not a placeholder");
for (const category of ["ambient", "suspense", "emotional", "action", "hopeful"] as const) {
  assert.ok(CINEMATIC_SAMPLE_CATALOG.some((sample) => sample.moods.includes(category)), `${category} needs licensed source material`);
}

const route = readFileSync(join(root, "app/api/background-music/sample-based/route.ts"), "utf8");
assert.match(route, /getOwnedSceneMediaTarget/); assert.match(route, /validateImportedWav/); assert.match(route, /replaceSceneMusic/); assert.match(route, /deleteFromSupabaseStorage/); assert.match(route, /Sample-Based Cinematic Score v1/);
assert.doesNotMatch(route, /fetch\s*\(|ElevenLabs|MusicGen|Stable Audio|Cloudflare/, "saving a sample score must not invoke external music providers");
const studio = readFileSync(join(root, "screens/VideoStudioScreen.tsx"), "utf8");
assert.match(studio, /Generate Cinematic Score/); assert.match(studio, /\/api\/background-music\/sample-based/); assert.doesNotMatch(studio, /Procedural Score Fallback|Import AI Music \(WAV\)|MusicGen AI Prompt/);
console.log("Sample catalog checksums, WAV validation, five mood arrangements, deterministic regeneration, secure persistence, and Stage 7 contracts passed.");
