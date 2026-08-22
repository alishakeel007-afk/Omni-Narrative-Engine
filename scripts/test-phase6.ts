/**
 * Phase 6 Tests — DB Restore / Continue
 * Tests: load, scene ordering, health/inventory restoration, access control, empty draft.
 */
import { PrismaClient, StoryMode, ChoiceType as PChoiceType } from "@prisma/client";
import { loadFullDraftState } from "../lib/story-database";

const prisma = new PrismaClient();

async function createTestStory(userId: string, scenesCount: number) {
  const project = await prisma.storyProject.create({
    data: {
      userId,
      title: "Phase 6 Test Story",
      mode: StoryMode.GUIDED,
      drafts: {
        create: {
          versionNumber: 1,
          title: "Draft v1",
          genres: ["Fantasy", "Adventure"],
          tones: ["Dark", "Epic"],
          numberOfScenes: 10,
          isActive: true,
          progressState: {
            sceneIndex: scenesCount,
            health: 75,
            mana: 50,
            resolve: 60,
            inventory: ["Silver Key", "Torch"],
          },
          characters: {
            create: [{ name: "Lyra", role: "Guide", personalityTone: "Brave", traits: ["Loyal"] }]
          }
        }
      }
    },
    include: { drafts: { include: { characters: true } } }
  });

  const draft = project.drafts[0];

  for (let i = 1; i <= scenesCount; i++) {
    await prisma.scene.create({
      data: {
        draftId: draft.id,
        sceneNumber: i,
        title: `Scene ${i}`,
        description: `Narrative text for scene ${i}.`,
        location: `Location ${i}`,
        mood: "Tense",
        choices: {
          create: [{
            choiceText: `Choice made at scene ${i}`,
            choiceType: PChoiceType.AI_SUGGESTED,
            selected: true,
            resultText: `Result of choice at scene ${i}`,
          }]
        }
      }
    });

    await prisma.storyMemory.create({
      data: {
        draftId: draft.id,
        memoryType: "CHOICE",
        content: `The player chose action ${i}.`,
        importanceScore: 1,
      }
    });
  }

  return { project, draft };
}

async function runPhase6Tests() {
  console.log("🚀 Phase 6 DB Restore Tests\n");
  const userId = "test-user-phase6-" + Date.now();
  const otherUserId = "other-user-phase6-" + Date.now();

  const { project, draft } = await createTestStory(userId, 5);
  await createTestStory(otherUserId, 3); // other user's story

  // ── Test 1: Load existing story ──────────────────────────────────────────────
  console.log("--- Test 1: Load existing story ---");
  const loaded = await loadFullDraftState(project.id, userId);
  if (!loaded) throw new Error("❌ Test 1 Failed: loadFullDraftState returned null.");
  console.log(`   Loaded project: ${loaded.projectId}`);
  console.log(`   Title: ${loaded.title}`);
  console.log(`   Scenes: ${loaded.scenes.length}`);
  console.log(`   Characters: ${loaded.characters.length}`);
  console.log(`   Memories: ${loaded.memories.length}`);
  if (loaded.scenes.length !== 5) throw new Error("❌ Test 1 Failed: Wrong scene count.");
  if (loaded.characters.length !== 1) throw new Error("❌ Test 1 Failed: Wrong character count.");
  if (loaded.memories.length !== 5) throw new Error("❌ Test 1 Failed: Wrong memory count.");
  console.log("✅ Test 1 Passed. Full story loaded.");

  // ── Test 2: Scene ordering ────────────────────────────────────────────────────
  console.log("\n--- Test 2: Scene ordering ---");
  const sceneNums = loaded.scenes.map(s => s.sceneNumber);
  if (JSON.stringify(sceneNums) !== JSON.stringify([1, 2, 3, 4, 5])) {
    throw new Error(`❌ Test 2 Failed: Scenes out of order: ${JSON.stringify(sceneNums)}`);
  }
  console.log(`   Scene numbers: ${sceneNums}`);
  console.log("✅ Test 2 Passed. Scenes ordered 1→5.");

  // ── Test 3: Health / Inventory restoration ────────────────────────────────────
  console.log("\n--- Test 3: Health/inventory restoration ---");
  if (!loaded.progressState) throw new Error("❌ Test 3 Failed: No progressState.");
  const ps = loaded.progressState;
  if (ps.health !== 75) throw new Error(`❌ Test 3 Failed: health=${ps.health}, expected 75.`);
  if (ps.mana !== 50) throw new Error(`❌ Test 3 Failed: mana=${ps.mana}, expected 50.`);
  if (ps.resolve !== 60) throw new Error(`❌ Test 3 Failed: resolve=${ps.resolve}, expected 60.`);
  if (ps.inventory.join(",") !== "Silver Key,Torch") throw new Error(`❌ Test 3 Failed: inventory=[${ps.inventory}]`);
  console.log(`   health=${ps.health} mana=${ps.mana} resolve=${ps.resolve} inventory=[${ps.inventory}]`);
  console.log("✅ Test 3 Passed. Health/inventory restored correctly.");

  // ── Test 4: Cross-user access denied ─────────────────────────────────────────
  console.log("\n--- Test 4: Access control ---");
  const crossUserResult = await loadFullDraftState(project.id, otherUserId);
  if (crossUserResult !== null) throw new Error("❌ Test 4 Failed: Cross-user access was allowed!");
  console.log("✅ Test 4 Passed. Other user cannot load our story.");

  // ── Test 5: Invalid projectId ─────────────────────────────────────────────────
  console.log("\n--- Test 5: Invalid projectId ---");
  const invalidResult = await loadFullDraftState("00000000-0000-0000-0000-000000000000", userId);
  if (invalidResult !== null) throw new Error("❌ Test 5 Failed: Should return null for non-existent project.");
  console.log("✅ Test 5 Passed. Returns null for non-existent project.");

  // ── Test 6: Empty/new draft ───────────────────────────────────────────────────
  console.log("\n--- Test 6: Empty draft (no scenes) ---");
  const emptyProject = await prisma.storyProject.create({
    data: {
      userId,
      title: "Empty Story",
      mode: StoryMode.GUIDED,
      drafts: { create: { versionNumber: 1, title: "Empty Draft", genres: [], tones: [], numberOfScenes: 5, isActive: true } }
    },
    include: { drafts: true }
  });
  const emptyResult = await loadFullDraftState(emptyProject.id, userId);
  if (!emptyResult) throw new Error("❌ Test 6 Failed: Should return project with 0 scenes, not null.");
  if (emptyResult.scenes.length !== 0) throw new Error("❌ Test 6 Failed: Expected 0 scenes.");
  console.log("✅ Test 6 Passed. Empty draft handled without crash.");

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  console.log("\nCleaning up...");
  await prisma.storyProject.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  console.log("✅ Cleanup complete.");
  console.log("\n🎉 All Phase 6 tests passed!");
}

runPhase6Tests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
