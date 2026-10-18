// ============================================================
// lib/image/types.ts
// Shared types for the visual image generation system.
// ============================================================

import type { SceneVisualBrief } from "./scene-visual-context";

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
  /** Fixed visual appearance descriptions for characters present in the scene, keyed by character name */
  characterAppearances?: string[];
  /**
   * Short, established facts from earlier scenes. These are optional because
   * older story and Video Studio callers do not persist a separate visual
   * continuity record.
   */
  continuityNotes?: string[];
  /** Project-level style direction, when the caller has one. */
  artStyle?: string;
  /** Canonical, inspectable scene facts used to keep required events first. */
  visualBrief?: SceneVisualBrief;
};

/** Output from an image provider */
export type GeneratedImage = {
  imageBuffer: ArrayBuffer;
  contentType: string; // e.g., "image/jpeg" or "image/png"
  provider: string;
};
