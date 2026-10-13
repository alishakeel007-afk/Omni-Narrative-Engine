// ============================================================
// lib/audio/types.ts
// Shared types for the audio generation system.
// The provider abstraction layer means only this file and
// music-provider.ts need to change when a real AI provider
// is connected.
// ============================================================

export type SceneMusicStatus = "idle" | "generating" | "completed" | "failed";

/** Per-scene music state attached to MovieScene */
export type SceneMusicState = {
  /** Generated audio URL (Supabase or data URL) */
  backgroundMusicUrl?: string;
  /** Human-readable mood label */
  backgroundMusicMood?: string;
  /** The exact prompt that was sent to the provider */
  backgroundMusicPrompt?: string;
  /** Deterministic hash of the prompt+duration, used for deduplication */
  backgroundMusicHash?: string;
  /** Current generation lifecycle state */
  backgroundMusicStatus?: SceneMusicStatus;
  /** Error message if status === 'failed' */
  backgroundMusicError?: string;
};

/** Input to the music generation system */
export type MusicGenerationRequest = {
  sceneId: string;        // Unique identifier for deduplication
  mood: string;
  soundDesign: string;
  sceneTitle: string;
  sceneLocation?: string;
  narration?: string;
  durationSeconds: number;
  genres?: string[];
};

/** What a successful provider call returns */
export type GeneratedMusic = {
  audioBuffer: ArrayBuffer;
  contentType: string;      // e.g. "audio/mpeg"
  provider: string;
  durationSeconds: number;
};
