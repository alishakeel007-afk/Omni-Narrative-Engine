import type { GeneratedMedia, InventoryUpdate, StoryCharacter, StoryScene } from "@/types/story";

type RecordValue = Record<string, unknown>;

const DEFAULT_MEDIA: GeneratedMedia = {
  audioMoodPrompt: "", backgroundMusicMood: "", imageLabel: "", imagePrompt: "",
  narrationDuration: "", narrationLabel: "", playerState: "ready"
};

function asRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}

function requiredText(value: unknown, field: string, minimumLength = 1): string {
  if (typeof value !== "string" || value.trim().length < minimumLength) throw new Error(`AI scene response is missing a valid ${field}.`);
  return value.trim();
}

function optionalText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCast(value: unknown): StoryCharacter[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<StoryCharacter[]>((characters, candidate) => {
    const character = asRecord(candidate);
    if (!character || !optionalText(character.name)) return characters;
    const name = optionalText(character.name);
    characters.push({
      name, role: optionalText(character.role) || "Supporting character", emotionalState: optionalText(character.emotionalState) || "Neutral",
      visualAppearance: optionalText(character.visualAppearance),
      traits: Array.isArray(character.traits) ? character.traits.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [],
      relationships: Array.isArray(character.relationships) ? character.relationships.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [],
      imageLabel: optionalText(character.imageLabel) || name
    });
    return characters;
  }, []);
}

function normalizeMedia(value: unknown): GeneratedMedia {
  const media = asRecord(value) ?? {};
  return {
    audioMoodPrompt: optionalText(media.audioMoodPrompt), backgroundMusicMood: optionalText(media.backgroundMusicMood),
    imageLabel: optionalText(media.imageLabel), imagePrompt: optionalText(media.imagePrompt),
    narrationDuration: optionalText(media.narrationDuration), narrationLabel: optionalText(media.narrationLabel),
    playerState: media.playerState === "generating" ? "generating" : "ready"
  };
}

function normalizeInventoryUpdate(value: unknown): InventoryUpdate {
  if (value === null || value === undefined) return null;
  const update = asRecord(value);
  const item = optionalText(update?.item);
  if (!update || !item || (update.action !== "add" && update.action !== "remove")) return null;
  return { action: update.action, item, reason: optionalText(update.reason) || undefined };
}

/** Converts untrusted provider output to the complete scene shape required by the story UI. */
export function normalizeGeneratedScene(value: unknown, sceneNumber: number): StoryScene {
  const scene = asRecord(value);
  if (!scene) throw new Error("AI scene response must be a JSON object.");
  const options = (Array.isArray(scene.options) ? scene.options : [])
    .filter((item): item is string => typeof item === "string" && item.trim().length >= 3)
    .map((item) => item.trim());
  if (options.length !== 3 || new Set(options.map((item) => item.toLocaleLowerCase())).size !== 3) {
    throw new Error("AI scene response must contain exactly three distinct choices.");
  }
  return {
    sceneNumber, title: requiredText(scene.title, "title"), chapter: requiredText(scene.chapter, "chapter"),
    location: requiredText(scene.location, "location"), mood: requiredText(scene.mood, "mood"),
    text: requiredText(scene.text, "narrative text", 40), options, cast: normalizeCast(scene.cast),
    media: { ...DEFAULT_MEDIA, ...normalizeMedia(scene.media) }, resultSummary: optionalText(scene.resultSummary),
    inventoryUpdate: normalizeInventoryUpdate(scene.inventoryUpdate)
  };
}
