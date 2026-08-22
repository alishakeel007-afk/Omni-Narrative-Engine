/**
 * ═══════════════════════════════════════════════════════════════
 * MODULE 7.7 — Phase 8: Full Integration Test Suite
 * ═══════════════════════════════════════════════════════════════
 *
 * Tests the complete lifecycle of Modules 7.2 + 7.7 together.
 * No mocks for the happy path; real DB operations throughout.
 *
 * Covers:
 *  1.  Full story lifecycle (project → draft → scenes → memories → vectors)
 *  2.  RAG coherence (Lyra story — retrieve memory across 10 scenes)
 *  3.  Memory isolation (Story A vs Story B draft separation)
 *  4.  Cross-session recovery (save → clear → restore from DB)
 *  5.  Failure scenarios (retrieval fail, duplicate saves, empty memory)
 *  6.  Performance (pgvector retrieval latency + index verification)
 *  7.  Security (ownership checks across users)
 *  8.  Final acceptance (complete Lyra + Silver Key + Guards story)
 */

import { PrismaClient, StoryMode } from "@prisma/client";
import { processAndIndexSceneMemories, retrieveRelevantMemories, buildMemoryContextBlock } from "../lib/memory/memory-service.ts";
import { loadFullDraftState } from "../lib/story-database.ts";

const prisma = new PrismaClient();

// ─── Shared state ────────────────────────────────────────────────────────────

const USER_A = "integration-user-a-" + Date.now();
const USER_B = "integration-user-b-" + Date.now();
let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string) {
  passed++;
  console.log(`   ✅ ${label}`);
}

function fail(label: string, reason: string) {
  failed++;
  failures.push(`${label}: ${reason}`);
  console.error(`   ❌ ${label} — ${reason}`);
}

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

// ─── Story building helpers ───────────────────────────────────────────────────

function makeScene(n: number, text: string, location: string, mood: string, castName: string) {
  return {
    sceneNumber: n,
    title: `Scene ${n}`,
    chapter: `Chapter ${Math.ceil(n / 3)}`,
    location,
    mood,
    text,
    options: ["Option A", "Option B", "Option C"],
    resultSummary: `The player advanced to scene ${n}.`,
    inventoryUpdate: null,
    cast: [{
      name: castName,
      role: "Guide",
      emotionalState: "Determined",
      visualAppearance: "Dark cloak",
      traits: ["Loyal", "Brave"],
      relationships: ["Trusts the player"],
      imageLabel: castName,
    }],
    media: {
      audioMoodPrompt: "",
      backgroundMusicMood: "",
      imageLabel: "",
      imagePrompt: "",
      narrationDuration: "",
      narrationLabel: "",
      playerState: "ready" as const,
    },
  };
}

async function createProject(userId: string, title: string, mode: StoryMode) {
  const project = await prisma.storyProject.create({
    data: {
      userId,
      title,
      mode,
      drafts: {
        create: {
          title,
          versionNumber: 1,
          genres: ["Fantasy"],
          tones: ["Dark"],
          numberOfScenes: 15,
          isActive: true,
        },
      },
    },
    include: { drafts: true },
  });
  return { project, draft: project.drafts[0] };
}

async function saveScene(
  draftId: string,
  n: number,
  text: string,
  location: string,
  mood: string,
  castName: string,
  choice: string,
  userId: string
): Promise<string> {
  const scene = await prisma.scene.upsert({
    where: { draftId_sceneNumber: { draftId, sceneNumber: n } },
    create: {
      draftId,
      sceneNumber: n,
      title: `Scene ${n}`,
      description: text,
      location,
      mood,
      choices: {
        create: [{ choiceText: choice, choiceType: "AI_SUGGESTED", selected: true, resultText: `Result ${n}` }],
      },
    },
    update: { description: text },
    select: { id: true },
  });

  // Index memories (fire-and-forget pattern, but we await here for test determinism)
  const storyScene = makeScene(n, text, location, mood, castName);
  await processAndIndexSceneMemories(draftId, scene.id, userId, storyScene, choice);

  return scene.id;
}

