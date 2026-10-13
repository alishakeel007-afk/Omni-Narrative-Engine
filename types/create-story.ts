export type CreateStoryGenerationStatus = "idle" | "generating" | "ready" | "error";

export type CreateStoryCharacter = {
  id: string;
  name: string;
  personalityTone: string;
  role: string;
  voiceStyle: string;
};

export type CreateStoryDialogue = {
  audioUrl?: string;
  characterId: string;
  characterName: string;
  id: string;
  text: string;
  voiceStyle?: string;
};

export type CreateStoryScene = {
  activeCharacterIds: string[];
  dialogues: CreateStoryDialogue[];
  id: string;
  sceneGenre: string;
  sceneNumber: number;
  sceneTone: string;
  selectedSuggestion: string;
  storyDescription: string;
  suggestions: string[];
  title: string;
  generatedImageUrl?: string;
  generatedImagePrompt?: string;
  generatedImageStatus?: CreateStoryGenerationStatus;
  generatedImageError?: string;
};

export type CreateStoryAudioState = {
  backgroundMusicStatus: CreateStoryGenerationStatus;
  backgroundMusicMessage: string;
  backgroundMusicUrl?: string;
  voiceStatus: CreateStoryGenerationStatus;
  voiceMessage: string;
};

export type CreateStoryVisualsState = {
  status: CreateStoryGenerationStatus;
  message: string;
};

export type CreateStoryVideoState = {
  message: string;
  status: CreateStoryGenerationStatus;
};

export type CreateStoryDraft = {
  audio: CreateStoryAudioState;
  visuals: CreateStoryVisualsState;
  characters: CreateStoryCharacter[];
  genres: string[];
  includeNarration: boolean;
  numberOfScenes: number;
  scenes: CreateStoryScene[];
  selectedMode: "create-your-own";
  storyTitle: string;
  tones: string[];
  updatedAt: string;
  video: CreateStoryVideoState;
};
