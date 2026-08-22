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

  if (request.characterNames && request.characterNames.length > 0) {
    qualifiers.push(`featuring the same characters throughout: ${request.characterNames.join(", ")}`);
  }

  qualifiers.push("cinematic lighting", "high detailed", "8k resolution", "masterpiece");

  return qualifiers.join(", ");
}

/**
 * Deterministic hash used to derive a stable per-character image seed.
 * Reusing the same seed for the same character(s) across scenes keeps the
 * diffusion model's starting noise consistent, improving visual continuity.
 */
function stableHash(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

/**
 * Builds a stable seed for image generation. Scenes sharing the same cast
 * (by name) reuse the same seed so recurring characters stay visually
 * consistent; scenes with no cast fall back to a prompt-derived seed.
 */
export function buildImageSeed(request: ImageGenerationRequest): number {
  const key = request.characterNames && request.characterNames.length > 0
    ? request.characterNames.map((name) => name.trim().toLowerCase()).sort().join("|")
    : (request.imagePrompt || request.visualPrompt || request.sceneTitle || "default").toLowerCase().trim();

  return stableHash(key) % 1000000;
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
