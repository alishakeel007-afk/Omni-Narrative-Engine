export type MovieCharacterVoice = {
  archetype: string;
  character: string;
  deepgramModel: string;
  description: string;
  gender: string;
  tone: string;
  voiceName: string;
};

export type MovieDialogueLine = {
  audioError?: string;
  audioMimeType?: string;
  audioUrl?: string;
  character: string;
  delivery: string;
  id: string;
  line: string;
  voiceProfile: MovieCharacterVoice;
};

export type MovieScene = {
  directorNotes: string;
  dialogues: MovieDialogueLine[];
  estimatedDuration: string;
  imagePrompt: string;
  location: string;
  mood: string;
  narration: string;
  sceneNumber: number;
  sceneGenre: string;
  sceneTone: string;
  soundDesign: string;
  title: string;
  visualPrompt: string;
  // Optional background music fields attached by the studio flow
  backgroundMusicUrl?: string;
  backgroundMusicTitle?: string;
  backgroundMusicMood?: string;
  backgroundMusicPrompt?: string;
  backgroundMusicHash?: string;
  backgroundMusicStatus?: "idle" | "generating" | "completed" | "failed";
  backgroundMusicError?: string;
  // Optional generated image fields attached by visual generation flow
  generatedImageUrl?: string;
  generatedImagePrompt?: string;
  generatedImageHash?: string;
  generatedImageStatus?: "idle" | "generating" | "completed" | "failed";
  generatedImageError?: string;
};

export type VideoGenerationRequest = {
  genre?: string | string[];
  includeAudio?: boolean;
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
