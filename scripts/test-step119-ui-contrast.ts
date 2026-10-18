import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
const preview = readFileSync(resolve(process.cwd(), "components/synchronized-story-preview.tsx"), "utf8");
const audioPreview = readFileSync(resolve(process.cwd(), "components/preview-final-audio-button.tsx"), "utf8");
const toast = readFileSync(resolve(process.cwd(), "components/toast.tsx"), "utf8");

for (const expected of [
  'border border-amber-300 bg-amber-50',
  'text-amber-950',
  'border border-red-300 bg-red-50',
  'text-red-950',
  'Generating Visuals…',
  '"Generate Visuals"',
  'hasUsableMediaReference(scene.generatedImageUrl) && !scene.generatedImageOutdated',
  'forceRegenerateAll || scene.generatedImageOutdated ? undefined : scene.generatedImageHash',
]) assert.ok(studio.includes(expected), `missing Step 119 Video Studio UI contract: ${expected}`);

assert.ok(preview.includes('bg-black/30') && preview.includes('text-amber-100'), "Stage 8 outdated-media warning uses a readable warning color on its dark surface");
assert.ok(preview.includes('bg-black/30') && preview.includes('text-red-100'), "Stage 8 playback error uses a readable error color on its dark surface");
assert.ok(audioPreview.includes('text-red-800'), "final-audio error uses a readable error color");
assert.ok(toast.includes('bg-amber-50 border-amber-300 text-amber-950'), "warning toast remains readable");
assert.ok(toast.includes('bg-red-50 border-red-300 text-red-900'), "error toast remains readable");

console.log("Step 119 warning contrast and visual-generation state tests passed.");
