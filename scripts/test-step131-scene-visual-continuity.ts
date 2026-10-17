import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node TypeScript runner needs the source suffix.
import { buildSceneVisualContext } from "../lib/image/scene-visual-context.ts";
// @ts-expect-error Node TypeScript runner needs the source suffix.
import { buildImageNegativePrompt, buildImagePrompt } from "../lib/image/image-prompt.ts";

const cast = [
  { id: "adam", name: "Adam", appearance: "early thirties, cropped black hair, weathered charcoal field coat, scar at his left brow", role: "hero_male" },
  { id: "zara", name: "Zara", appearance: "young woman with copper curls, teal utility jacket, round silver glasses", role: "hero_female" },
  { id: "observer", name: "Observer", appearance: "tall chrome android with a single amber eye", role: "creature_robot" },
];

const blackout = buildSceneVisualContext({
  scene: {
    title: "The Great Silence",
    narration: "A citywide blackout swallows the futuristic skyline as Adam stands before an abandoned communications tower.",
    imagePrompt: "Wide exterior: the abandoned tower is dark against a powerless futuristic city.",
    location: "exterior city plaza beneath the tower",
    mood: "eerie blue-black night",
  },
  characters: cast,
});
assert.deepEqual(blackout.characterNames, ["Adam"], "named narration characters must be included even without dialogue");
assert.match(blackout.imagePrompt, /citywide blackout/i);
assert.match(blackout.imagePrompt, /abandoned communications tower/i);
assert.match(buildImagePrompt({ sceneId: "one", ...blackout }), /citywide blackout/i);
assert.doesNotMatch(buildImageNegativePrompt({ sceneId: "one", ...blackout }), /unrelated interior room/i, "negative prompts must not contradict a required tower/city blackout view");

const laboratory = buildSceneVisualContext({
  scene: {
    title: "The Ghost in the Machine",
    narration: "Adam and Zara investigate a flickering machine in the basement laboratory.",
    location: "interior basement laboratory",
    dialogueCharacterNames: ["Zara"],
  },
  characters: cast,
  priorScene: { title: "The Great Silence", location: "tower plaza", imagePrompt: "Adam at the tower" },
});
assert.deepEqual(laboratory.characterNames, ["Adam", "Zara"]);
assert.match(laboratory.characterAppearances.join("\n"), /cropped black hair/i);
assert.match(laboratory.characterAppearances.join("\n"), /copper curls/i);
assert.match(laboratory.imagePrompt, /basement laboratory/i);
assert.match(laboratory.continuityNotes.join("\n"), /Adam/);
assert.doesNotMatch(laboratory.characterAppearances.join("\n"), /chrome android/i, "absent characters must not enter the prompt");

const fracturedSky = buildSceneVisualContext({
  scene: {
    title: "The Fractured Sky",
    narration: "Adam reaches the tower roof as the simulated sky cracks open above the city.",
    location: "exterior tower rooftop",
  },
  characters: cast,
  priorScene: { title: "The Ghost in the Machine", location: "basement laboratory", imagePrompt: "Adam and Zara in the laboratory" },
});
assert.deepEqual(fracturedSky.characterNames, ["Adam"]);
assert.match(fracturedSky.imagePrompt, /simulated sky cracks open/i);
assert.match(buildImagePrompt({ sceneId: "three", ...fracturedSky }), /tower rooftop/i);
assert.doesNotMatch(buildImageNegativePrompt({ sceneId: "three", ...fracturedSky }), /unrelated interior room/i);

const studio = readFileSync(resolve(process.cwd(), "screens/VideoStudioScreen.tsx"), "utf8");
const custom = readFileSync(resolve(process.cwd(), "screens/AudioGenerationScreen.tsx"), "utf8");
const provider = readFileSync(resolve(process.cwd(), "lib/image/image-provider.ts"), "utf8");
assert.match(studio, /buildSceneVisualContext/, "Guided generation must use shared visual context");
assert.match(custom, /buildSceneVisualContext/, "Custom generation must use shared visual context");
assert.match(provider, /negative_prompt: buildImageNegativePrompt\(request\)/, "Cloudflare must receive supported contradiction constraints");
assert.match(provider, /guidance: 8/, "Cloudflare prompt adherence must use the documented guidance control");

console.log("Step 131 scene accuracy and character continuity regressions passed.");
