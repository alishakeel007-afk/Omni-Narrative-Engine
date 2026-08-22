import { PrismaClient } from "@prisma/client";
import { processAndIndexSceneMemories, retrieveRelevantMemories } from "../lib/memory/memory-service.ts";
import { generateEmbedding } from "../lib/memory/embedding-service.ts";

const prisma = new PrismaClient();

async function runPhase3Test() {
  console.log("🚀 Starting Phase 3 Retrieval Test");

  const tempUser = "test-user-phase3-" + Date.now();

  console.log("\n0. Setting up test drafts and memories...");
  
  // Draft A: The Lyra Draft (from Phase 2)
  const projectA = await prisma.storyProject.create({
    data: { userId: tempUser, title: "Draft A Project", mode: "GUIDED" }
  });
  const draftA = await prisma.storyDraft.create({
    data: { storyProjectId: projectA.id, versionNumber: 1, title: "Draft A", genres: [], tones: [], numberOfScenes: 1 }
  });
  const sceneA = await prisma.scene.create({
    data: { draftId: draftA.id, sceneNumber: 1, title: "Lyra Scene", description: "...", location: "Castle" }
  });

  const mockSceneA = {
    sceneNumber: 1, title: "The Abandoned Castle", location: "Abandoned Castle", mood: "Eerie", text: "...",
    cast: [{ name: "Lyra", role: "Former Guard", emotionalState: "Grateful", traits: ["Brave"], relationships: ["Trusts the player"], imageLabel: "Lyra" }],
    inventoryUpdate: { action: "add" as const, item: "Silver Key", reason: "" },
    options: [], media: { audioMoodPrompt: "", backgroundMusicMood: "", imageLabel: "", imagePrompt: "", narrationDuration: "", narrationLabel: "", playerState: "ready" as const }
  };
  // @ts-ignore
  await processAndIndexSceneMemories(draftA.id, sceneA.id, tempUser, mockSceneA, "Rescue Lyra");

  // Draft B: The John Draft
  const projectB = await prisma.storyProject.create({
    data: { userId: tempUser, title: "Draft B Project", mode: "GUIDED" }
  });
  const draftB = await prisma.storyDraft.create({
    data: { storyProjectId: projectB.id, versionNumber: 1, title: "Draft B", genres: [], tones: [], numberOfScenes: 1 }
  });
  const sceneB = await prisma.scene.create({
    data: { draftId: draftB.id, sceneNumber: 1, title: "John Scene", description: "...", location: "Forest" }
  });

  const mockSceneB = {
    sceneNumber: 1, title: "The Dark Forest", location: "Dark Forest", mood: "Tense", text: "...",
    cast: [{ name: "John", role: "Merchant", emotionalState: "Greedy", traits: ["Sly"], relationships: ["Trades with player"], imageLabel: "John" }],
    inventoryUpdate: { action: "add" as const, item: "Rusty Sword", reason: "" },
    options: [], media: { audioMoodPrompt: "", backgroundMusicMood: "", imageLabel: "", imagePrompt: "", narrationDuration: "", narrationLabel: "", playerState: "ready" as const }
  };
  // @ts-ignore
  await processAndIndexSceneMemories(draftB.id, sceneB.id, tempUser, mockSceneB, "Trade with John");

  // Draft C: Empty Draft
  const projectC = await prisma.storyProject.create({
    data: { userId: tempUser, title: "Draft C Project", mode: "GUIDED" }
  });
  const draftC = await prisma.storyDraft.create({
    data: { storyProjectId: projectC.id, versionNumber: 1, title: "Draft C", genres: [], tones: [], numberOfScenes: 1 }
  });

  // Let vectors settle
  await new Promise(resolve => setTimeout(resolve, 1000));

  // --- Test 1: Basic Retrieval ---
  console.log("\n--- Test 1: Basic retrieval ---");
  const query1 = "I ask Lyra to help me enter the castle.";
  console.log(`Query: "${query1}" (Draft A)`);
  const memories1 = await retrieveRelevantMemories(draftA.id, query1, 5, 0.4);
  console.log("Retrieved:", memories1);
  if (memories1.length === 0 || !memories1.some(m => m.includes("Lyra"))) {
    throw new Error("❌ Test 1 Failed: Did not retrieve Lyra memories.");
  } else {
    console.log("✅ Test 1 Passed.");
  }

  // --- Test 2: Irrelevant memory ---
  console.log("\n--- Test 2: Irrelevant memory ---");
  const query2 = "I want to repair the damaged spaceship in orbit.";
  console.log(`Query: "${query2}" (Draft A, threshold 0.6)`);
  const memories2 = await retrieveRelevantMemories(draftA.id, query2, 5, 0.6); // High threshold
  console.log("Retrieved:", memories2);
  if (memories2.length > 0) {
    console.log("⚠️ Test 2 Warning: Irrelevant memory retrieved. Consider raising default threshold.");
  } else {
    console.log("✅ Test 2 Passed: Irrelevant memory filtered out by threshold.");
  }

  // --- Test 3: Draft Isolation ---
  console.log("\n--- Test 3: Draft isolation ---");
  const query3 = "I want to talk to Lyra again.";
  console.log(`Query: "${query3}" (Draft B - John's draft)`);
  const memories3 = await retrieveRelevantMemories(draftB.id, query3, 5, 0.4);
  console.log("Retrieved:", memories3);
  if (memories3.some(m => m.includes("Lyra"))) {
    throw new Error("❌ Test 3 Failed: Retrieved Lyra's memory from Draft A while searching in Draft B!");
  } else {
    console.log("✅ Test 3 Passed: Draft isolation works.");
  }

  // --- Test 4: Empty result ---
  console.log("\n--- Test 4: Empty result ---");
  const query4 = "Anything happened here?";
  console.log(`Query: "${query4}" (Draft C - Empty draft)`);
  const memories4 = await retrieveRelevantMemories(draftC.id, query4, 5, 0.0);
  console.log("Retrieved:", memories4);
  if (memories4.length > 0) {
    throw new Error("❌ Test 4 Failed: Expected empty array for empty draft.");
  } else {
    console.log("✅ Test 4 Passed: Handled empty draft perfectly.");
  }

  // Cleanup
  console.log("\n5. Cleaning up test data...");
  await prisma.storyProject.deleteMany({ where: { userId: tempUser } });
  console.log("✅ Cleanup complete.");
}

runPhase3Test()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
