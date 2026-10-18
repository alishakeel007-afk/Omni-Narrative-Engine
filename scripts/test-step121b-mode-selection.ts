import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const hero = readFileSync(resolve(process.cwd(), "components/hero-section.tsx"), "utf8");
const home = readFileSync(resolve(process.cwd(), "screens/HomeScreen.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "lib/mock-data.ts"), "utf8");
const navbar = readFileSync(resolve(process.cwd(), "components/navbar.tsx"), "utf8");
const mode = readFileSync(resolve(process.cwd(), "screens/StoryModeScreen.tsx"), "utf8");
const resume = readFileSync(resolve(process.cwd(), "lib/project-resume.ts"), "utf8");

assert.ok(hero.includes('href="/story/mode"'), "Home primary Video Studio CTA opens mode selection");
assert.ok(home.includes('href="/story/mode"'), "Home secondary Video Studio CTA opens mode selection");
assert.ok(nav.includes('{ href: "/story/mode", label: "Video Studio" }'), "global Video Studio link opens mode selection");
assert.ok(navbar.includes('["/story/mode", "/video", "/video-preview", "/story-builder"].includes(pathname)'), "creation routes keep Video Studio active");
for (const expected of [
  'src="/images/guided-mode-fantasy-gateway.png"',
  'src="/images/custom-mode-storyboard-workspace.png"',
  'router.push("/video")',
  'router.push("/story-builder")',
  'grid gap-6 md:grid-cols-2',
]) assert.ok(mode.includes(expected), `missing mode-selection contract: ${expected}`);
assert.ok(resume.includes('href: "/video"'), "saved Video Studio resumes bypass the mode selector");

console.log("Step 121B Home, navigation, mode selection, and direct-resume contracts passed.");
