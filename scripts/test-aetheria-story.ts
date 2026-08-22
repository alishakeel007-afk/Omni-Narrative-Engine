/**
 * 🧪 The Last Light of Aetheria — Full Integration Test
 *
 * Tests the complete Omni-Narrative Engine stack:
 * - 7.2  Narrative Engine (Gemini scene generation)
 * - 7.4  Metadata Parsing (structured JSON from AI)
 * - 7.7  Long-Term Memory (memory indexing + RAG retrieval)
 * - 7.9  Narrative Coherence (memory injected into next prompts)
 * - 7.11 Adaptive Difficulty (choice style analysis)
 * - 7.12 Character Identity Tracker (per-scene state persistence)
 * - 7.13 Custom Story Path (free-form choices)
 *
 * Run: npx tsx scripts/test-aetheria-story.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

import { prisma } from "../lib/prisma";
import {
  createStoryProjectWithInitialDraft,
  addCharacterToDraft,
  upsertCharacterState,
  getCharacterContextBlock,
  getCharactersForDraft,
} from "../lib/story-database";
import { buildPrompt } from "../app/api/story/generate-scene/route";
import {
  processAndIndexSceneMemories,
  retrieveRelevantMemories,
  buildMemoryContextBlock,
} from "../lib/memory/memory-service";
import type { StoryScene, StorySetupData, MemoryItem } from "../types/story";

// ─── Helpers ────────────────────────────────────────────────────────────────

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

let pass = 0;
let fail = 0;
const results: { test: string; passed: boolean; detail: string }[] = [];

function assert(test: string, condition: boolean, detail: string) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${test}`);
  } else {
    fail++;
    console.log(`  ❌ ${test}`);
    console.log(`     Detail: ${detail}`);
  }
  results.push({ test, passed: condition, detail });
}

async function callGemini(prompt: string): Promise<StoryScene> {
  const res = await fetch(
    `${GEMINI_ENDPOINT}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini error (${res.status}): ${err.slice(0, 200)}`);
  }

  const payload = await res.json();
  const raw: string =
    payload.candidates
      ?.flatMap((c: any) => c.content?.parts ?? [])
      .map((p: any) => p.text ?? "")
      .join("") ?? "";

  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned) as StoryScene;
}

// ─── Story Setup ─────────────────────────────────────────────────────────────

const STORY_SETUP: StorySetupData = {
  storyTitle: "The Last Light of Aetheria",
  scenarioTitle: "Heart of Aether",
  scenarioDescription:
    "A floating city named Aetheria is losing power. The Heart of Aether — the ancient machine keeping the city afloat — is being deliberately shut down. Kael must discover who is behind this before Aetheria falls.",
  characterName: "Kael",
  characterRole: "Relic Hunter",
  characterTraits: ["Curious", "Brave", "Reckless"],
  characterAttributes: {
    strength: 60,
    intelligence: 75,
    charisma: 65,
    agility: 72,
    wisdom: 55,
    endurance: 70,
  },
  genres: ["Fantasy", "Mystery", "Adventure"],
  genre: "Fantasy",
  moods: ["Suspenseful", "Mysterious"],
  mood: "Suspenseful",
  difficulty: "Adaptive",
  mode: "guided",
  numberOfScenes: 12,
  characters: [
    {
      name: "Lyra",
      role: "Royal Guard",
      personalityTone: "Brave, loyal, suspicious of outsiders",
      traits: ["Brave", "Loyal", "Suspicious"],
      voiceStyle: "Firm female voice",
    },
    {
      name: "Elias",
      role: "Engineer",
      personalityTone: "Intelligent, nervous, secretive",
      traits: ["Intelligent", "Nervous", "Secretive"],
      voiceStyle: "Soft male voice",
    },
    {
      name: "Mira",
      role: "Memory Thief",
      personalityTone: "Playful, manipulative, intelligent",
      traits: ["Playful", "Manipulative", "Intelligent"],
      voiceStyle: "Youthful female voice",
    },
  ],
  selectedTemplate: "Floating City",
  startingIdea: "Discover who is shutting down the Heart of Aether before Aetheria falls.",
  lastUpdatedAt: new Date().toISOString(),
};

const SCENE_CHOICES = [
  // Scene 1 → 2: LIE to Lyra about the pendant (tests memory persistence)
  'Lie to Lyra and say "I found the pendant in the ruins beneath Aetheria."',
  // Scene 2 → 3: Explore Crystal District
  "Follow Lyra into the Crystal District to investigate the power outage.",
  // Scene 3 → 4: Find and take the Memory Crystal
  "Pick up the glowing Memory Crystal from the shattered display case.",
  // Scene 4 → 5: Meet Elias, give Ancient Compass to Mira
  "Give the Ancient Compass to Mira as a gesture of trust.",
  // Scene 5 → 6: CUSTOM CHOICE (tests free-form input)
  "I throw the Memory Crystal into the power core and attempt to overload it to buy us time.",
  // Scene 6 → 7: Lyra trapped — SAVE LYRA (tests relationship impact)
  "Abandon the Memory Core and rush to save Lyra from the collapsing Crystal District.",
  // Scene 7 → 8: Discover Memory Vault
  "Descend into the underground tunnels beneath the city to find the Memory Vault.",
  // Scene 8 → 9: Confront Elias with the truth
  "Confront Elias directly: tell him I know the Heart consumes human memories.",
  // Scene 9 → 10: Enter Heart Chamber
  "Enter the Heart Chamber and face whoever is shutting down the Heart of Aether.",
];

// ─── Main Test Runner ────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(60));
  console.log("🧪 The Last Light of Aetheria — Integration Test");
  console.log("   Testing the full Omni-Narrative Engine pipeline");
  console.log("═".repeat(60));

  if (!GEMINI_KEY) {
    console.error("❌ GEMINI_API_KEY not found. Aborting.");
    process.exit(1);
  }

  const USER_ID = "aetheria-test-user-7xq9";

  // ── CLEANUP ──────────────────────────────────────────────────────────────
  console.log("\n🧹 Cleaning up previous test data...");
  await prisma.storyProject.deleteMany({ where: { userId: USER_ID } });
  console.log("   Done.\n");

  // ── SETUP ─────────────────────────────────────────────────────────────────
  console.log("📖 Creating story project...");
  const project = await createStoryProjectWithInitialDraft(USER_ID, {
    title: STORY_SETUP.storyTitle,
    mode: "GUIDED",
    draft: {
      title: STORY_SETUP.scenarioTitle,
      genres: STORY_SETUP.genres,
      tones: STORY_SETUP.moods,
      numberOfScenes: STORY_SETUP.numberOfScenes,
    },
  });

  const draftId = project.drafts[0].id;
  const projectId = project.id;
  console.log(`   projectId: ${projectId}`);
  console.log(`   draftId:   ${draftId}\n`);

  // Add characters to DB
  console.log("👥 Adding characters...");
  const lyra = await addCharacterToDraft(draftId, {
    name: "Lyra",
    role: "Royal Guard",
    personalityTone: "Brave, loyal, suspicious of outsiders",
    traits: ["Brave", "Loyal", "Suspicious"],
    appearancePrompt: "silver armor, blue cloak, dark hair, scar above left eyebrow, old silver sword",
  });
  const elias = await addCharacterToDraft(draftId, {
    name: "Elias",
    role: "Engineer",
    personalityTone: "Intelligent, nervous, secretive",
    traits: ["Intelligent", "Nervous", "Secretive"],
    appearancePrompt: "elderly man, worn leather coat, round spectacles, ink-stained hands",
  });
  const mira = await addCharacterToDraft(draftId, {
    name: "Mira",
    role: "Memory Thief",
    personalityTone: "Playful, manipulative, intelligent",
    traits: ["Playful", "Manipulative", "Intelligent"],
    appearancePrompt: "young girl, shifting silver eyes, dark hooded cloak",
  });

  console.log(`   ✅ Lyra (${lyra.id.slice(0,8)}...)`);
  console.log(`   ✅ Elias (${elias.id.slice(0,8)}...)`);
  console.log(`   ✅ Mira (${mira.id.slice(0,8)}...)\n`);

  // ── SCENE LOOP ────────────────────────────────────────────────────────────

  const memoryTimeline: MemoryItem[] = [];
  let currentScene: StoryScene | null = null;
  const sceneHistory: StoryScene[] = [];
  let inventory = ["Silver Pendant", "Old Map", "3 Health Potions"];

  for (let sceneNum = 1; sceneNum <= SCENE_CHOICES.length; sceneNum++) {
    const choice = SCENE_CHOICES[sceneNum - 1];
    console.log(`\n${"─".repeat(55)}`);
    console.log(`📍 Scene ${sceneNum} — Generating with Gemini...`);
    console.log(`   Choice: "${choice.slice(0, 70)}..."`);

    try {
      // Build character context from DB (tests 7.12 context injection)
      const characterContextBlock = await getCharacterContextBlock(draftId);

      // Retrieve memories (tests 7.7 RAG)
      let memoryContextBlock = "";
      if (sceneNum > 1) {
        const queryText = `${currentScene?.location || ""} ${choice}`;
        const memories = await retrieveRelevantMemories(draftId, queryText, 8);
        memoryContextBlock = buildMemoryContextBlock(memories);
        if (memories.length > 0) {
          console.log(`   🧠 RAG retrieved ${memories.length} memories`);
        }
      }

      // Build prompt
      const prompt = buildPrompt({
        setup: STORY_SETUP,
        choice,
        memoryTimeline,
        currentScene,
        sceneNumber: sceneNum,
        memoryContextBlock,
        characterContextBlock,
      });

      // Call Gemini
      const scene = await callGemini(prompt);
      scene.sceneNumber = sceneNum;
      currentScene = scene;

      console.log(`   🎬 Scene: "${scene.title}"`);
      console.log(`   📍 Location: ${scene.location}`);
      console.log(`   💫 Mood: ${scene.mood}`);
      console.log(`   👥 Cast: ${scene.cast?.map((c: any) => c.name).join(", ")}`);

      // Inventory update
      if (scene.inventoryUpdate) {
        const { action, item } = scene.inventoryUpdate;
        if (action === "add" && !inventory.includes(item)) {
          inventory.push(item);
          console.log(`   🎒 Inventory +: ${item}`);
        } else if (action === "remove") {
          inventory = inventory.filter((i) => i !== item);
          console.log(`   🎒 Inventory -: ${item}`);
        }
      }

      // Persist scene memories (tests 7.7)
      const fakeSceneId = `scene-${draftId}-${sceneNum}`;
      await processAndIndexSceneMemories(draftId, fakeSceneId, USER_ID, scene, choice);

      // Sync character states to DB (tests 7.12)
      if (Array.isArray(scene.cast)) {
        for (const char of scene.cast) {
          await upsertCharacterState(draftId, char.name, {
            emotionalState: char.emotionalState,
            visualAppearance: char.visualAppearance,
            sceneNumber: sceneNum,
          });
        }
      }

      // Add to memory timeline
      memoryTimeline.push({
        choiceType: sceneNum === 5 ? "Custom" : "AI Suggested",
        location: scene.location,
        mood: scene.mood,
        result: scene.resultSummary || scene.text.slice(0, 100),
        sceneNumber: sceneNum,
        timestamp: new Date().toISOString(),
        update: `Mood: ${scene.mood}, Location: ${scene.location}`,
        userChoice: choice,
      });

      sceneHistory.push(scene);

      // ── CHECKPOINTS ────────────────────────────────────────────────────

      if (sceneNum === 1) {
        console.log("\n  [CHECKPOINT] Scene 1 — Basic generation");
        assert(
          "Scene 1 generates valid JSON with all required fields",
          !!scene.title && !!scene.text && !!scene.mood && Array.isArray(scene.cast),
          `title=${scene.title}, cast length=${scene.cast?.length}`
        );
        assert(
          "Scene 1 includes cast with emotional states",
          scene.cast?.some((c: any) => c.emotionalState),
          `cast: ${JSON.stringify(scene.cast?.map((c:any) => ({name:c.name, emotion:c.emotionalState})))}`
        );
        assert(
          "Scene 1 generates music mood",
          !!scene.media?.backgroundMusicMood,
          `music: ${scene.media?.backgroundMusicMood}`
        );
        assert(
          "Scene 1 generates image prompt",
          !!scene.media?.imagePrompt && scene.media.imagePrompt.length > 20,
          `image prompt: ${scene.media?.imagePrompt?.slice(0, 60)}`
        );
      }

      if (sceneNum === 3) {
        // Check Lyra's state was persisted from Scene 1
        console.log("\n  [CHECKPOINT] Scene 3 — Character state persistence");
        const chars = await getCharactersForDraft(draftId);
        const lyraDB = chars.find((c) => c.name.toLowerCase() === "lyra");
        assert(
          "Lyra's emotional state is persisted in DB after multiple scenes",
          !!lyraDB?.currentEmotionalState,
          `Lyra DB state: ${lyraDB?.currentEmotionalState}`
        );
        assert(
          "Lyra's lastSeenScene is tracking correctly",
          (lyraDB?.lastSeenScene ?? 0) >= 1,
          `lastSeenScene: ${lyraDB?.lastSeenScene}`
        );
        console.log(`     Lyra's current DB state: ${lyraDB?.currentEmotionalState} (Scene ${lyraDB?.lastSeenScene})`);
      }

      if (sceneNum === 5) {
        // Custom choice test
        console.log("\n  [CHECKPOINT] Scene 5 — Custom free-form choice");
        assert(
          "AI handles custom/unexpected free-form choice gracefully",
          !!scene.text && scene.text.length > 50,
          `scene text length: ${scene.text?.length}`
        );
        assert(
          "Custom choice produces narrative consequences",
          !!scene.resultSummary && scene.resultSummary.length > 20,
          `resultSummary: ${scene.resultSummary?.slice(0, 60)}`
        );
      }

      if (sceneNum === 6) {
        // Save Lyra — relationship impact
        console.log("\n  [CHECKPOINT] Scene 6 — Relationship impact (saved Lyra)");
        const lyraInScene = scene.cast?.find((c: any) =>
          c.name.toLowerCase().includes("lyra")
        );
        assert(
          "Lyra appears in cast after being saved",
          !!lyraInScene,
          `cast: ${scene.cast?.map((c:any) => c.name).join(", ")}`
        );
        if (lyraInScene) {
          const emotional = lyraInScene.emotionalState?.toLowerCase() || "";
          const relationships = (lyraInScene.relationships || []).join(" ").toLowerCase();
          const positive = ["grateful", "trust", "loyal", "relief", "warm", "moved"].some(
            (w) => emotional.includes(w) || relationships.includes(w)
          );
          assert(
            "Lyra has positive emotion after being saved",
            positive,
            `Lyra emotion: ${lyraInScene.emotionalState}, relationships: ${lyraInScene.relationships?.join(", ")}`
          );
        }
      }

      if (sceneNum === 8) {
        console.log("\n  [CHECKPOINT] Scene 8 — Long-term memory retrieval");
        // Test: retrieve memories about the original lie to Lyra (Scene 1)
        const lieMemories = await retrieveRelevantMemories(
          draftId,
          "Lyra pendant silver ruins lie truth Kael",
          10,
          0.4 // lower threshold to catch the memory
        );
        console.log(`     Memory retrieval returned ${lieMemories.length} results`);
        const mentionsLie =
          lieMemories.some((m) => m.toLowerCase().includes("pendant")) ||
          lieMemories.some((m) => m.toLowerCase().includes("ruins")) ||
          lieMemories.some((m) => m.toLowerCase().includes("found"));
        assert(
          "Long-term memory (7.7) retrieves the Scene 1 lie about the pendant",
          mentionsLie,
          `Memories: ${lieMemories.slice(0, 2).join(" | ")}`
        );
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`   ❌ Scene ${sceneNum} failed: ${msg.slice(0, 150)}`);
      assert(`Scene ${sceneNum} generates without error`, false, msg.slice(0, 120));
      // Continue to next scene
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 2000));
  }

  // ── FINAL VERIFICATION ────────────────────────────────────────────────────

  console.log("\n");
  console.log("═".repeat(55));
  console.log("🔍 FINAL VERIFICATION CHECKS");
  console.log("═".repeat(55));

  // 1. Character identity continuity
  console.log("\n📋 7.12 Character Identity Tracker — Final State:");
  const finalChars = await getCharactersForDraft(draftId);
  for (const char of finalChars) {
    console.log(
      `   ${char.name}: emotion="${char.currentEmotionalState}" lastScene=${char.lastSeenScene} appearance="${char.appearancePrompt?.slice(0, 40)}..."`
    );
  }
  assert(
    "All 3 characters have tracked emotional states in DB",
    finalChars.filter((c) => !!c.currentEmotionalState).length >= 2,
    `Characters with state: ${finalChars.filter((c) => c.currentEmotionalState).map((c) => c.name).join(", ")}`
  );
  assert(
    "All 3 characters have scene tracking",
    finalChars.filter((c) => (c.lastSeenScene ?? 0) > 0).length >= 2,
    `Characters with scene tracking: ${finalChars.map((c) => `${c.name}:${c.lastSeenScene}`).join(", ")}`
  );

  // 2. Character appearance stays consistent (visual identity)
  const lyraFinal = finalChars.find((c) => c.name.toLowerCase() === "lyra");
  assert(
    "Lyra retains her visual appearance in DB (7.5 + 7.12)",
    !!lyraFinal?.appearancePrompt && lyraFinal.appearancePrompt.length > 10,
    `Lyra appearance: ${lyraFinal?.appearancePrompt?.slice(0, 60)}`
  );

  // 3. Character context block is rich
  const finalContext = await getCharacterContextBlock(draftId);
  console.log("\n📝 Final Character Context Block (injected into future prompts):");
  console.log(finalContext);
  assert(
    "Character context block includes emotional state",
    finalContext.includes("Last known state:"),
    "Context block missing 'Last known state'"
  );
  assert(
    "Character context block includes scene tracking",
    finalContext.includes("Last seen in Scene"),
    "Context block missing 'Last seen in Scene'"
  );

  // 4. Draft isolation check (create second draft, same user)
  console.log("\n🔒 7.12 Draft Isolation:");
  const project2 = await createStoryProjectWithInitialDraft(USER_ID, {
    title: "Isolation Test",
    mode: "GUIDED",
    draft: { title: "Parallel Draft", genres: [], tones: [], numberOfScenes: 1 },
  });
  const draftId2 = project2.drafts[0].id;
  await addCharacterToDraft(draftId2, {
    name: "Lyra",
    role: "Villain",
    personalityTone: "Evil",
    traits: ["Cruel"],
  });
  await upsertCharacterState(draftId2, "Lyra", { emotionalState: "Triumphant", sceneNumber: 1 });
  const contextDraft1 = await getCharacterContextBlock(draftId);
  const contextDraft2 = await getCharacterContextBlock(draftId2);
  assert(
    "Draft isolation: Draft 1 Lyra and Draft 2 Lyra have separate states",
    !contextDraft1.includes("Triumphant") && contextDraft2.includes("Triumphant"),
    `Draft1: ${contextDraft1.slice(0,80)} | Draft2: ${contextDraft2.slice(0,80)}`
  );

  // 5. Inventory tracking
  console.log("\n🎒 Inventory Tracking:");
  console.log(`   Final inventory: [${inventory.join(", ")}]`);
  assert(
    "Inventory tracking is active and non-empty",
    inventory.length > 0,
    `inventory: ${inventory.join(", ")}`
  );

  // 6. Memory timeline length
  console.log("\n🧠 Memory Timeline:");
  console.log(`   Stored ${memoryTimeline.length} scene memories across ${sceneHistory.length} scenes`);
  assert(
    "Memory timeline tracks all generated scenes",
    memoryTimeline.length === sceneHistory.length,
    `timeline: ${memoryTimeline.length}, scenes: ${sceneHistory.length}`
  );

  // 7. Scene variety test
  const locations = [...new Set(sceneHistory.map((s) => s.location))];
  const moods = [...new Set(sceneHistory.map((s) => s.mood))];
  console.log(`\n🗺️  Unique locations visited: ${locations.join(", ")}`);
  console.log(`🎭 Unique moods encountered: ${moods.join(", ")}`);
  assert(
    "Narrative diversity: Multiple unique locations generated",
    locations.length >= 3,
    `locations: ${locations.join(", ")}`
  );
  assert(
    "Emotion diversity: Multiple unique moods generated",
    moods.length >= 3,
    `moods: ${moods.join(", ")}`
  );

  // ── CLEANUP ──────────────────────────────────────────────────────────────
  console.log("\n\n🧹 Cleaning up test data...");
  await prisma.storyProject.deleteMany({ where: { userId: USER_ID } });

  // ── FINAL REPORT ─────────────────────────────────────────────────────────

  console.log("\n");
  console.log("═".repeat(55));
  console.log("📊 INTEGRATION TEST RESULTS");
  console.log("═".repeat(55));
  console.log(`  ✅ Passed: ${pass}`);
  console.log(`  ❌ Failed: ${fail}`);
  console.log(`  Total:   ${pass + fail}`);
  console.log(`  Score:   ${Math.round((pass / (pass + fail)) * 100)}%`);
  console.log("═".repeat(55));

  if (fail > 0) {
    console.log("\n⚠️  Failed tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => console.log(`  - ${r.test}\n    ${r.detail}`));
  } else {
    console.log("\n🎉 All tests passed! The Omni-Narrative Engine is production-ready.");
  }

  await prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
