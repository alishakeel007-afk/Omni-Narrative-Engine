// @ts-expect-error Node's native TypeScript runner requires source extensions.
import { extractAtomicMemories } from "../lib/memory/memory-extractor.ts";
// @ts-expect-error Node's native TypeScript runner requires source extensions.
import { buildPrompt } from "../lib/story-prompt.ts";
// @ts-expect-error Node's native TypeScript runner requires source extensions.
import { DEFAULT_STORY_SETUP } from "../lib/story-storage.ts";
// @ts-expect-error Node's native TypeScript runner requires source extensions.
import { evaluateCharacterRuntimeUpdate } from "../lib/character-consistency.ts";

const scene = {
  sceneNumber: 2,
  title: "The Mine Gate",
  chapter: "Chapter One",
  location: "Northern Mines",
  mood: "Tense",
  text: "Lyra uses the Silver Key to open a concealed gate beneath the Northern Mines while the King's guards search the road above.",
  options: ["Enter the mine", "Hide the key", "Question Lyra"],
  resultSummary: "The Silver Key opened the concealed mine gate.",
  inventoryUpdate: { action: "add" as const, item: "Mine Map", reason: "Found behind the gate" },
  cast: [{ name: "Lyra", role: "Interpreter", emotionalState: "Determined", visualAppearance: "Silver armor", traits: ["Brave"], relationships: ["Trusts the player"], imageLabel: "Lyra" }],
  media: { audioMoodPrompt: "", backgroundMusicMood: "", imageLabel: "", imagePrompt: "", narrationDuration: "", narrationLabel: "", playerState: "ready" as const }
};

const memories = extractAtomicMemories(scene, "Use the Silver Key at the mine gate");
const kinds = new Set(memories.map((memory) => memory.type));
for (const expected of ["CHARACTER", "LOCATION", "ITEM", "CHOICE", "PLOT"]) {
  if (!kinds.has(expected as typeof memories[number]["type"])) throw new Error(`Missing ${expected} memory.`);
}

const prompt = buildPrompt({
  setup: { ...DEFAULT_STORY_SETUP, characters: [{ ...DEFAULT_STORY_SETUP.characters[0], name: "Lyra", role: "Interpreter", traits: ["Brave"] }] },
  choice: "Use the Silver Key at the mine gate",
  currentScene: scene,
  sceneNumber: 3,
  memoryTimeline: [{ choiceType: "Custom", location: "Northern Mines", mood: "Tense", result: "The gate opened.", sceneNumber: 2, timestamp: "now", update: "Location changed", userChoice: "Use the Silver Key" }],
  playerState: { health: 70, mana: 50, resolve: 80, inventory: ["Silver Key", "Mine Map"] },
  recentSceneHistory: [scene],
  characterContextBlock: "Established Characters (maintain strict consistency for these):\n- Lyra (Interpreter): Personality: brave. Traits: Brave. Visual: Silver armor."
});

for (const expected of ["Silver Key", "Mine Map", "Northern Mines", "Established Characters", "Player chose"]) {
  if (!prompt.includes(expected)) throw new Error(`Prompt lost continuity fact: ${expected}`);
}

const established = evaluateCharacterRuntimeUpdate({ existingAppearance: "Silver armor", lastSeenScene: 3, nextSceneNumber: 2 });
if (established.canSetAppearance || established.canUpdateState) throw new Error("Older scene overwrote established character state.");
const firstAppearance = evaluateCharacterRuntimeUpdate({ existingAppearance: null, lastSeenScene: null, nextSceneNumber: 1 });
if (!firstAppearance.canSetAppearance || !firstAppearance.canUpdateState) throw new Error("Initial character state was rejected.");

console.log("Phase 2 narrative intelligence tests passed.");
