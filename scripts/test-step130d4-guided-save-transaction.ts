import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "lib/story-database.ts"), "utf8");
const reconcileStart = source.indexOf("export async function reconcileVideoStudioScenes");
const reconcileEnd = source.indexOf("async function upsertSceneMediaAsset", reconcileStart);
assert.ok(reconcileStart >= 0 && reconcileEnd > reconcileStart, "video reconciliation implementation must be present");
const reconcile = source.slice(reconcileStart, reconcileEnd);

// A representative Stage 6 save has several scenes, narration, dialogue, and
// persisted media metadata. Its dialogue rows must be replaced as one batch,
// not by remote round trips for every individual line.
const representativeScenes = [
  { dialogues: [{ character: "Ali", line: "One" }, { character: "Sara", line: "Two" }], narrationAudioUrl: "audio-1", generatedImageUrl: "image-1" },
  { dialogues: [{ character: "Ali", line: "Three" }], backgroundMusicUrl: "music-2" },
  { dialogues: [{ character: "Guide", line: "Four" }, { character: "Sara", line: "Five" }], narrationAudioUrl: "audio-3" },
];
assert.equal(representativeScenes.flatMap((scene) => scene.dialogues).filter((line) => line.line.trim()).length, 5);
assert.equal(new Set(representativeScenes.flatMap((scene) => scene.dialogues).map((line) => line.character.toLowerCase())).size, 3);

assert.match(reconcile, /const existingCharacters = await tx\.character\.findMany/,
  "characters must be resolved once per save transaction");
assert.ok(reconcile.includes("await tx.dialogue.deleteMany({ where: { sceneId: { in: activeSceneIds } } });"),
  "active-scene dialogue cleanup must be batched");
assert.match(reconcile, /tx\.dialogue\.createMany\(\{ data: replacementDialogues \}\)/,
  "replacement dialogue rows must be inserted in one batch");
assert.match(reconcile, /type: MediaType\.IMAGE/, "image media persistence must remain included");
assert.match(reconcile, /type: MediaType\.MUSIC/, "music media persistence must remain included");
assert.match(reconcile, /type: MediaType\.AUDIO/, "narration media persistence must remain included");
assert.match(reconcile, /maxWait: 10_000, timeout: 30_000/,
  "the interactive transaction must have a bounded remote-database window");
assert.match(reconcile, /A submitted scene does not belong to this draft/,
  "stable scene ownership validation must remain enforced");

console.log("Step 130D.4 Guided multi-scene transaction batching regression passed.");
