import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node's native TypeScript runner needs source extensions.
import { extractAtomicMemories } from "../lib/memory/memory-extractor.ts";
// @ts-expect-error Node's native TypeScript runner needs source extensions.
import { buildPrompt } from "../lib/story-prompt.ts";
// @ts-expect-error Node's native TypeScript runner needs source extensions.
import { DEFAULT_STORY_SETUP } from "../lib/story-storage.ts";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const scene = {
  sceneNumber: 2, title: "The bridge", chapter: "One", location: "Old bridge", mood: "Tense",
  text: "Ari protects Bo at the old bridge after their earlier promise.",
  options: ["Hold the bridge", "Retreat together"], resultSummary: "Ari holds the bridge so Bo can escape.",
  inventoryUpdate: null,
  cast: [{ name: "Ari", role: "Scout", emotionalState: "Resolute", visualAppearance: "Blue coat", traits: ["loyal"], relationships: ["Protects Bo"], imageLabel: "Ari" }],
  media: { audioMoodPrompt: "", backgroundMusicMood: "", imageLabel: "", imagePrompt: "", narrationDuration: "", narrationLabel: "", playerState: "ready" as const },
};

const facts = extractAtomicMemories(scene, "Hold the bridge");
for (const type of ["CHOICE", "CHARACTER", "LOCATION", "PLOT"]) {
  if (!facts.some((fact) => fact.type === type)) throw new Error(`Expected ${type} continuity fact.`);
}

const prompt = buildPrompt({
  setup: { ...DEFAULT_STORY_SETUP, characters: [{ name: "Ari", role: "Scout", personalityTone: "loyal", traits: ["loyal"], voiceStyle: "warm" }] },
  choice: "Hold the bridge", currentScene: scene, sceneNumber: 3,
  memoryTimeline: [{ choiceType: "AI Suggested", location: "Old bridge", mood: "Tense", result: "Bo escaped.", sceneNumber: 2, timestamp: "now", update: "", userChoice: "Hold the bridge" }],
  recentSceneHistory: [scene],
  characterContextBlock: "- Ari (Scout): Personality: loyal. Visual: Blue coat.",
  memoryContextBlock: "[CHOICE] Ari protected Bo at the bridge.",
});
for (const expected of ["Ari", "Blue coat", "Hold the bridge", "protected Bo"]) {
  if (!prompt.includes(expected)) throw new Error(`Prompt omitted continuity detail: ${expected}`);
}

const setupForm = source("components/story-setup-form.tsx");
const saveRoute = source("app/api/story/[projectId]/save/route.ts");
const context = source("context/StoryContext.tsx");
const memoryService = source("lib/memory/memory-service.ts");
const dialogueRoute = source("app/api/story/generate-dialogue/route.ts");
const sceneRoute = source("app/api/story/generate-scene/route.ts");

for (const [name, text, required] of [
  ["setup character persistence", setupForm, "characters: setup.characters"],
  ["source-scene selection", saveRoute, "choiceSceneNumber"],
  ["reload choice restoration", context, "options: lastDbScene.choices.map"],
  ["reload character state", context, "currentEmotionalState"],
  ["embedding failure fallback", memoryService, "retrieveRecentNarrativeFacts"],
  ["deduplicated recovery", memoryService, "deduplicateAtomicMemories"],
  ["dialogue draft ownership", dialogueRoute, "Story draft not found or access denied"],
  ["scene draft/setup isolation", sceneRoute, "Story setup does not match the requested draft"],
] as const) {
  if (!text.includes(required)) throw new Error(`Missing ${name} integration contract.`);
}

console.log("Step 25A story, character, and memory integration tests passed.");