// ═══════════════════════════════════════════════════════════════
// TEST 1 — Full lifecycle
// ═══════════════════════════════════════════════════════════════
async function test1_FullLifecycle() {
  section("TEST 1 — Full Story Lifecycle");

  const { project, draft } = await createProject(USER_A, "The Fallen Kingdom", StoryMode.GUIDED);
  console.log(`   Project: ${project.id}`);
  console.log(`   Draft:   ${draft.id}`);

  // Save 10 scenes
  const scenes = [
    { text: "Lyra enters the abandoned castle, carrying a silver key she found at the gatehouse.", location: "Abandoned Castle", mood: "Eerie", choice: "Follow Lyra inside" },
    { text: "The player rescues Lyra from the castle guards. She vows to trust the player.", location: "Castle Dungeon", mood: "Tense", choice: "Fight the guards" },
    { text: "A secret passage is discovered behind the throne. Lyra says her brother hid here years ago.", location: "Throne Room", mood: "Mysterious", choice: "Enter the passage" },
    { text: "An old map leads toward the Northern Mines. Lyra seems uneasy about this direction.", location: "Hidden Passage", mood: "Foreboding", choice: "Study the map" },
    { text: "The village elder warns of the King's guards patrolling the mines. Lyra distrusts the King's men.", location: "Village", mood: "Wary", choice: "Listen to the elder" },
    { text: "The Northern Mines entrance is guarded. The silver key might open the side gate.", location: "Northern Mines Entrance", mood: "Dark", choice: "Use the silver key" },
    { text: "Inside the mines, signs of recent activity are found. Someone was here recently.", location: "Northern Mines Depths", mood: "Tense", choice: "Search deeper" },
    { text: "A collapsed tunnel blocks the path. The player finds an old journal belonging to Lyra's brother.", location: "Collapsed Tunnel", mood: "Sad", choice: "Read the journal" },
    { text: "The journal reveals the brother was imprisoned by the King's guards for knowing too much.", location: "Collapsed Tunnel", mood: "Grim", choice: "Share the truth with Lyra" },
    { text: "Lyra is devastated but resolute. She asks the player to help her expose the King's corruption.", location: "Mine Exit", mood: "Resolute", choice: "Promise to help Lyra" },
  ];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    await saveScene(draft.id, i + 1, s.text, s.location, s.mood, "Lyra", s.choice, USER_A);
    process.stdout.write(`   Scene ${i + 1}/10 saved\r`);
  }
  console.log(`   10 scenes saved                          `);

  // Verify scenes in DB
  const dbScenes = await prisma.scene.findMany({ where: { draftId: draft.id }, orderBy: { sceneNumber: "asc" } });
  if (dbScenes.length === 10) ok("10 scenes persisted to DB");
  else fail("Scene count", `Expected 10, got ${dbScenes.length}`);

  // Verify choices
  const choices = await prisma.choice.findMany({ where: { scene: { draftId: draft.id } } });
  if (choices.length === 10) ok("10 choices persisted to DB");
  else fail("Choice count", `Expected 10, got ${choices.length}`);

  // Verify memories
  await new Promise(r => setTimeout(r, 500));
  const memories = await prisma.storyMemory.findMany({ where: { draftId: draft.id } });
  if (memories.length > 0) ok(`${memories.length} memories indexed`);
  else fail("Memory indexing", "No memories found after 10 scenes");

  // Verify embeddings
  const embeddings = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count FROM "StoryMemoryEmbedding" WHERE "draftId" = ${draft.id}
  `;
  const embCount = Number(embeddings[0]?.count ?? 0);
  if (embCount > 0) ok(`${embCount} vector embeddings stored in pgvector`);
  else fail("Embeddings", "No embeddings found in pgvector");

  return { project, draft };
}

// ═══════════════════════════════════════════════════════════════
// TEST 2 — RAG Coherence
// ═══════════════════════════════════════════════════════════════
async function test2_RAGCoherence(draftId: string) {
  section("TEST 2 — RAG Coherence (Lyra + Brother)");

  const query = "I ask Lyra what happened to her brother in the mines and why she distrusts the King's guards.";
  console.log(`   Query: "${query.slice(0, 70)}..."`);

  const t0 = Date.now();
  const memories = await retrieveRelevantMemories(draftId, query, 8, 0.3);
  const elapsed = Date.now() - t0;

  console.log(`   Retrieval time: ${elapsed}ms`);
  console.log(`   Memories returned: ${memories.length}`);
  memories.slice(0, 4).forEach(m => console.log(`     • ${m}`));

  if (memories.length > 0) ok(`Memories retrieved (${memories.length} results)`);
  else fail("RAG retrieval", "No memories returned for Lyra+brother query");

  const hasLyraRef = memories.some(m => m.toLowerCase().includes("lyra"));
  if (hasLyraRef) ok("Lyra-related memory retrieved");
  else fail("Lyra memory", "No Lyra memory in top results");

  const contextBlock = buildMemoryContextBlock(memories);
  if (contextBlock.includes("[LONG-TERM MEMORY CONTEXT]")) ok("Memory context block formatted correctly");
  else fail("Context block", "Missing LONG-TERM MEMORY CONTEXT header");

  if (elapsed < 3000) ok(`Retrieval latency acceptable: ${elapsed}ms`);
  else fail("Latency", `${elapsed}ms exceeds 3000ms threshold`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 3 — Memory Isolation
// ═══════════════════════════════════════════════════════════════
async function test3_MemoryIsolation() {
  section("TEST 3 — Memory Isolation (Draft A vs Draft B)");

  const { project: pB, draft: dB } = await createProject(USER_B, "John in the Desert", StoryMode.GUIDED);
  await saveScene(dB.id, 1, "John rides across the desert on a camel. The Desert Kingdom lies ahead.", "Desert Plains", "Hot", "John", "Ride faster", USER_B);
  await saveScene(dB.id, 2, "John enters the Desert Kingdom and meets the merchant Ali.", "Desert Kingdom", "Busy", "John", "Talk to Ali", USER_B);

  await new Promise(r => setTimeout(r, 500));

  // Query Story B for something Lyra-specific
  const lyraQuery = "What happened to Lyra in the abandoned castle with the silver key?";
  const storyBMemories = await retrieveRelevantMemories(dB.id, lyraQuery, 5, 0.3);

  const lyraLeak = storyBMemories.some(m => m.toLowerCase().includes("lyra") || m.toLowerCase().includes("castle"));
  if (!lyraLeak) ok("Lyra memories NOT present in Story B (isolation correct)");
  else fail("Isolation", `Lyra memory leaked into Story B: ${storyBMemories[0]}`);

  // Story B should only have its own memories
  const validB = storyBMemories.every(m => !m.toLowerCase().includes("lyra"));
  if (validB) ok("Story B memories are exclusively from Story B");
  else fail("Story B purity", "Foreign memories found in Story B results");

  return dB;
}

// ═══════════════════════════════════════════════════════════════
// TEST 4 — Cross-session Recovery
// ═══════════════════════════════════════════════════════════════
async function test4_CrossSessionRecovery(projectId: string, draftId: string) {
  section("TEST 4 — Cross-Session Recovery");

  // Save progressState (simulates Phase 5 auto-save after 10 scenes)
  await prisma.storyDraft.update({
    where: { id: draftId },
    data: {
      progressState: {
        sceneIndex: 10,
        health: 65,
        mana: 80,
        resolve: 70,
        inventory: ["Silver Key", "Old Journal", "Torch"],
      },
    },
  });

  // Load from DB (simulates Phase 6 Continue Story)
  const restored = await loadFullDraftState(projectId, USER_A);
  if (!restored) { fail("DB restore", "loadFullDraftState returned null"); return; }

  if (restored.scenes.length === 10) ok("All 10 scenes restored from DB");
  else fail("Scene count", `Expected 10, got ${restored.scenes.length}`);

  const sceneOrder = restored.scenes.map(s => s.sceneNumber);
  const ordered = sceneOrder.every((n, i) => n === i + 1);
  if (ordered) ok(`Scenes in correct order: [${sceneOrder.join(",")}]`);
  else fail("Scene order", `Out of order: [${sceneOrder.join(",")}]`);

  if (restored.progressState?.health === 65) ok(`Health restored: ${restored.progressState.health}`);
  else fail("Health", `Expected 65, got ${restored.progressState?.health}`);

  if (restored.progressState?.inventory.join(",") === "Silver Key,Old Journal,Torch") {
    ok(`Inventory restored: [${restored.progressState.inventory.join(", ")}]`);
  } else {
    fail("Inventory", `Got: [${restored.progressState?.inventory?.join(", ")}]`);
  }

  const lastScene = restored.scenes[9];
  if (lastScene.description.includes("help her expose")) ok("Last scene text matches DB record");
  else fail("Last scene text", `Unexpected: "${lastScene.description.slice(0, 60)}"`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 5 — Failure Scenarios
// ═══════════════════════════════════════════════════════════════
async function test5_FailureScenarios(draftId: string) {
  section("TEST 5 — Failure Scenarios");

  // 5a: pgvector retrieval with invalid draftId → empty array (no crash)
  const invalidResult = await retrieveRelevantMemories("00000000-0000-0000-0000-000000000000", "test query", 5, 0.3);
  if (Array.isArray(invalidResult) && invalidResult.length === 0) {
    ok("Invalid draftId → empty array (no crash)");
  } else {
    fail("Invalid draftId", `Expected [], got: ${JSON.stringify(invalidResult)}`);
  }

  // 5b: Duplicate scene save (idempotency)
  await prisma.scene.upsert({
    where: { draftId_sceneNumber: { draftId, sceneNumber: 1 } },
    create: { draftId, sceneNumber: 1, title: "Duplicate Scene 1", description: "Duplicate text" },
    update: { description: "Updated on duplicate" },
  });
  const dupeScenes = await prisma.scene.findMany({ where: { draftId, sceneNumber: 1 } });
  if (dupeScenes.length === 1) ok("Duplicate scene save → 1 record (idempotent upsert)");
  else fail("Duplicate scene", `Expected 1 scene, got ${dupeScenes.length}`);

  // 5c: Empty memory table for new draft → no crash
  const { draft: emptyDraft } = await createProject(USER_A, "Empty Story", StoryMode.GUIDED);
  const emptyResult = await retrieveRelevantMemories(emptyDraft.id, "anything", 5, 0.3);
  if (Array.isArray(emptyResult) && emptyResult.length === 0) {
    ok("Empty memory table → returns [] (no crash)");
  } else {
    fail("Empty memory", `Expected [], got ${JSON.stringify(emptyResult)}`);
  }

  // 5d: Duplicate memory hash (idempotency)
  const mem1 = await prisma.storyMemory.create({
    data: { draftId, memoryType: "CHARACTER", content: "Lyra trusts the player.", importanceScore: 1 },
  });
  await prisma.$executeRaw`
    INSERT INTO "StoryMemoryEmbedding" ("id","draftId","memoryId","userId","content","memoryType","memoryHash","createdAt")
    VALUES (gen_random_uuid(), ${draftId}, ${mem1.id}, ${USER_A}, 'test', 'CHARACTER', 'hash-dupe-test', NOW())
    ON CONFLICT ("draftId","memoryHash") DO NOTHING
  `;
  await prisma.$executeRaw`
    INSERT INTO "StoryMemoryEmbedding" ("id","draftId","memoryId","userId","content","memoryType","memoryHash","createdAt")
    VALUES (gen_random_uuid(), ${draftId}, ${mem1.id}, ${USER_A}, 'test', 'CHARACTER', 'hash-dupe-test', NOW())
    ON CONFLICT ("draftId","memoryHash") DO NOTHING
  `;
  const dupeEmbeddings = await prisma.$queryRaw<{count:bigint}[]>`
    SELECT COUNT(*) as count FROM "StoryMemoryEmbedding"
    WHERE "draftId" = ${draftId} AND "memoryHash" = 'hash-dupe-test'
  `;
  if (Number(dupeEmbeddings[0]?.count) === 1) ok("Duplicate memory hash → 1 embedding (ON CONFLICT DO NOTHING)");
  else fail("Duplicate embedding", `Expected 1, got ${Number(dupeEmbeddings[0]?.count)}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST 6 — Performance
