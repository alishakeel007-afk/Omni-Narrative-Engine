import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { getCustomBuilderResume, getPersistedProjectResume } from "../lib/project-resume.ts";

assert.deepEqual(getPersistedProjectResume("story"), {
  href: "/story/play", label: "Open Active Story", workspace: "Interactive Story",
});
assert.deepEqual(getPersistedProjectResume("video-studio"), {
  href: "/video", label: "Open Video Studio", workspace: "Video Studio",
});
assert.deepEqual(getCustomBuilderResume(false), { href: "/story-builder", label: "Resume Custom Scene Builder" });
assert.deepEqual(getCustomBuilderResume(true), { href: "/video-preview?mode=custom", label: "Open Custom Story Preview" });

const dashboard = readFileSync(resolve(process.cwd(), "screens/DashboardScreen.tsx"), "utf8");
const builder = readFileSync(resolve(process.cwd(), "screens/StoryBuilderScreen.tsx"), "utf8");
const context = readFileSync(resolve(process.cwd(), "context/StoryContext.tsx"), "utf8");
const memory = readFileSync(resolve(process.cwd(), "screens/StoryMemoryScreen.tsx"), "utf8");
const resume = readFileSync(resolve(process.cwd(), "lib/project-resume.ts"), "utf8");
const play = readFileSync(resolve(process.cwd(), "screens/StoryPlay.tsx"), "utf8");
for (const expected of [
  "getPersistedProjectResume", "getCustomBuilderResume", "separate from Active Story gameplay",
  "loadVideoStudioFromDatabase", "loadFromDatabase(project.id)", "Resume Custom Scene Builder",
  "Back to Dashboard", "readCachedProgressForProject", "cachedSetup?.projectId !== projectId",
  "href=\"/story/play\"", "\"/story/memory\"", "\"/story/history\"", "\"/story/state\"",
]) assert.ok(`${dashboard}\n${builder}\n${context}\n${memory}\n${resume}\n${play}`.includes(expected), `missing Step 32A navigation contract: ${expected}`);

console.log("Step 32A workflow classification, resume routing, identity isolation, and interactive navigation tests passed.");
