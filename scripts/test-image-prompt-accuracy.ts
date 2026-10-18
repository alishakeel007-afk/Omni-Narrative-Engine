import assert from "node:assert/strict";
// @ts-expect-error Node's experimental TypeScript runner requires the source suffix.
import { buildImagePrompt, buildImageSeed } from "../lib/image/image-prompt.ts";

const workshopScene = {
  sceneId: "workshop-2",
  imagePrompt: "A glitching holographic projection of Mayor Thorne flickers above the Hydro-Memory Weaver while Asha adjusts its brass water-memory coils, with a city skyline visible only through the workshop windows.",
  visualPrompt: "Asha and Riven watch the unstable hologram from a workbench.",
  location: "interior of Asha's futuristic workshop",
  mood: "tense blue holographic light",
  characterNames: ["Asha", "Riven"],
  characterAppearances: [
    "Asha: brown skin, close-cropped black hair, teal mechanic jacket, silver goggles",
    "Riven: lean build, copper curls, charcoal utility coat, amber prosthetic hand",
  ],
  continuityNotes: ["The Hydro-Memory Weaver was built in the previous scene and remains on the central workbench."],
};

const prompt = buildImagePrompt(workshopScene);
assert.match(prompt, /interior scene inside Asha's futuristic workshop/i);
assert.match(prompt, /do not depict an exterior street, rooftop, skyline, or open landscape/i);
assert.match(prompt, /Hydro-Memory Weaver/);
assert.match(prompt, /Asha: brown skin, close-cropped black hair, teal mechanic jacket/i);
assert.match(prompt, /Riven: lean build, copper curls, charcoal utility coat/i);
assert.match(prompt, /glitching holographic projection/i);
assert.ok(prompt.length <= 1200, "prompt must remain within the SDXL-friendly limit");
assert.equal(
  buildImageSeed(workshopScene),
  buildImageSeed({ ...workshopScene, sceneId: "workshop-3", characterNames: ["Riven", "Asha"] }),
  "cast ordering must not change the continuity seed"
);
assert.notEqual(
  buildImageSeed(workshopScene),
  buildImageSeed({ ...workshopScene, characterNames: ["Mayor Thorne"] }),
  "a different cast must not reuse the established cast seed"
);

const rooftopPrompt = buildImagePrompt({
  sceneId: "roof-4",
  imagePrompt: "Asha stands beside the completed Weaver at sunset.",
  location: "sunset rooftop overlooking the city",
  characterNames: ["Asha"],
  characterAppearances: ["Asha: brown skin, close-cropped black hair, teal mechanic jacket, silver goggles"],
});
assert.match(rooftopPrompt, /exterior scene at sunset rooftop overlooking the city/i);
assert.match(rooftopPrompt, /Keep the action outdoors/i);

const changedAppearancePrompt = buildImagePrompt({
  ...workshopScene,
  characterNames: ["Asha"],
  characterAppearances: ["Asha: brown skin, close-cropped black hair, repaired amber field coat, silver goggles"],
  imagePrompt: "Asha repairs her field coat inside the workshop.",
});
assert.match(changedAppearancePrompt, /repaired amber field coat/i, "approved current appearance must be used");
assert.doesNotMatch(changedAppearancePrompt, /Riven:/, "absent characters must not be injected into a scene");

const ensemblePrompt = buildImagePrompt({
  ...workshopScene,
  imagePrompt: "Asha calibrates the Weaver while Riven holds the power conduit.",
});
assert.match(ensemblePrompt, /Asha.*teal mechanic jacket/i);
assert.match(ensemblePrompt, /Riven.*amber prosthetic hand/i);

const styledPrompt = buildImagePrompt({ ...workshopScene, artStyle: "hand-painted retro-futurist watercolor, restrained palette" });
assert.match(styledPrompt, /established project art direction: hand-painted retro-futurist watercolor/i);

console.log("Image prompt accuracy and character continuity tests passed.");
