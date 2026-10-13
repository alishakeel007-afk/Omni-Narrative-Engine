import { createStoryProjectWithInitialDraft, addCharacterToDraft, upsertCharacterState, getCharacterContextBlock } from "../lib/story-database";
import { prisma } from "../lib/prisma";

async function main() {
  console.log("🚀 Starting Module 7.12 Character Identity Tests");

  // 1. Create a dummy user
  const user = { id: "test-user-identity" };
  
  try {
    // Clean up
    await prisma.storyProject.deleteMany({ where: { userId: user.id } });

    // 2. Create a story
    const project = await createStoryProjectWithInitialDraft(user.id, {
      title: "Identity Test Story",
      mode: "GUIDED",
      draft: {
        title: "Draft 1",
        genres: ["Sci-Fi"],
        tones: ["Tense"],
        numberOfScenes: 3
      }
    });

    const draftId = project.drafts[0].id;
    console.log(`✅ Story Project created. Draft ID: ${draftId}`);

    // 3. Add initial character
    await addCharacterToDraft(draftId, {
      name: "Lyra",
      role: "Protagonist",
      personalityTone: "Calm",
      traits: ["Smart", "Brave"],
      appearancePrompt: "wearing standard silver armor"
    });
    console.log("✅ Character Lyra created");

    // 4. Check context block
    let context = await getCharacterContextBlock(draftId);
    console.log(`\nContext Block Before Scene 1:\n${context}`);

    if (context.includes("wearing standard silver armor") && !context.includes("Last known state")) {
      console.log("✅ Context block has appearance, no emotion yet.");
    } else {
      throw new Error("Context block failed to include visual appearance.");
    }

    // 5. Simulate Scene 1 completion (Lyra is calm)
    await upsertCharacterState(draftId, "Lyra", {
      emotionalState: "Calm",
      sceneNumber: 1
    });
    console.log("✅ Scene 1 finished. Upserted Lyra state.");

    // 6. Check context block again
    context = await getCharacterContextBlock(draftId);
    console.log(`\nContext Block After Scene 1:\n${context}`);
    if (context.includes("Last known state: Calm") && context.includes("Last seen in Scene 1")) {
      console.log("✅ Context block updated with emotional state and scene.");
    } else {
      throw new Error("Context block failed to include emotion/scene.");
    }

    // 7. Simulate Scene 2 completion (Lyra is angry)
    await upsertCharacterState(draftId, "Lyra", {
      emotionalState: "Angry",
      sceneNumber: 2
    });
    console.log("✅ Scene 2 finished. Upserted Lyra state.");

    // 8. Check context block again
    context = await getCharacterContextBlock(draftId);
    console.log(`\nContext Block After Scene 2:\n${context}`);
    if (context.includes("Last known state: Angry") && context.includes("Last seen in Scene 2")) {
      console.log("✅ Context block updated with new emotional state and scene.");
    } else {
      throw new Error("Context block failed to update emotion/scene.");
    }

    // 9. Test unknown NPC isolation
    const result = await upsertCharacterState(draftId, "Random Guard", {
      emotionalState: "Afraid",
      sceneNumber: 2
    });
    if (result === null) {
      console.log("✅ Upsert character safely ignored unknown character.");
    } else {
      throw new Error("Upsert character modified unknown character.");
    }

    // 10. Check draft isolation (two characters with same name in different drafts)
    const project2 = await createStoryProjectWithInitialDraft(user.id, {
      title: "Another Story",
      mode: "GUIDED",
      draft: { title: "Draft 2", genres: [], tones: [], numberOfScenes: 1 }
    });
    const draftId2 = project2.drafts[0].id;
    await addCharacterToDraft(draftId2, {
      name: "Lyra",
      role: "Villain",
      personalityTone: "Evil",
      traits: ["Cruel"],
    });
    
    await upsertCharacterState(draftId2, "Lyra", { emotionalState: "Happy", sceneNumber: 1 });
    
    const context2 = await getCharacterContextBlock(draftId2);
    const context1 = await getCharacterContextBlock(draftId);
    
    if (context2.includes("Evil") && context2.includes("Happy") && context1.includes("Angry")) {
      console.log("✅ Draft isolation works correctly. Character data didn't leak.");
    } else {
      throw new Error("Draft isolation failed.");
    }

    console.log("\n🎉 All Character Identity tests passed!");

  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await prisma.storyProject.deleteMany({ where: { userId: user.id } });
  }
}

main();
