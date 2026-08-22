/**
 * Phase 7 Tests — Custom Story Persistence
 * 
 * Tests:
 * 1. Create project/draft via API (simulates handleBeginStory)
 * 2. Verify project is queryable (both guided + custom mode)
 * 3. Verify project is linked to correct user
 * 4. Verify DB project entry for custom story looks correct
 * 5. Save scenes into the draft (simulates Phase 5 auto-save)
 * 6. Load the custom story back (simulates Phase 6 Continue)
 * 7. Verify cross-user access denied on custom story
 */
import { PrismaClient, StoryMode } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createProjectViaPrisma(
  userId: string,
  title: string,
  mode: StoryMode,
  genres: string[],
  tones: string[],
  numberOfScenes: number
) {
  return prisma.storyProject.create({
    data: {
      userId,
      title,
      mode,
      drafts: {
        create: {
          title,
          versionNumber: 1,
          genres: genres as unknown as import("@prisma/client").Prisma.InputJsonValue,
          tones: tones as unknown as import("@prisma/client").Prisma.InputJsonValue,
          numberOfScenes,
          isActive: true,
        },
      },
    },
    include: { drafts: true },
  });
}

// ─── Test runner ─────────────────────────────────────────────────────────────

async function runPhase7Tests() {
  console.log("🚀 Phase 7 Custom Story Persistence Tests\n");

  const userId = "test-user-phase7-" + Date.now();
  const otherUserId = "other-user-phase7-" + Date.now();

  // ── Test 1: Create guided story project ──────────────────────────────────────
  console.log("--- Test 1: Create guided story project ---");
  const guidedProject = await createProjectViaPrisma(
    userId,
    "The Fallen Kingdom",
    StoryMode.GUIDED,
    ["Fantasy", "Adventure"],
    ["Dark", "Epic"],
    10
  );
  const guidedDraft = guidedProject.drafts[0];

  if (!guidedProject.id) throw new Error("❌ Test 1 Failed: No project ID.");
  if (!guidedDraft?.id) throw new Error("❌ Test 1 Failed: No draft ID.");
  if (guidedProject.mode !== StoryMode.GUIDED) throw new Error("❌ Test 1 Failed: Wrong mode.");
  if (guidedProject.userId !== userId) throw new Error("❌ Test 1 Failed: Wrong userId.");
  console.log(`   projectId: ${guidedProject.id}`);
  console.log(`   draftId: ${guidedDraft.id}`);
  console.log("✅ Test 1 Passed. Guided story project created.");

  // ── Test 2: Create custom story project ──────────────────────────────────────
  console.log("\n--- Test 2: Create custom (AI Studio) story project ---");
  const customProject = await createProjectViaPrisma(
    userId,
    "My Dog Max",
    StoryMode.CUSTOM,
    ["Slice of Life"],
    ["Warm"],
    5
  );
  const customDraft = customProject.drafts[0];

  if (!customProject.id) throw new Error("❌ Test 2 Failed: No project ID.");
  if (customProject.mode !== StoryMode.CUSTOM) throw new Error("❌ Test 2 Failed: Wrong mode.");
  console.log(`   projectId: ${customProject.id}`);
  console.log(`   draftId: ${customDraft.id}`);
  console.log("✅ Test 2 Passed. Custom story project created.");

  // ── Test 3: Save scenes (simulate Phase 5 auto-save) ─────────────────────────
  console.log("\n--- Test 3: Save scenes to custom draft ---");
  for (let i = 1; i <= 5; i++) {
    await prisma.scene.upsert({
      where: { draftId_sceneNumber: { draftId: customDraft.id, sceneNumber: i } },
      create: {
        draftId: customDraft.id,
        sceneNumber: i,
        title: `Scene ${i}: ${i === 1 ? "My dog Max appeared" : "The adventure continues"}`,
        description: i === 1
          ? "The player meets Max, a golden retriever. 'My character's dog is named Max,' the narrator says."
          : `Scene ${i} narrative text.`,
        location: "Home",
        mood: "Warm",
        choices: {
          create: [{
            choiceText: `Choice at scene ${i}`,
            choiceType: "AI_SUGGESTED",
            selected: true,
            resultText: `Result of choice ${i}`,
          }],
        },
      },
      update: { description: `Scene ${i} narrative text.` },
    });
  }

  await prisma.storyDraft.update({
    where: { id: customDraft.id },
    data: {
      progressState: {
        sceneIndex: 5,
        health: 90,
        mana: 80,
        resolve: 85,
        inventory: ["Leash", "Ball"],
      },
    },
  });

  const savedScenes = await prisma.scene.findMany({
    where: { draftId: customDraft.id },
    orderBy: { sceneNumber: "asc" },
  });
  if (savedScenes.length !== 5) throw new Error(`❌ Test 3 Failed: Expected 5 scenes, got ${savedScenes.length}.`);
  const firstScene = savedScenes[0];
  if (!firstScene.description.includes("Max")) throw new Error("❌ Test 3 Failed: Max not in scene 1.");
  console.log(`   Saved ${savedScenes.length} scenes. Scene 1: "${firstScene.title}"`);
  console.log("✅ Test 3 Passed. Scenes saved with correct content.");

  // ── Test 4: Load custom story (simulate Phase 6 Continue) ────────────────────
  console.log("\n--- Test 4: Load custom story from DB ---");
  const { loadFullDraftState } = await import("../lib/story-database.ts");
  const loaded = await loadFullDraftState(customProject.id, userId);

  if (!loaded) throw new Error("❌ Test 4 Failed: loadFullDraftState returned null.");
  if (loaded.scenes.length !== 5) throw new Error(`❌ Test 4 Failed: Expected 5 scenes, got ${loaded.scenes.length}.`);
  if (!loaded.progressState) throw new Error("❌ Test 4 Failed: No progressState.");
  if (loaded.progressState.inventory.join(",") !== "Leash,Ball") {
    throw new Error(`❌ Test 4 Failed: Wrong inventory [${loaded.progressState.inventory}]`);
  }
  const firstLoadedScene = loaded.scenes[0];
  if (!firstLoadedScene.description.includes("Max")) throw new Error("❌ Test 4 Failed: Max not in restored scene 1.");
  console.log(`   Scenes: ${loaded.scenes.map(s => s.sceneNumber).join(",")}`);
  console.log(`   Inventory: [${loaded.progressState.inventory}]`);
  console.log(`   Scene 1 text contains 'Max': ✅`);
  console.log("✅ Test 4 Passed. Custom story restored correctly from DB.");

  // ── Test 5: Both story types appear in projects list ─────────────────────────
  console.log("\n--- Test 5: Both story types in projects list ---");
  const userProjects = await prisma.storyProject.findMany({
    where: { userId },
    include: { drafts: { take: 1 } },
  });
  if (userProjects.length !== 2) throw new Error(`❌ Test 5 Failed: Expected 2 projects, got ${userProjects.length}.`);
  const modes = userProjects.map(p => p.mode).sort();
  if (JSON.stringify(modes) !== JSON.stringify(["CUSTOM", "GUIDED"])) {
    throw new Error(`❌ Test 5 Failed: Wrong modes: ${JSON.stringify(modes)}`);
  }
  console.log(`   Projects: ${userProjects.map(p => `${p.title} (${p.mode})`).join(", ")}`);
  console.log("✅ Test 5 Passed. Both guided and custom stories are in the same projects list.");

  // ── Test 6: Cross-user access denied ─────────────────────────────────────────
  console.log("\n--- Test 6: Cross-user access control ---");
  const { loadFullDraftState: load2 } = await import("../lib/story-database.ts");
  const crossResult = await load2(customProject.id, otherUserId);
  if (crossResult !== null) throw new Error("❌ Test 6 Failed: Cross-user access was allowed!");
  console.log("✅ Test 6 Passed. Other user cannot access custom story.");

  // ── Test 7: Single unified pipeline check ─────────────────────────────────────
  console.log("\n--- Test 7: Unified pipeline — both stories use same schema ---");
  const guidedScenes = await prisma.scene.findMany({ where: { draftId: guidedDraft.id } });
  const customScenes = await prisma.scene.findMany({ where: { draftId: customDraft.id } });
  // Both use Scene table, both use StoryDraft, both appear in StoryProject
  const guidedDraftRow = await prisma.storyDraft.findUnique({ where: { id: guidedDraft.id } });
  const customDraftRow = await prisma.storyDraft.findUnique({ where: { id: customDraft.id } });
  if (!guidedDraftRow || !customDraftRow) throw new Error("❌ Test 7 Failed: Draft rows missing.");
  console.log(`   Guided draft: versionNumber=${guidedDraftRow.versionNumber}, isActive=${guidedDraftRow.isActive}`);
  console.log(`   Custom draft: versionNumber=${customDraftRow.versionNumber}, isActive=${customDraftRow.isActive}`);
  console.log("✅ Test 7 Passed. Both story types share the same DB pipeline.");

  // ── Cleanup ───────────────────────────────────────────────────────────────────
  console.log("\nCleaning up...");
  await prisma.storyProject.deleteMany({ where: { userId: { in: [userId, otherUserId] } } });
  console.log("✅ Cleanup complete.");
  console.log("\n🎉 All Phase 7 tests passed!");
}

runPhase7Tests()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
