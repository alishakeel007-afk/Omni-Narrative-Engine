import { PrismaClient } from "@prisma/client";
import { processAndIndexSceneMemories } from "../lib/memory/memory-service.ts";

const prisma = new PrismaClient();

async function runPhase2Test() {
  console.log("🚀 Starting Phase 2 Real Data Test");

  // We need a dummy user and draft for the test, but real scene data.
  // We'll create a temporary project and draft to ensure we don't pollute real ones.
  const tempUser = "test-user-" + Date.now();
  
  console.log("\n1. Setting up temporary DB records...");
  const project = await prisma.storyProject.create({
    data: {
      userId: tempUser,
      title: "Phase 2 Test Project",
      mode: "GUIDED",
    }
  });

  const draft = await prisma.storyDraft.create({
    data: {
      storyProjectId: project.id,
      versionNumber: 1,
      title: "Test Draft",
      genres: ["Fantasy"],
      tones: ["Dark"],
      numberOfScenes: 5,
    }
  });

  const scene = await prisma.scene.create({
    data: {
      draftId: draft.id,
      sceneNumber: 1,
      title: "The Abandoned Castle",
      description: "Entering the castle.",
      location: "Abandoned Castle",
    }
  });

  console.log(`✅ Created Draft: ${draft.id}, Scene: ${scene.id}`);

  // Construct a realistic StoryScene object matching what Gemini returns
  const mockGeneratedScene = {
    sceneNumber: 1,
    title: "The Abandoned Castle",
    chapter: "Chapter 1",
    location: "Abandoned Castle",
    mood: "Eerie",
    text: "Lyra entered the abandoned castle carrying a silver key. The player rescued her from the guards, causing her to trust them. The wind howled through the empty corridors.",
    cast: [
      {
        name: "Lyra",
        role: "Former Guard",
        emotionalState: "Anxious but grateful",
        visualAppearance: "Wearing tattered armor",
        traits: ["Brave", "Loyal"],
        relationships: ["Trusts the player"],
        imageLabel: "Lyra",
      }
    ],
    inventoryUpdate: {
      action: "add" as const,
      item: "Silver Key",
      reason: "Found on a guard",
    },
    resultSummary: "You successfully rescued Lyra and obtained a key.",
    options: ["Explore the west wing", "Ask Lyra about the key", "Leave the castle"],
    media: {
      audioMoodPrompt: "Eerie wind",
      backgroundMusicMood: "Suspenseful",
      imageLabel: "Castle",
      imagePrompt: "Dark castle",
      narrationDuration: "10s",
      narrationLabel: "Narrator",
      playerState: "ready" as const,
    }
  };

  const userChoice = "Rescue the stranger from the guards.";

  console.log("\n2. Processing Scene Memories (First Run)...");
  // @ts-ignore - Ignore TS error in JS script
  await processAndIndexSceneMemories(draft.id, scene.id, tempUser, mockGeneratedScene, userChoice);

  console.log("\n3. Verifying First Run...");
  const memories1 = await prisma.storyMemory.findMany({ where: { draftId: draft.id } });
  const embeddings1 = await prisma.$queryRawUnsafe(`SELECT id, "draftId", "sceneId", "memoryId", "userId", content, "memoryType", "memoryHash", embedding::text FROM "StoryMemoryEmbedding" WHERE "draftId" = '${draft.id}'`);
  
  console.log(`- StoryMemory records created: ${memories1.length}`);
  // @ts-ignore
  console.log(`- StoryMemoryEmbedding vectors created: ${embeddings1.length}`);
  
  if (memories1.length === 0 || embeddings1.length === 0) {
    throw new Error("❌ Failed to create memories or embeddings.");
  }

  console.log("\n4. Processing Scene Memories Again (Duplicate Test)...");
  // @ts-ignore
  await processAndIndexSceneMemories(draft.id, scene.id, tempUser, mockGeneratedScene, userChoice);

  console.log("\n5. Verifying Duplicate Protection...");
  const memories2 = await prisma.storyMemory.findMany({ where: { draftId: draft.id } });
  const embeddings2 = await prisma.$queryRawUnsafe(`SELECT id, "draftId", "sceneId", "memoryId", "userId", content, "memoryType", "memoryHash", embedding::text FROM "StoryMemoryEmbedding" WHERE "draftId" = '${draft.id}'`);
  
  console.log(`- StoryMemory records after second run: ${memories2.length}`);
  // @ts-ignore
  console.log(`- StoryMemoryEmbedding vectors after second run: ${embeddings2.length}`);

  if (memories2.length !== memories1.length || embeddings2.length !== embeddings1.length) {
    throw new Error("❌ Duplicate protection failed!");
  } else {
    console.log("✅ Duplicate protection working perfectly.");
  }

  // Cleanup
  console.log("\n6. Cleaning up test data...");
  await prisma.storyProject.delete({ where: { id: project.id } });
  console.log("✅ Cleanup complete.");
}

runPhase2Test()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
