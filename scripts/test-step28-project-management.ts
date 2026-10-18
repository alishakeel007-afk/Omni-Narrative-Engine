import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { summarizeProject } from "../lib/project-summary.ts";

const readyVideo = summarizeProject({
  id: "project-a",
  drafts: [{ id: "draft-a", isActive: true, videoStudioState: { stage: "music" }, scenes: [
    { description: "Narration", mediaAssets: [
      { type: "IMAGE", url: "https://media.test/scene.png", status: "READY" },
      { type: "AUDIO", url: "https://media.test/narration.mp3", status: "READY" },
      { type: "MUSIC", url: "https://media.test/music.wav", status: "READY" },
    ], dialogues: [{ text: "Hello", audioUrl: "https://media.test/line.wav" }] },
  ] }],
});
assert.equal(readyVideo.workflow, "video-studio");
assert.equal(readyVideo.resumeStage, "music");
assert.equal(readyVideo.mediaReady, true);

const unfinishedStory = summarizeProject({
  id: "project-b",
  drafts: [{ id: "draft-old", isActive: false, videoStudioState: null, scenes: [] }, { id: "draft-active", isActive: true, videoStudioState: null, scenes: [
    { description: "Narration", mediaAssets: [], dialogues: [{ text: "Hello", audioUrl: null }] },
  ] }],
});
assert.equal(unfinishedStory.workflow, "story");
assert.equal(unfinishedStory.sceneCount, 1);
assert.equal(unfinishedStory.mediaReady, false);

const projectRoute = readFileSync(resolve(process.cwd(), "app/api/story/[projectId]/route.ts"), "utf8");
const listRoute = readFileSync(resolve(process.cwd(), "app/api/story/projects/route.ts"), "utf8");
const dashboard = readFileSync(resolve(process.cwd(), "screens/DashboardScreen.tsx"), "utf8");
for (const expected of [
  "where: { id: projectId, userId: user.id }", "export async function PATCH", "export async function DELETE",
  "planOwnedProjectStorageCleanup", "Project media cleanup could not be completed", "summarizeProject", "workflow === \"video-studio\"",
  "loadVideoStudioFromDatabase", "saveVideoStudioFlow", "Rename", "Archive", "Delete", "Restoring...",
]) assert.ok(`${projectRoute}\n${listRoute}\n${dashboard}`.includes(expected), `missing project recovery contract: ${expected}`);

console.log("Step 28 project listing, resume, ownership, and safe-management tests passed.");
