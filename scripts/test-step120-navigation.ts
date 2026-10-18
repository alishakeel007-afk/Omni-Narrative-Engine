import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const mockData = readFileSync(resolve(process.cwd(), "lib/mock-data.ts"), "utf8");
const navbar = readFileSync(resolve(process.cwd(), "components/navbar.tsx"), "utf8");

const expectedLinks = [
  '{ href: "/", label: "Home" }',
  '{ href: "/story/mode", label: "Video Studio" }',
  '{ href: "/dashboard", label: "Dashboard" }',
];
const positions = expectedLinks.map((link) => mockData.indexOf(link));
assert.ok(positions.every((position) => position >= 0), "all required global links exist");
assert.deepEqual([...positions].sort((a, b) => a - b), positions, "global links are in the requested order");
assert.ok(!mockData.includes('label: "Start"'), "legacy Start link is removed");
assert.ok(!mockData.includes('label: "Setup"'), "Setup is not a global link");
assert.ok(!mockData.includes('label: "Story Memory Board"'), "legacy memory label is removed");

for (const expected of [
  'const brandHref = "/" as Route',
  'const hiddenHeaderPaths = ["/auth", "/signup"]',
  'href === "/story/mode" && ["/story/mode", "/video", "/video-preview", "/story-builder"].includes(pathname)',
  'navLinks.map((item)',
  'ProfileDropdown',
  'md:hidden',
]) assert.ok(navbar.includes(expected), `missing responsive navigation contract: ${expected}`);
assert.ok(!mockData.includes('{ href: "/story/play", label: "Play Story" }'), "legacy Play Story is not global navigation");
assert.ok(!mockData.includes('{ href: "/story/memory", label: "Story Memory" }'), "legacy Story Memory is not global navigation");

console.log("Step 120 global navigation order and active-route tests passed.");
