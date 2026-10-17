import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Focused Node tests load TypeScript sources directly.
import { summarizeProject } from "../lib/project-summary.ts";
// @ts-expect-error Focused Node tests load TypeScript sources directly.
import { partitionMyProjects } from "../lib/my-projects.ts";

const readyAssets = [
  { type: "IMAGE", url: "https://media.test/image.png", status: "READY" },
  { type: "AUDIO", url: "https://media.test/narration.mp3", status: "READY" },
  { type: "MUSIC", url: "https://media.test/music.wav", status: "READY" },
];

function videoProject(overrides: Record<string, unknown> = {}) {
  return summarizeProject({
    id: "owned-project",
    status: "IN_PROGRESS" as const,
    title: "Saved film",
    drafts: [{
      id: "draft-1",
      isActive: true,
      videoStudioState: { stage: "preview", language: "ur", musicDecisions: { "1": { outcome: "music" } } },
      scenes: [{ id: "scene-stable-id", sceneNumber: 1, description: "Narration", mediaAssets: readyAssets, dialogues: [{ text: "Dialogue", audioUrl: "https://media.test/dialogue.mp3" }] }],
    }],
    ...overrides,
  });
}

const complete = videoProject({ status: "COMPLETED" as const });
assert.equal(complete.workflow, "video-studio");
assert.equal(complete.language, "ur");
assert.equal(complete.resumeStage, "preview");
assert.equal(complete.completion.eligible, true);

const silent = summarizeProject({
  id: "silent-project", status: "IN_PROGRESS" as const, title: "Silent film",
  drafts: [{ id: "draft-silent", isActive: true, videoStudioState: { stage: "music", musicDecisions: { "1": { outcome: "silence" } } }, scenes: [{
    id: "silent-scene", sceneNumber: 1, description: "", mediaAssets: [{ type: "IMAGE", url: "https://media.test/image.png", status: "READY" }], dialogues: [],
  }] }],
});
assert.equal(silent.completion.eligible, true, "intentional silence is a valid completion state");

const stale = summarizeProject({
  id: "stale-project", status: "COMPLETED" as const, title: "Edited film",
  drafts: [{ id: "draft-stale", isActive: true, videoStudioState: { stage: "scenes", mediaFreshness: { "stable-scene": { image: true } }, musicDecisions: { "1": { outcome: "music" } } }, scenes: [{
    id: "stable-scene", sceneNumber: 1, description: "", mediaAssets: readyAssets, dialogues: [],
  }] }],
});
assert.equal(stale.completion.eligible, false);
assert.match(stale.completion.reasons.join(" "), /outdated/);

const groups = partitionMyProjects([complete, { ...stale, workflow: "video-studio" as const }, { ...complete, id: "legacy", workflow: "story" as const }]);
assert.deepEqual(groups.completed.map((project) => project.id), ["owned-project"]);
assert.deepEqual(groups.inProgress.map((project) => project.id), ["stale-project"]);

const apiRoute = readFileSync(resolve(process.cwd(), "app/api/story/[projectId]/route.ts"), "utf8");
const listRoute = readFileSync(resolve(process.cwd(), "app/api/story/projects/route.ts"), "utf8");
const page = readFileSync(resolve(process.cwd(), "screens/MyProjectsScreen.tsx"), "utf8");
const navbar = readFileSync(resolve(process.cwd(), "components/navbar.tsx"), "utf8");
const summary = readFileSync(resolve(process.cwd(), "lib/project-summary.ts"), "utf8");
for (const expected of [
  "where: { id: projectId, userId: user.id }", "ProjectStatus.COMPLETED", "summary.completion.eligible",
  "mediaFreshness", "musicDecisions", "orderBy: { updatedAt: \"desc\" }", "status: true", "url: true",
  "In Progress", "Completed", "Resume Project", "Watch Story", "Mark Project Complete", "/video-preview?mode=guided&project=",
  "My Projects", "handleLink(\"/projects\")",
]) assert.ok(`${apiRoute}\n${listRoute}\n${page}\n${navbar}\n${summary}`.includes(expected), `missing My Projects contract: ${expected}`);

console.log("Step 122 My Projects completion, freshness, navigation, and ownership contracts passed.");
