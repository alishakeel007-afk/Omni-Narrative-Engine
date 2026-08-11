import type { HealthStatus, StorySetupData } from "@/types/story";

export type {
  ChoiceType,
  DummySceneTemplate,
  GeneratedMedia,
  HealthStatus,
  MemoryItem,
  PersistedStoryState,
  StoryCharacter,
  StorySetupCharacter,
  StoryMode,
  StoryScene,
  StorySetupData
} from "@/types/story";

export const STORY_SETUP_STORAGE_KEY = "omni-narrative-engine-story-setup";
export const STORY_PROGRESS_STORAGE_KEY = "omni-narrative-engine-story-state";
export const STORY_COMPLETED_STORAGE_KEY = "omni-narrative-engine-story-completed";

export const DEFAULT_HEALTH_STATUS: HealthStatus = {
  health: 84,
  mana: 68,
  resolve: 76
};

export const DEFAULT_INVENTORY = ["Ancient Map", "Moon Key", "Echo Lantern"];

export const DEFAULT_STORY_SETUP: StorySetupData = {
  characterAttributes: {
    agility: 55,
    charisma: 58,
    endurance: 60,
    intelligence: 72,
    strength: 48,
    wisdom: 66
  },
  characterName: "Lyra Voss",
  characterRole: "Relic Interpreter",
  characterTraits: ["Observant", "Protective", "Curious"],
  characters: [
    {
      name: "Lyra Voss",
      personalityTone: "Observant, protective, curious",
      role: "Relic Interpreter",
      traits: ["Observant", "Protective", "Curious"],
      voiceStyle: "Soft confident female voice"
    }
  ],
  difficulty: "Adaptive",
  genre: "Fantasy",
  genres: ["Fantasy"],
  lastUpdatedAt: "",
  mode: "guided",
  mood: "Suspenseful",
  moods: ["Suspenseful"],
  numberOfScenes: 3,
  scenarioDescription:
    "A hidden gate opens beneath a forgotten observatory, and the ancient machine inside already knows the hero's name.",
  scenarioTitle: "The Whispering Gate",
  selectedTemplate: "Lost Kingdom",
  startingIdea:
    "A hidden gate opens beneath a forgotten observatory, and my character wants to discover why the machine inside already knows their name.",
  storyTitle: "Echoes Beyond the Gate"
};
