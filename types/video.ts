export type VideoLanguage = "en" | "ur";

export type MovieCharacterVoice = {
  /** Persisted Character.id; display name remains editable separately. */
  characterId?: string;
  archetype: string;
  character: string;
  deepgramModel: string;
  description: string;
  gender: string;
  tone: string;
  voiceName: string;
  /** Restored from Character.currentEmotionalState when available. */
  currentEmotionalState?: string;
  /** Fixed visual description used to keep this character's appearance consistent across generated images */
  appearance?: string;
};

export type MovieDialogueLine = {
  audioError?: string;
  audioMimeType?: string;
  /** Non-secret object identity returned for integrity diagnostics/persistence. */
  audioStoragePath?: string;
  audioUrl?: string;
  /** Existing clip is retained but no longer matches the authored line/voice. */
  audioOutdated?: boolean;
  character: string;
  delivery: string;
  /** Derived per line; never replaces the authored dialogue text or voice identity. */
  emotion?: import("@/lib/audio/emotion-informed-delivery").DialogueEmotion;
  id: string;
  line: string;
  voiceProfile: MovieCharacterVoice;
};

export type MovieScene = {
  /** Stable database identity for Video Studio reconciliation; never used as display order. */
  persistenceSceneId?: string;
  directorNotes: string;
  dialogues: MovieDialogueLine[];
  estimatedDuration: string;
  imagePrompt: string;
  location: string;
  mood: string;
  narration: string;
  /** Scene narrator audio; deliberately separate from character dialogue. */
  narrationAudioUrl?: string;
  narrationAudioOutdated?: boolean;
  sceneNumber: number;
  sceneGenre: string;
  sceneTone: string;
  soundDesign: string;
  title: string;
  visualPrompt: string;
  /** User-approved image-only direction; does not change narration or dialogue. */
  visualDirection?: import("@/lib/image/scene-visual-context").SceneVisualDirection;
  // Optional background music fields attached by the studio flow
  backgroundMusicUrl?: string;
  backgroundMusicTitle?: string;
  backgroundMusicMood?: string;
  backgroundMusicPrompt?: string;
  backgroundMusicHash?: string;
  backgroundMusicCategory?: "ambient" | "suspense" | "emotional" | "action" | "hopeful";
  backgroundMusicTrackId?: string;
  backgroundMusicProvider?: string;
  backgroundMusicReason?: string;
  backgroundMusicStatus?: "idle" | "generating" | "completed" | "silent" | "unavailable" | "failed";
  backgroundMusicError?: string;
  backgroundMusicOutdated?: boolean;
  // Optional generated image fields attached by visual generation flow
  generatedImageUrl?: string;
  generatedImagePrompt?: string;
  generatedImageHash?: string;
  generatedImageStatus?: "idle" | "generating" | "completed" | "failed";
  generatedImageError?: string;
  generatedImageOutdated?: boolean;
};

export type VideoGenerationRequest = {
  genre?: string | string[];
  includeAudio?: boolean;
  language?: VideoLanguage;
  sceneCount?: number;
  scenario: string;
  tone?: string | string[];
};

export type VideoGenerationResponse = {
  audio: {
    errors: string[];
    generatedCount: number;
    provider: string;
    requested: boolean;
  };
  estimatedRuntime: string;
  generatedAt: string;
  genre: string;
  id: string;
  characterVoices: MovieCharacterVoice[];
  logline: string;
  scenes: MovieScene[];
  title: string;
  tone: string;
};
