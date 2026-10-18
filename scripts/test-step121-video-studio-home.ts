import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const home = readFileSync(resolve(process.cwd(), "screens/HomeScreen.tsx"), "utf8");
const hero = readFileSync(resolve(process.cwd(), "components/hero-section.tsx"), "utf8");
const nav = readFileSync(resolve(process.cwd(), "lib/mock-data.ts"), "utf8");

for (const expected of ["Create Stories with AI.", "Open Video Studio", "My Projects", 'href="/story/mode"', 'href="/dashboard"']) {
  assert.ok(`${home}\n${hero}`.includes(expected), `missing Video Studio-first home contract: ${expected}`);
}
assert.ok(home.includes('href="/story/mode"'), "Home opens the Video Studio creation-mode selector");
assert.ok(!home.includes('href="/setup"'), "Home no longer promotes the legacy Custom Scene Builder flow");
assert.ok(!home.includes('href="/story/memory"'), "Home no longer promotes the legacy Memory Board flow");
assert.deepEqual(
  ["Home", "Video Studio", "Dashboard"].map((label) => nav.indexOf(`label: "${label}"`)),
  ["Home", "Video Studio", "Dashboard"].map((label) => nav.indexOf(`label: "${label}"`)).sort((a, b) => a - b),
  "Video Studio is the only primary creation workflow in global navigation",
);

console.log("Step 121 Video Studio-first Home and navigation tests passed.");
