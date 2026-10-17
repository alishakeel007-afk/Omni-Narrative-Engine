import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// @ts-expect-error Node's focused TypeScript runner requires source extensions.
import { groupPersistedMemories } from "../lib/story-memory-view.ts";

const grouped = groupPersistedMemories([
  { id: "choice", memoryType: "CHOICE", content: "Mara chose the bridge.", importanceScore: 0.9 },
  { id: "character", memoryType: "CHARACTER", content: "Mara trusts Ivo after he saved her.", importanceScore: 0.8 },
  { id: "location", memoryType: "LOCATION", content: "The bridge is unstable.", importanceScore: 0.7 },
  { id: "item", memoryType: "ITEM", content: "Mara carries the brass key.", importanceScore: 0.6 },
  { id: "plot", memoryType: "PLOT", content: "The storm is approaching.", importanceScore: 0.9 },
]);
assert.equal(grouped.choices.length, 1);
assert.equal(grouped.characters[0].content, "Mara trusts Ivo after he saved her.");
assert.equal(grouped.locations.length, 1);
assert.equal(grouped.items.length, 1);
assert.equal(grouped.plot.length, 1);
assert.deepEqual(groupPersistedMemories([]), { choices: [], characters: [], locations: [], items: [], plot: [] });

const context = readFileSync(resolve(process.cwd(), "context/StoryContext.tsx"), "utf8");
const memoryScreen = readFileSync(resolve(process.cwd(), "screens/StoryMemoryScreen.tsx"), "utf8");
const playScreen = readFileSync(resolve(process.cwd(), "screens/StoryPlay.tsx"), "utf8");
const loader = readFileSync(resolve(process.cwd(), "lib/story-database.ts"), "utf8");
const memoryView = readFileSync(resolve(process.cwd(), "lib/story-memory-view.ts"), "utf8");
for (const expected of [
  "readCachedProgressForProject", "cachedSetup?.projectId !== projectId", "storyState?.draftId !== targetDraftId",
  "persistedMemories: storyState.memories", "recoverySource: \"database\"", "attemptedRestoreRef",
  "versionNumber: true", "draftVersion: draft.versionNumber",
  "Recent Scene Timeline", "Characters and Relationships", "Restored from browser/offline cache", "ProtectedRoute",
  "Loaded from saved database project", "Return to Dashboard",
]) assert.ok(`${context}\n${memoryScreen}\n${playScreen}\n${loader}\n${memoryView}`.includes(expected), `Missing Step 28B integration contract: ${expected}`);

console.log("Step 28B persisted-memory grouping, recovery isolation, and project identity tests passed.");
