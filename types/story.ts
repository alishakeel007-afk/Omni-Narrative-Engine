export type StoryMode = "guided" | "custom";

export type ChoiceType = "AI Suggested" | "Custom";

export type StorySetupCharacter = {
  relationshipScore?: number;
  statusState?: string;
  name: string;
  personalityTone: string;
  role: string;
  traits: string[];
  voiceStyle: string;
};

export type StorySetupData = {
  characterAttributes: {
    agility: number;
    charisma: number;
    endurance: number;
    intelligence: number;
    strength: number;
    wisdom: number;
  };
  characterName: string;
  characterRole: string;
  characterTraits: string[];
  characters: StorySetupCharacter[];
  difficulty: "Easy" | "Normal" | "Hard" | "Adaptive";
  genre: string;
  genres: string[];
  lastUpdatedAt: string;
  mode: StoryMode;
  mood: string;
  moods: string[];
  numberOfScenes: number;
  ownerId?: string;
  scenarioDescription: string;
  scenarioTitle: string;
  selectedTemplate: string;
  startingIdea: string;
  storyTitle: string;
  // Phase 7: DB project/draft linkage
  projectId?: string;
  draftId?: string;
};

export type HealthStatus = {
  health: number;
  mana: number;
  resolve: number;
};

export type InventoryUpdate = {
  action: "add" | "remove";
  item: string;
  reason?: string;
} | null;

export type StoryCharacter = {
  relationshipScore?: number;
  statusState?: string;
  /** Stable database identity when this character was restored from a saved draft. */
  id?: string;
  emotionalState: string;
  imageLabel: string;
  name: string;
  relationships: string[];
  role: string;
  traits: string[];
  visualAppearance: string;
  /** Provider-neutral persisted voice selection; not interpreted by Interactive Story. */
  voiceStyle?: string;
};

/** A safe, displayable subset of an ownership-checked StoryMemory record. */
export type PersistedMemoryFact = {
  id: string;
  memoryType: string;
  content: string;
  importanceScore: number;
};

export type StoryRecoverySource = "database" | "offline-cache" | "local" | "none";

export type GeneratedMedia = {
  audioMoodPrompt: string;
  backgroundMusicMood: string;
  imageLabel: string;
  imagePrompt: string;
  narrationDuration: string;
  narrationLabel: string;
  playerState: "ready" | "generating";
  imageUrl?: string;
  narrationAudioUrl?: string;
  musicUrl?: string;
};

export interface EmotionDirectives {
  primaryEmotion: string;
  intensity: number;
  videoAtmosphere: string;
  musicStyle: string;
  voiceStyle: string;
}

export type PlayerPerformance = { consecutiveSuccesses: number; consecutiveFailures: number };
export type CharacterUpdate = { name: string; affinityChange: number; statusUpdate: string };

export type StoryScene = {
  choiceOutcome?: "Success" | "Failure" | "Neutral";
  emotionDirectives?: EmotionDirectives;
  embedding?: number[];
  characterUpdates?: CharacterUpdate[];
  cast: StoryCharacter[];
  chapter: string;
  location: string;
  media: GeneratedMedia;
  mood: string;
  options: string[];
  sceneNumber: number;
  text: string;
  title: string;
  resultSummary?: string;
  inventoryUpdate?: InventoryUpdate;
};

export type MemoryItem = {
  embedding?: number[];
  choiceType: ChoiceType;
  location: string;
  mood: string;
  result: string;
  sceneNumber: number;
  timestamp: string;
  update: string;
  userChoice: string;
};

export type PersistedStoryState = {
  playerPerformance?: PlayerPerformance;
  currentScene: StoryScene;
  currentSceneIndex: number;
  customChoiceInput: string;
  generatedMedia: GeneratedMedia;
  healthStatus: HealthStatus;
  inventory: string[];
  isLoading: boolean;
  lastSavedAt: string | null;
  memoryTimeline: MemoryItem[];
  pastScenes: StoryScene[];
  selectedChoice: string;
  selectedChoiceType: ChoiceType | null;
  setup: StorySetupData;
  dynamicCast: StoryCharacter[];
  /** Facts saved for this draft. These are distinct from the recent choice timeline. */
  persistedMemories: PersistedMemoryFact[];
  recoverySource: StoryRecoverySource;
  recoveryError?: string;
  draftVersion?: number;
  projectTitle?: string;
};


