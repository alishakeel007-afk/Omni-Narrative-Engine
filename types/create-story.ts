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
  audioFingerprint?: string;
  audioStoragePath?: string;
  audioOutdated?: boolean;
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
  visualDirection?: import("@/lib/image/scene-visual-context").SceneVisualDirection;
  narrationAudioUrl?: string;
  narrationAudioFingerprint?: string;
  narrationAudioStoragePath?: string;
  narrationAudioOutdated?: boolean;
  backgroundMusicUrl?: string;
  backgroundMusicStatus?: CreateStoryGenerationStatus | "silent";
  backgroundMusicProvider?: string;
  backgroundMusicPrompt?: string;
};

export type CreateStoryAudioState = {
  backgroundMusicStatus: CreateStoryGenerationStatus;
  backgroundMusicMessage: string;
  backgroundMusicUrl?: string;
  voiceStatus: CreateStoryGenerationStatus;
  voiceMessage: string;
};

export type CreateStoryVideoState = {
  message: string;
  status: CreateStoryGenerationStatus;
};

export type CreateStoryDraft = {
  projectId?: string;
  draftId?: string;
  clientImportId?: string;
  language?: "en" | "ur";
  audio: CreateStoryAudioState;
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
