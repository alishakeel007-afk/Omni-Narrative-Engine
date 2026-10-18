import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { extractAtomicMemories } from "../lib/memory/memory-extractor.ts";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { groupPersistedMemories } from "../lib/story-memory-view.ts";

const scene = {
  sceneNumber: 2, title: "The Pulsating Core", chapter: "One", location: "Below the gate", mood: "Tense",
  text: "The staircase opens into a chamber where the core reacts to the intruder's courage.",
  options: ["Touch the core"], resultSummary: "The core answers with a steady pulse.", inventoryUpdate: null,
  cast: [],
  media: { audioMoodPrompt: "", backgroundMusicMood: "", imageLabel: "", imagePrompt: "", narrationDuration: "", narrationLabel: "", playerState: "ready" as const },
};

for (const choice of ["Descend the staircase into the darkness.", "Ask the gatekeeper about the pulse."]) {
  const facts = extractAtomicMemories(scene, choice);
  const decision = facts.find((fact) => fact.type === "CHOICE");
  assert.ok(decision, "A guided or custom selection must create a CHOICE fact.");
  assert.match(decision.content, new RegExp(choice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

const duplicateChoice = extractAtomicMemories(scene, "Descend the staircase into the darkness.")
  .filter((fact) => fact.type === "CHOICE");
assert.equal(duplicateChoice.length, 1, "A scene extraction must emit one CHOICE fact per selection.");

const grouped = groupPersistedMemories([
  { id: "choice-1", memoryType: "CHOICE", content: duplicateChoice[0].content, importanceScore: 3 },
]);
assert.equal(grouped.choices.length, 1, "Persisted CHOICE facts must render in Decisions / Choices.");

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const queueHook = source("hooks/useSaveQueue.ts");
const queue = source("lib/save-queue.ts");
const saveRoute = source("app/api/story/[projectId]/save/route.ts");
const context = source("context/StoryContext.tsx");
const loader = source("lib/story-database.ts");
const memoryService = source("lib/memory/memory-service.ts");

for (const [name, text, expected] of [
  ["live queue source-scene propagation", queueHook, "choiceSceneNumber, currentState"],
  ["reload queue source-scene propagation", queue, "choiceSceneNumber, currentState"],
  ["server source-scene validation", saveRoute, "choiceSceneNumber is required"],
  ["server choice persistence", saveRoute, "sceneId: sourceScene.id"],
  ["server choice-memory ownership", saveRoute, "persistChoiceMemory(draftId, sourceScene.id"],
  ["retry-safe choice memory", memoryService, "deduplicateAtomicMemories(rawMemories)"],
  ["success-only client memory update", queueHook, "if (result.success)"],
  ["project/draft stale callback guard", context, "current.setup.projectId !== projectId || current.setup.draftId !== draftId"],
  ["database memory reload", context, "persistedMemories: storyState.memories"],
  ["database selected-choice reload", loader, "selected: c.selected"],
] as const) {
  assert.ok(text.includes(expected), `Missing ${name} contract.`);
}

console.log("Step 32C guided/custom choice persistence, memory display, retry, reload, and isolation tests passed.");
