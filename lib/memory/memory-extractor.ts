import type { StoryScene } from "@/types/story";

export type MemoryType = "CHARACTER" | "LOCATION" | "ITEM" | "CHOICE" | "PLOT";

export interface AtomicMemory {
  type: MemoryType;
  content: string;
}

/**
 * Extracts focused, atomic facts from a generated scene.
 * This ensures we index small, retrievable semantic chunks rather than full scene texts.
 */
export function extractAtomicMemories(scene: StoryScene, userChoice: string): AtomicMemory[] {
  const memories: AtomicMemory[] = [];

  // 1. Extract Characters encountered
  if (scene.cast && scene.cast.length > 0) {
    scene.cast.forEach(character => {
      if (character.name) {
        const parts = [`${character.name}: ${character.role || "encountered in the story"}.`];
        if (character.emotionalState) {
          parts.push(`Current state: ${character.emotionalState}.`);
        }
        if (character.traits && character.traits.length > 0) {
          parts.push(`Traits: ${character.traits.join(", ")}.`);
        }
        if (character.relationships && character.relationships.length > 0) {
          parts.push(`Relationships: ${character.relationships.join("; ")}.`);
        }
        
        memories.push({
          type: "CHARACTER",
          content: parts.join(" ")
        });
      }
    });
  }

  // 2. Extract Location
  if (scene.location) {
    const locParts = [`The story moved to: ${scene.location}.`];
    if (scene.mood) {
      locParts.push(`Atmosphere: ${scene.mood}.`);
    }
    if (scene.chapter) {
      locParts.push(`Chapter: ${scene.chapter}.`);
    }
    memories.push({
      type: "LOCATION",
      content: locParts.join(" ")
    });
  }

  // 3. Extract Inventory / Item changes
  if (scene.inventoryUpdate && scene.inventoryUpdate.item) {
    const action = scene.inventoryUpdate.action === "add" ? "obtained" : "lost";
    const reason = scene.inventoryUpdate.reason ? ` Reason: ${scene.inventoryUpdate.reason}` : "";
    memories.push({
      type: "ITEM",
      content: `The player ${action} the item: ${scene.inventoryUpdate.item}.${reason}`
    });
  }

  // 4. Extract the User's Choice and its immediate result
  if (userChoice) {
    const resultPart = scene.resultSummary ? ` Result: ${scene.resultSummary}` : "";
    memories.push({
      type: "CHOICE",
      content: `The player chose to: "${userChoice}".${resultPart}`
    });
  }

  // 5. Extract a brief Plot summary from the actual scene text
  if (scene.text) {
    // Keep a complete early sentence whenever possible. Partial fragments are
    // less useful for retrieval and can turn into misleading "facts" later.
    const normalizedText = scene.text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
    const sentenceEnd = normalizedText.slice(0, 420).search(/[.!?](?:\s|$)/);
    const summaryText = (sentenceEnd >= 0
      ? normalizedText.slice(0, sentenceEnd + 1)
      : normalizedText.slice(0, 420)
    ).trim();
    memories.push({
      type: "PLOT",
      content: `Plot event: ${summaryText}${normalizedText.length > summaryText.length ? " …" : ""}`
    });
  }

  return memories;
}
