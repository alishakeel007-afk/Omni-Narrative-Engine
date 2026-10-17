import type { PersistedMemoryFact } from "@/types/story";

export type StoryMemoryGroupKey = "choices" | "characters" | "locations" | "items" | "plot";

export type StoryMemoryGroups = Record<StoryMemoryGroupKey, PersistedMemoryFact[]>;

export const STORY_MEMORY_GROUP_LABELS: Record<StoryMemoryGroupKey, string> = {
  choices: "Decisions / Choices",
  characters: "Characters and Relationships",
  locations: "Locations",
  items: "Items",
  plot: "Plot Facts",
};

/**
 * Keeps persisted memory facts in their authoritative stored categories. Unknown
 * future types are shown as plot facts rather than discarded or invented.
 */
export function groupPersistedMemories(memories: PersistedMemoryFact[]): StoryMemoryGroups {
  const groups: StoryMemoryGroups = { choices: [], characters: [], locations: [], items: [], plot: [] };

  for (const memory of memories) {
    switch (memory.memoryType.toUpperCase()) {
      case "CHOICE":
        groups.choices.push(memory);
        break;
      case "CHARACTER":
        groups.characters.push(memory);
        break;
      case "LOCATION":
        groups.locations.push(memory);
        break;
      case "ITEM":
        groups.items.push(memory);
        break;
      default:
        groups.plot.push(memory);
    }
  }

  return groups;
}
