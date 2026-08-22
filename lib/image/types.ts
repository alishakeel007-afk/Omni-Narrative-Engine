// ============================================================
// lib/image/types.ts
// Shared types for the visual image generation system.
// ============================================================

export type SceneImageStatus = "idle" | "generating" | "completed" | "failed";

/** Input to the image generation system */
export type ImageGenerationRequest = {
  sceneId: string;
  imagePrompt: string;
  visualPrompt?: string;
  sceneTitle?: string;
  location?: string;
  mood?: string;
  genres?: string[];
  width?: number;
  height?: number;
  /** Character names present in the scene, used to derive a stable per-character seed for visual consistency */
  characterNames?: string[];
};

/** Output from an image provider */
export type GeneratedImage = {
  imageBuffer: ArrayBuffer;
  contentType: string; // e.g., "image/jpeg" or "image/png"
  provider: string;
};
