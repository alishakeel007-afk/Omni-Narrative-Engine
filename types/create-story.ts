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
  /** Fingerprint of the exact text/voice configuration that produced audioUrl. */
  audioFingerprint?: string;
  /** Stored object identity for persistent clips; absent legacy URLs are unverified. */
  audioStoragePath?: string;
  /** Retained legacy/generated audio is never discarded automatically. */
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
  /** Existing Custom Mode narration clip; retained when saved account-side. */
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

export type CreateStoryVisualsState = {
  status: CreateStoryGenerationStatus;
  message: string;
};

export type CreateStoryVideoState = {
  message: string;
  status: CreateStoryGenerationStatus;
};

export type CreateStoryDraft = {
  /** Stable account project identity once this browser-local draft is imported. */
  projectId?: string;
  /** Active server draft identity once this browser-local draft is imported. */
  draftId?: string;
  /** Client-generated import key makes Save to My Projects idempotent. */
  clientImportId: string;
  language: "en" | "ur";
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
