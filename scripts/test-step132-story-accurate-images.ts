import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node TypeScript runner needs the source suffix.
import { buildSceneVisualContext } from "../lib/image/scene-visual-context.ts";
// @ts-expect-error Node TypeScript runner needs the source suffix.
import { buildImageNegativePrompt, buildImagePrompt } from "../lib/image/image-prompt.ts";

const cast = [
  { id: "adam", name: "Adam", appearance: "early thirties, cropped black hair, charcoal field coat, scar at his left brow" },
  { id: "zara", name: "Zara", appearance: "young woman with copper curls, teal utility jacket, round silver glasses" },
  { id: "observer", name: "Observer", appearance: "tall chrome android with one amber eye" },
];
const blackout = buildSceneVisualContext({
  scene: { id: "one", title: "The Great Silence", narration: "A citywide blackout swallows the futuristic skyline as Adam stands before an abandoned communications tower.", location: "Adam's apartment", visualPrompt: "Show the powerless city and the mysterious tower." }, characters: cast,
});
assert.match(blackout.brief.requiredVisualEvents.join(" "), /citywide blackout/i);
assert.match(blackout.brief.requiredVisualEvents.join(" "), /abandoned communications tower/i);
assert.deepEqual(blackout.brief.presentCharacterNames, ["Adam"]);
assert.equal(blackout.brief.interiorOrExterior, "exterior", "a required city/tower event must resolve an indoor conflict to an exterior composition");
assert.ok(blackout.brief.warnings.length > 0, "a genuine conflict must be inspectable before generation");
assert.match(buildImagePrompt({ sceneId: "one", ...blackout, visualBrief: blackout.brief }), /REQUIRED VISUAL EVENTS/i);
assert.doesNotMatch(buildImageNegativePrompt({ sceneId: "one", ...blackout, visualBrief: blackout.brief }), /exterior|rooftop|laboratory/i, "negative prompt cannot oppose required facts");

const lab = buildSceneVisualContext({
  scene: { id: "two", title: "The Ghost in the Machine", narration: "Adam and Zara investigate ECHO, a flickering machine, in Zara's underground laboratory.", location: "underground laboratory", dialogueCharacterNames: ["Zara"] }, characters: cast,
});
assert.deepEqual(lab.brief.presentCharacterNames, ["Adam", "Zara"]);
assert.match(lab.brief.visibleCharacterActions.join(" "), /investigate/i);
assert.ok(!lab.brief.presentCharacterNames.includes("Observer"), "absent cast must be excluded");
assert.match(buildImagePrompt({ sceneId: "two", ...lab, visualBrief: lab.brief }), /Adam.*Zara|Zara.*Adam/i);

const sky = buildSceneVisualContext({
  scene: { id: "three", title: "The Fractured Sky", narration: "Adam witnesses the simulated sky cracking apart above the tower roof, exposing broken simulation geometry.", location: "tower rooftop" }, characters: cast,
});
assert.match(sky.brief.requiredVisualEvents.join(" "), /simulated sky cracking/i);
assert.match(buildImagePrompt({ sceneId: "three", ...sky, visualBrief: sky.brief }), /broken simulation geometry/i);

const approved = buildSceneVisualContext({
  scene: { id: "four", title: "Signal", narration: "ECHO speaks through the laboratory speakers while Adam watches.", location: "laboratory", visualDirection: { primaryLocation: "wide exterior city view", composition: "wide establishing shot", requiredEvent: "the dark city and tower beacon", visibleCharacterIds: ["adam"] } }, characters: cast,
});
assert.equal(approved.brief.primaryLocation, "wide exterior city view");
assert.deepEqual(approved.brief.presentCharacterNames, ["Adam"], "approved visible cast must not turn a speaking AI into a human figure");
assert.match(buildImagePrompt({ sceneId: "four", ...approved, visualBrief: approved.brief }), /tower beacon/i);

const route = readFileSync(resolve(process.cwd(), "app/api/video/image/route.ts"), "utf8");
const database = readFileSync(resolve(process.cwd(), "lib/story-database.ts"), "utf8");
const guided = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
const custom = readFileSync(resolve(process.cwd(), "screens/AudioGenerationScreen.tsx"), "utf8");
assert.match(route, /Saved project targets always derive from the server-owned scene/, "saved requests must rebuild their visual source on the server");
assert.match(route, /videoStudioState/, "server must read saved approved visual directions");
assert.match(database, /imagePrompt: input\.imagePrompt/, "authored image prompts must survive Guided save/resume");
assert.match(guided, /Review visual brief before generating/, "Guided Stage 6 must expose the brief");
assert.match(guided, /Primary visual location/, "users must be able to correct the visual direction without editing narration");
assert.match(guided, /Replace This Scene Image/, "single-scene replacement must use the same pipeline");
assert.match(guided, /replacementSceneId/, "single-scene replacement must be constrained by stable scene identity");
assert.match(guided, /const isReplacement = forceRegenerateAll \|\| Boolean\(replacementSceneId\) \|\| Boolean\(scene\.generatedImageOutdated\)/, "Guided replacements retain their old URL until success");
assert.doesNotMatch(custom, /generatedImageUrl: undefined, generatedImagePrompt: undefined/, "Custom replacement attempts must preserve prior images");
console.log("Step 132 story-accurate image visual-brief regressions passed.");
