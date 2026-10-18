import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
const imageRoute = readFileSync(resolve(process.cwd(), "app/api/video/image/route.ts"), "utf8");
const database = readFileSync(resolve(process.cwd(), "lib/story-database.ts"), "utf8");

const generateStart = studio.indexOf("const generateSceneImages");
const firstImageRequest = studio.indexOf('fetch("/api/video/image"', generateStart);
const persistenceBarrier = studio.indexOf("const savedTargets = await saveVideoStudioToDatabase(flow);", generateStart);
assert.ok(generateStart >= 0 && persistenceBarrier > generateStart && firstImageRequest > persistenceBarrier,
  "Guided image generation must persist and reconcile scene targets before requesting an image");
assert.ok(studio.indexOf("await saveChainRef.current;", generateStart) < persistenceBarrier,
  "the image persistence barrier must wait for earlier serialized saves");
assert.match(studio, /persistenceSceneId: savedTargets\.sceneIds\[scene\.sceneNumber\] \?\? scene\.persistenceSceneId/,
  "image requests must use reconciled stable scene identities");
assert.match(studio, /No image request was sent\./,
  "a failed persistence barrier must block provider work");
assert.match(imageRoute, /getOwnedSceneMediaTargetById\(draftId, persistenceSceneId, session\.userId\)/,
  "the image API must retain owned stable-ID lookup");
assert.match(database, /where: \{ id: sceneId, draftId, draft: \{ project: \{ userId \} \} \}/,
  "stable-ID lookup must remain ownership scoped");

console.log("Step 130D.3 Guided image persistence barrier and ownership contracts passed.");
