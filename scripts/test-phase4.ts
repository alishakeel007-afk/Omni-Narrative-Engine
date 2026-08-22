import { buildPrompt } from "../app/api/story/generate-scene/route.ts";
import { processAndIndexSceneMemories, retrieveRelevantMemories, buildMemoryContextBlock } from "../lib/memory/memory-service.ts";
import { PrismaClient } from "@prisma/client";
import type { StorySetupData, StoryScene } from "../types/story.ts";

const prisma = new PrismaClient();

async function runPhase4Test() {
  console.log("🚀 Starting Phase 4 Prompt Injection Test");

  const tempUser = "test-user-phase4-" + Date.now();
  const mockSetup: StorySetupData = {
    storyTitle: "The Fall of Lyra",
    genres: ["Fantasy"],
    moods: ["Dark"],
    difficulty: "Normal",
    characterName: "Hero",
    characterRole: "Wanderer",
    characters: [{ name: "Hero", role: "Wanderer", personalityTone: "Brave", traits: ["Strong"], voiceStyle: "Deep" }],
    characterTraits: ["Strong"],
    characterAttributes: { agility: 10, charisma: 10, endurance: 10, intelligence: 10, strength: 10, wisdom: 10 },
    lastUpdatedAt: new Date().toISOString(),
    mode: "guided",
    mood: "Dark",
    numberOfScenes: 10,
    scenarioDescription: "A dark fantasy.",
    scenarioTitle: "Beginning",
    selectedTemplate: "None",
    startingIdea: "Start in a forest."
  };

  const project = await prisma.storyProject.create({
    data: { userId: tempUser, title: "Phase 4 Test", mode: "GUIDED" }
  });
  const draft = await prisma.storyDraft.create({
    data: { storyProjectId: project.id, versionNumber: 1, title: "Draft", genres: [], tones: [], numberOfScenes: 1 }
  });
  const scene = await prisma.scene.create({
    data: { draftId: draft.id, sceneNumber: 1, title: "Scene 1", description: "...", location: "Northern Mines" }
  });

  const mockScene1: StoryScene = {
    sceneNumber: 1, title: "Northern Mines", location: "Northern Mines", mood: "Sad", 
    text: "Lyra tells the player: 'I lost my brother in the northern mines.' She looks away in sorrow.",
    cast: [{ name: "Lyra", role: "Guide", emotionalState: "Sorrowful", traits: ["Loyal"], relationships: ["Lost her brother"], imageLabel: "Lyra" }],
    inventoryUpdate: null,
    options: [], media: { audioMoodPrompt: "", backgroundMusicMood: "", imageLabel: "", imagePrompt: "", narrationDuration: "", narrationLabel: "", playerState: "ready" },
    chapter: "Chapter 1"
  };

  // @ts-ignore
  await processAndIndexSceneMemories(draft.id, scene.id, tempUser, mockScene1, "Ask about her past.");

  // Wait for embeddings
  await new Promise(r => setTimeout(r, 1000));

  console.log("\n--- Test 1: Real-story test (Lyra's brother) ---");
  const choice1 = "Ask Lyra about her brother.";
  const queryText1 = `Current context: Northern Mines Sad. Choice: ${choice1}`;
  const memories1 = await retrieveRelevantMemories(draft.id, queryText1, 5, 0.4);
  const memoryContextBlock1 = buildMemoryContextBlock(memories1);

  const prompt1 = buildPrompt({
    setup: mockSetup, choice: choice1, memoryTimeline: [], currentScene: mockScene1, sceneNumber: 11, memoryContextBlock: memoryContextBlock1
  });

  if (!prompt1.includes("[LONG-TERM MEMORY CONTEXT]")) throw new Error("Missing memory context block.");
  if (!prompt1.includes("Lyra tells the player")) throw new Error("Missing specific memory content.");
  if (!prompt1.includes("Do not blindly follow memories that conflict")) throw new Error("Missing instruction safeguard.");
  if (!prompt1.includes("Northern Mines")) throw new Error("Missing current state.");
  if (!prompt1.includes(choice1)) throw new Error("Missing choice.");
  console.log("✅ Test 1 Passed. Prompt integrated properly with safeguard.");

  console.log("\n--- Test 2: No-memory situations still generate normally ---");
  const draftEmpty = await prisma.storyDraft.create({
    data: { storyProjectId: project.id, versionNumber: 2, title: "Empty Draft", genres: [], tones: [], numberOfScenes: 1 }
  });
  
  const memoriesEmpty = await retrieveRelevantMemories(draftEmpty.id, "Jump!", 5, 0.4);
  const memoryContextBlockEmpty = buildMemoryContextBlock(memoriesEmpty);
  
  const promptEmpty = buildPrompt({
    setup: mockSetup, choice: "Jump!", memoryTimeline: [], currentScene: mockScene1, sceneNumber: 2, memoryContextBlock: memoryContextBlockEmpty
  });

  if (promptEmpty.includes("[LONG-TERM MEMORY CONTEXT]")) throw new Error("Should not include memory block.");
  if (!promptEmpty.includes("Jump!")) throw new Error("Missing choice in empty memory prompt.");
  console.log("✅ Test 2 Passed. Handles empty memory gracefully.");

  console.log("\n--- Test 3: Retrieval failures do not break scene generation ---");
  const memoriesFail = await retrieveRelevantMemories("invalid-uuid-format", "Jump!", 5, 0.4);
  const memoryContextBlockFail = buildMemoryContextBlock(memoriesFail);
  
  const promptFail = buildPrompt({
    setup: mockSetup, choice: "Run!", memoryTimeline: [], currentScene: mockScene1, sceneNumber: 2, memoryContextBlock: memoryContextBlockFail
  });
  if (promptFail.includes("[LONG-TERM MEMORY CONTEXT]")) throw new Error("Should not include memory block on failure.");
  if (!promptFail.includes("Run!")) throw new Error("Missing choice on failure.");
  console.log("✅ Test 3 Passed. Handles retrieval failure gracefully.");

  console.log("\n✅ All Phase 4 tests passed!");

  await prisma.storyProject.deleteMany({ where: { userId: tempUser } });
}

runPhase4Test()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
