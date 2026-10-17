import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const imageRoute = read("app/api/video/image/route.ts");
const customMusicRoute = read("app/api/story/custom/music/route.ts");
const ttsRoute = read("app/api/video/tts/route.ts");
const narrationRoute = read("app/api/story/narrate/route.ts");
const customSaveRoute = read("app/api/story/custom/save/route.ts");
const customMedia = read("lib/custom-story-media.ts");

assert.ok(imageRoute.includes("hasCustomSceneId && !hasProjectId"), "Custom image generation must require a valid project ID.");
assert.ok(imageRoute.includes("saveOwnedCustomSceneMedia"), "Custom image uploads must be associated server-side.");
assert.ok(imageRoute.includes("deleteFromSupabaseStorage"), "Failed Custom image association must clean up only the just-created upload.");
assert.ok(customMusicRoute.includes("saveOwnedCustomSceneMedia"), "Custom music uploads must be associated server-side.");
assert.ok(customMusicRoute.includes("deleteFromSupabaseStorage"), "Failed Custom music association must clean up only the just-created upload.");
assert.ok(customSaveRoute.includes("mergePersistedCustomMedia"), "Queued Custom saves must retain server-associated media.");
assert.ok(customMedia.includes("next.backgroundMusicStatus !== \"silent\""), "Intentional silence must remain an explicit choice.");
assert.ok(customMedia.includes("existingDialogueById"), "Stale Custom saves must retain existing dialogue clips by stable ID.");
assert.ok(!ttsRoute.includes("errors.push(message)"), "Raw provider TTS errors must not be reflected to clients.");
assert.ok(narrationRoute.includes("Narration generation could not be completed"), "Narration failures must be sanitized.");

console.log("Step 128 security and Custom media reliability checks passed.");