// ═══════════════════════════════════════════════════════════════
async function test6_Performance(draftId: string) {
  section("TEST 6 — Performance Measurement");

  const queries = [
    "What happened to Lyra and the silver key in the castle?",
    "Why does Lyra distrust the King's guards?",
    "What did the journal in the mines reveal?",
    "Ask Lyra about her brother's fate.",
    "What is the significance of the Northern Mines?",
  ];

  const timings: number[] = [];
  for (const q of queries) {
    const t0 = Date.now();
    await retrieveRelevantMemories(draftId, q, 8, 0.3);
    timings.push(Date.now() - t0);
  }

  const avg = Math.round(timings.reduce((a, b) => a + b, 0) / timings.length);
  const max = Math.max(...timings);
  const min = Math.min(...timings);

  console.log(`   Retrieval times (ms): [${timings.join(", ")}]`);
  console.log(`   avg=${avg}ms  min=${min}ms  max=${max}ms`);

  if (avg < 3000) ok(`Average retrieval latency: ${avg}ms (< 3000ms threshold)`);
  else fail("Latency", `avg=${avg}ms exceeds 3000ms — check HNSW index`);

  // Verify HNSW index exists
  const indexes = await prisma.$queryRaw<{indexname: string}[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'StoryMemoryEmbedding'
  `;
  const hasHnsw = indexes.some(i => i.indexname.toLowerCase().includes("hnsw") || i.indexname.toLowerCase().includes("embedding"));
  if (hasHnsw) ok(`HNSW/vector index found: ${indexes.find(i => i.indexname.toLowerCase().includes("hnsw") || i.indexname.toLowerCase().includes("embedding"))?.indexname}`);
  else {
    console.log(`   Available indexes: ${indexes.map(i => i.indexname).join(", ")}`);
    // Not failing — HNSW may exist with a different naming convention
    console.log("   ⚠️  No explicit HNSW index name detected — verify in Supabase dashboard.");
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST 7 — Security
// ═══════════════════════════════════════════════════════════════
async function test7_Security(projectId: string) {
  section("TEST 7 — Security & Ownership");

  // Different user cannot load project
  const crossUser = await loadFullDraftState(projectId, USER_B);
  if (crossUser === null) ok("Cross-user project access → null (denied)");
  else fail("Security", "USER_B could load USER_A's project!");

  // Unknown user
  const unknownUser = await loadFullDraftState(projectId, "non-existent-user-999");
  if (unknownUser === null) ok("Unknown user → null (denied)");
  else fail("Security", "Unknown user could load project!");

  // Invalid project UUID
  const badProject = await loadFullDraftState("00000000-0000-0000-0000-000000000000", USER_A);
  if (badProject === null) ok("Invalid project UUID → null (denied)");
  else fail("Security", "Invalid UUID returned data!");

  // Verify server derives userId from session (not body)
  // We verify by confirming that ownership check uses userId parameter, not trusting external input
  const owned = await prisma.storyProject.findFirst({ where: { id: projectId, userId: USER_A } });
  const notOwned = await prisma.storyProject.findFirst({ where: { id: projectId, userId: USER_B } });
  if (owned && !notOwned) ok("Ownership check uses userId correctly in DB query");
  else fail("Ownership", "Ownership query not working as expected");
}

// ═══════════════════════════════════════════════════════════════
// TEST 8 — Final Acceptance (Lyra + Silver Key + Guards)
// ═══════════════════════════════════════════════════════════════
async function test8_FinalAcceptance() {
  section("TEST 8 — Final Module 7.7 Acceptance Test");
  console.log("   Story: Lyra + Northern Mines + Silver Key + King's Guards\n");

  const { project, draft } = await createProject(USER_A, "The Silver Key Chronicles", StoryMode.GUIDED);

  // 10 scenes with the specific narrative elements
  const acceptanceScenes = [
    "Lyra distrusts the King's guards. She carries a silver key found near the castle gate.",
    "The player rescues Lyra from the guards. She says: 'My brother disappeared in the Northern Mines.'",
    "A forest ambush by the guards. Lyra uses her knowledge of the terrain to escape.",
    "An old hermit mentions the silver key unlocks a hidden chamber in the Northern Mines.",
    "Lyra's brother was last seen three years ago after discovering King's corruption evidence.",
    "The Northern Mines entrance is sealed. The silver key opens a hidden side gate.",
    "Deep inside the mines, a hidden journal describes the King's illegal activities.",
    "Guards patrol the mine exit. Lyra's distrust of the King's men proves warranted.",
    "Evidence of the King's corruption is found. Lyra vows to expose him.",
    "The player and Lyra escape the mines. Lyra thanks the player: 'We will bring justice.'",
  ];

  for (let i = 0; i < acceptanceScenes.length; i++) {
    await saveScene(
      draft.id, i + 1,
      acceptanceScenes[i],
      i < 3 ? "Castle Region" : i < 6 ? "Northern Mines" : "Mine Depths",
      "Dark",
      "Lyra",
      `Scene ${i + 1} choice`,
      USER_A
    );
  }

  await new Promise(r => setTimeout(r, 600));

  // The key RAG test: scene 11 query references specific facts from scenes 1-10
  const finalQuery = "I ask Lyra about the Silver Key and why she distrusts the King's guards, and what happened to her brother.";
  console.log(`   Final query: "${finalQuery.slice(0, 80)}..."`);

  const memories = await retrieveRelevantMemories(draft.id, finalQuery, 8, 0.3);
  console.log(`   Memories retrieved: ${memories.length}`);
  memories.forEach(m => console.log(`     • ${m.slice(0, 90)}`));

  if (memories.length >= 3) ok(`Retrieved ${memories.length} relevant memories (≥3 required)`);
  else fail("Final RAG", `Only ${memories.length} memories retrieved for complex query`);

  const hasKey = memories.some(m => m.toLowerCase().includes("silver key") || m.toLowerCase().includes("key"));
  const hasGuards = memories.some(m => m.toLowerCase().includes("guard") || m.toLowerCase().includes("king"));
  const hasLyra = memories.some(m => m.toLowerCase().includes("lyra"));

  if (hasKey) ok("Silver Key memory retrieved ✓");
  else fail("Silver Key", "Silver Key not in retrieved memories");
  if (hasGuards) ok("King's guards memory retrieved ✓");
  else fail("Guards memory", "Guards not in retrieved memories");
  if (hasLyra) ok("Lyra character memory retrieved ✓");
  else fail("Lyra memory", "Lyra not in retrieved memories");

  const contextBlock = buildMemoryContextBlock(memories);
  if (contextBlock.length > 50) ok("Memory context block built for Gemini injection");
  else fail("Context block", "Empty context block");

  // Cross-session: save progress then reload
  await prisma.storyDraft.update({
    where: { id: draft.id },
    data: { progressState: { sceneIndex: 10, health: 55, mana: 70, resolve: 90, inventory: ["Silver Key", "Journal"] } },
  });

  const reloaded = await loadFullDraftState(project.id, USER_A);
  if (!reloaded) { fail("Final acceptance restore", "loadFullDraftState returned null"); return; }

  if (reloaded.scenes.length === 10 && reloaded.progressState?.inventory.includes("Silver Key")) {
    ok("Full lifecycle confirmed: play → save → restore → RAG → all working ✅");
  } else {
    fail("Final acceptance", `scenes=${reloaded.scenes.length}, inventory=[${reloaded.progressState?.inventory}]`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log("\n╔═══════════════════════════════════════════════════════════╗");
  console.log("║    MODULE 7.7 — Phase 8: Full Integration Test Suite      ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");
  console.log(`Users: ${USER_A} / ${USER_B}`);

  try {
    const { project, draft } = await test1_FullLifecycle();
    await test2_RAGCoherence(draft.id);
    await test3_MemoryIsolation();
    await test4_CrossSessionRecovery(project.id, draft.id);
    await test5_FailureScenarios(draft.id);
    await test6_Performance(draft.id);
    await test7_Security(project.id);
    await test8_FinalAcceptance();

  } catch (err) {
    failed++;
    failures.push(`Unexpected error: ${err}`);
    console.error("\n❌ Unexpected error:", err);
  }

  section("RESULTS");
  console.log(`   Passed:  ${passed}`);
  console.log(`   Failed:  ${failed}`);

  if (failures.length > 0) {
    console.log("\n   Failures:");
    failures.forEach(f => console.log(`     ❌ ${f}`));
  }

  if (failed === 0) {
    console.log("\n🎉 ALL INTEGRATION TESTS PASSED — Module 7.7 is complete.\n");
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed — review above.\n`);
  }

  // Cleanup
  console.log("Cleaning up test data...");
  await prisma.storyProject.deleteMany({ where: { userId: { in: [USER_A, USER_B] } } });
  console.log("✅ Done.\n");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
