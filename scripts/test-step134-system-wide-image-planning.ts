import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node TypeScript runner needs the source suffix.
import { buildSceneVisualContext } from "../lib/image/scene-visual-context.ts";
// @ts-expect-error Node TypeScript runner needs the source suffix.
import { buildImagePrompt } from "../lib/image/image-prompt.ts";

const root = process.cwd();
const read = (file: string) => readFileSync(resolve(root, file), "utf8");
const route = read("app/api/video/image/route.ts");
const guided = read("screens/VideoStudioScreen.tsx");
const custom = read("screens/AudioGenerationScreen.tsx");
const interactive = read("components/scene-media.tsx");

// Inventory: these are the only production callers of the image endpoint.
for (const [name, source] of [["Guided Video Studio", guided], ["Custom Story Builder", custom], ["Interactive Story", interactive]] as const) {
  assert.match(source, /\/api\/video\/image/, `${name} must use the single image API`);
}
assert.match(route, /buildSceneVisualContext\(\{ scene: requestSceneSource, characters: requestCharacters \}\)/,
  "transient Interactive Story requests must use the shared semantic planner");
assert.match(route, /Saved project targets always derive from the server-owned scene/,
  "Guided requests must use canonical persisted scenes");
assert.match(route, /customSceneSource[\s\S]*buildSceneVisualContext/,
  "Custom requests must use canonical saved Custom scenes");
assert.match(interactive, /narration: narrationText/, "Interactive Story must provide story facts to the planner");
assert.match(interactive, /storyDescription: narrationText/, "Interactive Story cannot fall back to a label-only prompt");

const recurringCast = [{ id: "mira", name: "Mira", appearance: "young woman with a silver braid, green travelling coat, crescent pendant" }];
const examples = [
  { genre: "science fiction", title: "Blackout", narration: "Mira watches a citywide blackout from the tower roof.", location: "Mira's apartment" },
  { genre: "fantasy", title: "Dragon Gate", narration: "Mira crosses a ruined stone bridge as a dragon circles the moonlit castle.", location: "mountain pass" },
  { genre: "mystery", title: "Hidden Clue", narration: "Mira discovers a blood-red key beneath the library floorboards.", location: "old library" },
  { genre: "romance", title: "First Promise", narration: "Mira and Elias share an umbrella beneath spring cherry trees.", location: "riverside garden" },
  { genre: "horror", title: "Closed Door", narration: "Mira faces a shadowed door that opens by itself in the abandoned hospital corridor.", location: "hospital corridor" },
  { genre: "realistic drama", title: "Last Bus", narration: "Mira waits alone at a rain-soaked bus stop after an argument.", location: "city street" },
];
for (const example of examples) {
  const planned = buildSceneVisualContext({ scene: example, characters: recurringCast });
  const prompt = buildImagePrompt({ sceneId: example.genre, ...planned, visualBrief: planned.brief, genres: [example.genre] });
  assert.match(prompt, new RegExp(example.narration.split(" ").slice(0, 4).join("\\s+"), "i"), `${example.genre} keeps its defining event`);
  assert.match(prompt, /silver braid/i, `${example.genre} retains canonical character appearance`);
}

const absent = buildSceneVisualContext({
  scene: { title: "Signal", narration: "A disembodied radio voice warns Mira from the empty control room.", location: "control room" },
  characters: [...recurringCast, { id: "echo", name: "ECHO", appearance: "glowing human silhouette" }],
});
assert.deepEqual(absent.characterNames, ["Mira"], "speaking disembodied entities cannot become visible people automatically");

// Planning is deterministic rather than dependent on a provider/LLM. A sparse
// legacy scene therefore still produces a bounded, safe brief instead of
// bypassing the shared pipeline when richer narrative fields are unavailable.
const sparse = buildSceneVisualContext({ scene: { title: "Unwritten Interlude" }, characters: [] });
assert.equal(sparse.brief.sceneTitle, "Unwritten Interlude");
assert.match(buildImagePrompt({ sceneId: "sparse", ...sparse, visualBrief: sparse.brief }), /Unwritten Interlude/i);

console.log("Step 134 system-wide shared image-planning regressions passed.");
