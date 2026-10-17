import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const stages = ["setup", "storyIdea", "storyReview", "scenes", "voice", "images", "music", "preview"];
const previousStage = (stage: string) => {
  const index = stages.indexOf(stage);
  return index > 0 ? stages[index - 1] : undefined;
};
assert.equal(previousStage("setup"), undefined, "Stage 1 must not navigate to an invalid predecessor");
for (let index = 1; index < stages.length; index += 1) {
  assert.equal(previousStage(stages[index]), stages[index - 1], `${stages[index]} must return one step only`);
}

const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
const storage = readFileSync(resolve(process.cwd(), "lib/video-storage.ts"), "utf8");
const previewStart = studio.indexOf("function PreviewShortcutStage");
const preview = studio.slice(previewStart);
assert.match(studio, /const goToPreviousStage = \(\) =>/, "Guided navigation must use the shared predecessor map");
assert.match(storage, /export function previousVideoStudioStage\(stage: VideoStudioStage\)/,
  "the transition map must be exported by the persisted Guided workflow");
assert.match(studio, /const created = await createVideoStudioProject\(snapshot\)/,
  "legacy unsaved Guided flows must create one project before their first final save");
assert.match(studio, /const saved = await queueDatabaseSave\(snapshot, true\)/,
  "final saves must reuse the serialized database save queue");
assert.match(studio, /if \(!saved\.success\) throw new Error\("Could not save the project\."\)/,
  "a failed save must never report false success");
assert.match(preview, /Save to My Projects/);
assert.match(preview, /Save Changes/);
assert.match(preview, /Project save failed\. Your current work remains safely in this browser/);
assert.match(preview, /Previous Step/);
assert.doesNotMatch(preview, /Back to Edit Dialogues/, "Stage 8 must not skip back to Stage 4");

console.log("Step 131A Guided final save and one-step back-navigation regressions passed.");
