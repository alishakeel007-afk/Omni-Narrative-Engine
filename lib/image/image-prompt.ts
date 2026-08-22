// ============================================================
// lib/image/image-prompt.ts
// Formats and hashes visual prompts for consistent AI image generation.
// ============================================================

import type { ImageGenerationRequest } from "./types";

/**
 * Clean and structure the prompt for AI text-to-image models
 */
export function buildImagePrompt(request: ImageGenerationRequest): string {
  const basePrompt = (request.imagePrompt || request.visualPrompt || request.sceneTitle || "Cinematic fantasy scene").trim();
  
  const qualifiers: string[] = [basePrompt];

  if (request.mood && !basePrompt.toLowerCase().includes(request.mood.toLowerCase())) {
    qualifiers.push(`mood: ${request.mood}`);
  }

  if (request.location && !basePrompt.toLowerCase().includes(request.location.toLowerCase())) {
    qualifiers.push(`setting: ${request.location}`);
  }

  qualifiers.push("cinematic lighting", "high detailed", "8k resolution", "masterpiece");

  return qualifiers.join(", ");
}

/**
 * Fast deterministic hash for prompt deduplication
 */
export function buildImageHash(request: ImageGenerationRequest): string {
  const key = [
    request.sceneId,
    (request.imagePrompt || "").toLowerCase().trim(),
    (request.mood || "").toLowerCase().trim(),
    (request.location || "").toLowerCase().trim(),
  ].join("|");

  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
