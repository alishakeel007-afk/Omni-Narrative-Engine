/**
 * Speech types for the audio libraries.
 *
 * These were in `types/video.ts`, which belonged to the removed story engine.
 * Only what the surviving audio modules actually use is kept, and narration is
 * deliberately not among it: scene description guides the picture and is never
 * spoken, so there is no narrator voice to model.
 *
 * `FilmVoiceProfile` in `types/studio.ts` is what the four-step workflow
 * stores; this is the richer shape the ElevenLabs layer resolves it into.
 */
export type MovieCharacterVoice = {
  /** Stable character identity. The display name stays separately editable. */
  characterId?: string;
  archetype: string;
  character: string;
  deepgramModel: string;
  description: string;
  gender: string;
  tone: string;
  voiceName: string;
  currentEmotionalState?: string;
  /** Visual description, kept so one character looks the same across clips. */
  appearance?: string;
};

export type MovieDialogueLine = {
  id: string;
  character: string;
  line: string;
  delivery: string;
  voiceProfile: MovieCharacterVoice;
  audioUrl?: string;
  audioMimeType?: string;
  /** Non-secret object identity, for integrity diagnostics and persistence. */
  audioStoragePath?: string;
  /** The clip is kept but no longer matches the authored line or voice. */
  audioOutdated?: boolean;
  audioError?: string;
  emotion?: unknown;
};

/** Only the mood fields the delivery layer reads. */
export type MovieSceneMood = {
  mood?: string;
  sceneTone?: string;
};
