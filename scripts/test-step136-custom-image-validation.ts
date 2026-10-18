// @ts-nocheck -- direct Node regression harness for TypeScript source modules.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-ignore Direct Node test import.
import { buildSceneVisualContext } from "../lib/image/scene-visual-context.ts";

const longNarration = "The Crystal of Forgotten Time hangs above the altar while Arin Vale and Lyra Voss search the ruined observatory. ".repeat(28);
const cast = [
  { id: "arin", name: "Arin Vale", role: "Hero", personalityTone: "Brave and careful" },
  { id: "lyra", name: "Lyra Voss", role: "Scholar", personalityTone: "Observant and calm" },
];
const scenes = [
  { id: "custom-one", title: "The Floating Crystal", storyDescription: longNarration, sceneTone: "Mysterious", activeCharacterIds: ["arin", "lyra"] },
  { id: "custom-two", title: "Clockwork Door", storyDescription: "Arin and Lyra follow the crystal into a clockwork archive beneath the city.", sceneTone: "Suspenseful", activeCharacterIds: ["arin", "lyra"] },
  { id: "custom-three", title: "The Last Dawn", storyDescription: "Lyra holds the crystal as Arin opens the observatory roof to the returning sunrise.", sceneTone: "Hopeful", activeCharacterIds: ["arin", "lyra"] },
];

for (const scene of scenes) {
  const visual = buildSceneVisualContext({
    scene: { ...scene, mood: scene.sceneTone, dialogueCharacterNames: ["Arin Vale", "Lyra Voss"] },
    characters: cast,
  });
  assert.ok(visual.imagePrompt.length > 0 && visual.imagePrompt.length <= 1_040, `${scene.title} retains a bounded required-event prompt`);
  assert.deepEqual(visual.characterNames, ["Arin Vale", "Lyra Voss"], `${scene.title} retains both present characters`);
}
const noSeparatePrompt = buildSceneVisualContext({ scene: { title: "Authored narration only", storyDescription: "A detective enters the rain-soaked station." }, characters: [] });
assert.equal(noSeparatePrompt.visualPrompt, "", "the planner may legitimately omit a secondary visualPrompt");
assert.ok(noSeparatePrompt.imagePrompt, "canonical story narration still supplies an image prompt");

const root = process.cwd();
const route = readFileSync(resolve(root, "app/api/video/image/route.ts"), "utf8");
const custom = readFileSync(resolve(root, "screens/AudioGenerationScreen.tsx"), "utf8");
assert.match(route, /isInvalidOptionalText/, "route must accept blank optional fields while rejecting malformed/oversized values");
assert.match(custom, /visualContext\.visualPrompt \? \{ visualPrompt: visualContext\.visualPrompt \} : \{\}/, "Custom caller must omit an empty optional visual prompt");
assert.match(custom, /for \(const scene of updatedScenes\)[\s\S]*catch[\s\S]*errorsOccurred = true/, "one Custom scene failure remains isolated from later scenes");

console.log("Step 136 Custom image request validation regressions passed.");
