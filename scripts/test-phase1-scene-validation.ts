// @ts-expect-error Node's native TypeScript runner requires the source extension.
import { normalizeGeneratedScene } from "../lib/story-scene.ts";

const validScene = {
  title: "The Observatory Stirs", chapter: "Chapter One", location: "Forgotten Observatory", mood: "Suspenseful",
  text: "Lyra steps beneath the observatory as the ancient machine wakes and repeats her name from the darkness.",
  options: ["Inspect the machine", "Call to the hidden voice", "Search for another exit"],
  cast: [{ name: "Lyra", role: "Interpreter", traits: ["Curious"] }], media: { imagePrompt: "A dark observatory" }
};

const scene = normalizeGeneratedScene(validScene, 2);
if (scene.sceneNumber !== 2 || scene.options.length !== 3 || scene.cast[0]?.name !== "Lyra") throw new Error("Valid scene normalization failed.");

for (const invalidScene of [
  { ...validScene, options: ["Repeat", "Repeat", "Third"] },
  { ...validScene, text: "Too short" }
]) {
  let rejected = false;
  try { normalizeGeneratedScene(invalidScene, 2); } catch { rejected = true; }
  if (!rejected) throw new Error("Invalid AI scene was accepted.");
}

console.log("Phase 1 scene validation tests passed.");
