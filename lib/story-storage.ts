import type { HealthStatus, StorySetupData } from "@/types/story";

export type {
  ChoiceType,
  DummySceneTemplate,
  GeneratedMediaMock,
  HealthStatus,
  MemoryItem,
  PersistedStoryState,
  StoryCharacter,
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
  characterName: "Lyra Voss",
  characterRole: "Relic Interpreter",
  genre: "Fantasy",
  lastUpdatedAt: "",
  mode: "guided",
  mood: "Suspenseful",
  selectedTemplate: "Lost Kingdom",
  startingIdea:
    "A hidden gate opens beneath a forgotten observatory, and my character wants to discover why the machine inside already knows their name.",
  storyTitle: "Echoes Beyond the Gate"
};
