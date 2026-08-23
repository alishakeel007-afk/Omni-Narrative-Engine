import { characterProfile } from "@/lib/mock-data";
import {
  DEFAULT_STORY_SETUP,
  type PersistedStoryState,
  type StorySetupData
} from "@/lib/story-storage";
import type { StoryCharacter } from "@/types/story";

const genreDescriptors: Record<string, { atmosphere: string; motif: string; location: string }> = {
  Fantasy: {
    atmosphere: "arcane moonlight and ancient symbols",
    motif: "forgotten magic",
    location: "Vel Astra"
  },
  Mystery: {
    atmosphere: "silent corridors and hidden clues",
    motif: "buried secrets",
    location: "Noctis Ward"
  },
  "Sci-Fi": {
    atmosphere: "cold starlight and machine whispers",
    motif: "forbidden technology",
    location: "Axiom Station"
  },
  Horror: {
    atmosphere: "uneasy silence and living shadows",
    motif: "dread",
    location: "Black Hollow"
  },
  Adventure: {
    atmosphere: "restless horizons and dangerous ruins",
    motif: "discovery",
    location: "Skyreach Frontier"
  },
  Romance: {
    atmosphere: "soft candlelight and charged glances",
    motif: "longing",
    location: "Lunara Court"
  },
  "Custom Genre": {
    atmosphere: "shifting worlds and unpredictable tone",
    motif: "experimentation",
    location: "The Unwritten Realm"
  }
};

const moodEmotionMap: Record<string, string> = {
  Calm: "Centered and deliberate",
  Dark: "Guarded and emotionally tense",
  Emotional: "Open-hearted and vulnerable",
  Suspenseful: "Focused and alert",
  Epic: "Bold and ready for destiny",
  Funny: "Playful despite the danger"
};

const traitMap: Record<StorySetupData["mode"], string[]> = {
  guided: ["Strategic", "Adaptive", "Curious", "Decisive"],
  custom: ["Inventive", "Independent", "Bold", "Unpredictable"]
};

export function buildPrimaryCharacterProfile(
  storySetup: StorySetupData = DEFAULT_STORY_SETUP
): StoryCharacter {
  const genreMeta =
    genreDescriptors[storySetup.genre] ?? genreDescriptors[DEFAULT_STORY_SETUP.genre];

  return {
    emotionalState: moodEmotionMap[storySetup.mood] ?? characterProfile.emotionalState,
    imageLabel: `${storySetup.characterName} portrait placeholder in a ${storySetup.genre.toLowerCase()} cinematic style`,
    name: storySetup.characterName,
    relationships: [
      `The companion measures every decision against ${storySetup.characterName}'s ${storySetup.mood.toLowerCase()} instincts.`,
      `The narrative frame is ${storySetup.mode === "custom" ? "player-authored" : `guided by the ${storySetup.selectedTemplate} template`}.`
    ],
    role: storySetup.characterRole,
    traits: [...traitMap[storySetup.mode], ...characterProfile.traits].slice(0, 5),
    visualAppearance: `${storySetup.characterName} wears a ${storySetup.genre.toLowerCase()} silhouette shaped by ${genreMeta.atmosphere}, while still presenting as a ${storySetup.characterRole.toLowerCase()}.`
  };
}

export function countCustomChoices(
  progress: PersistedStoryState | null
) {
  if (!progress) return 0;

  return progress.memoryTimeline.filter((item) => item.choiceType === "Custom").length;
}
