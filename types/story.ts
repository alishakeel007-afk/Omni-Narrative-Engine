export type StoryMode = "guided" | "custom";

export type ChoiceType = "AI Suggested" | "Custom";

export type StorySetupCharacter = {
  name: string;
  role: string;
  traits: string[];
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
  scenarioDescription: string;
  scenarioTitle: string;
  selectedTemplate: string;
  startingIdea: string;
  storyTitle: string;
};

export type HealthStatus = {
  health: number;
  mana: number;
  resolve: number;
};

export type StoryCharacter = {
  emotionalState: string;
  imageLabel: string;
  name: string;
  relationships: string[];
  role: string;
  traits: string[];
  visualAppearance: string;
};

export type GeneratedMediaMock = {
  audioMoodPrompt: string;
  backgroundMusicMood: string;
  imageLabel: string;
  imagePrompt: string;
  narrationDuration: string;
  narrationLabel: string;
  playerState: "ready" | "generating";
};

export type StoryScene = {
  cast: StoryCharacter[];
  chapter: string;
  location: string;
  media: GeneratedMediaMock;
  mood: string;
  options: string[];
  sceneNumber: number;
  text: string;
  title: string;
};

export type MemoryItem = {
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
  currentScene: StoryScene;
  currentSceneIndex: number;
  customChoiceInput: string;
  generatedMedia: GeneratedMediaMock;
  healthStatus: HealthStatus;
  inventory: string[];
  isLoading: boolean;
  lastSavedAt: string | null;
  memoryTimeline: MemoryItem[];
  pastScenes: StoryScene[];
  selectedChoice: string;
  selectedChoiceType: ChoiceType | null;
  setup: StorySetupData;
};

export type DummySceneTemplate = {
  chapter: string;
  inventoryHint?: string;
  location: string;
  media: Omit<GeneratedMediaMock, "imageLabel" | "imagePrompt" | "audioMoodPrompt"> & {
    baseAudioMoodPrompt: string;
    baseImagePrompt: string;
  };
  mood: string;
  optionSeeds: string[];
  sceneNumber: number;
  text: string;
  title: string;
};
