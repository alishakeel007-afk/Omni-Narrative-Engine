// ============================================================
// lib/audio/music-prompt.ts
// Builds a controlled, instrumental-focused music prompt from
// raw scene data. The goal is consistent, background-friendly
// output from any audio AI provider.
// ============================================================

import type { MusicGenerationRequest } from "./types";

const INSTRUMENTAL_CONSTRAINTS = [
  "instrumental",
  "no vocals",
  "no lyrics",
  "background score",
  "suitable for dialogue background",
  "slow evolving arrangement",
].join(", ");

/**
 * Maps a mood string to a concise cinematic descriptor.
 * Falls back to the raw mood string if not matched.
 */
function describeMood(mood: string): string {
  const lower = mood.toLowerCase();

  if (lower.includes("mysterious") || lower.includes("mystery"))
    return "mysterious and tense, dark atmospheric textures";
  if (lower.includes("epic") || lower.includes("heroic"))
    return "epic orchestral, bold brass and driving percussion";
  if (lower.includes("suspense") || lower.includes("tense"))
    return "suspenseful, building tension with low strings";
  if (lower.includes("sad") || lower.includes("mournful") || lower.includes("melanchol"))
    return "melancholic, soft piano and gentle strings";
  if (lower.includes("peaceful") || lower.includes("calm") || lower.includes("serene"))
    return "peaceful ambient, gentle pads and soft textures";
  if (lower.includes("romantic") || lower.includes("love"))
    return "romantic, warm strings and tender melody";
  if (lower.includes("horror") || lower.includes("fear") || lower.includes("dread"))
    return "dark horror, deep drone, unsettling dissonance";
  if (lower.includes("action") || lower.includes("battle") || lower.includes("fight"))
    return "high-energy action, fast percussion and aggressive brass";
  if (lower.includes("hopeful") || lower.includes("triumph") || lower.includes("victory"))
    return "uplifting orchestral, rising strings and hopeful tone";
  if (lower.includes("dramatic"))
    return "dramatic cinematic, rich orchestral swell";

  return mood;
}

/**
 * Builds a complete music generation prompt from scene data.
 * The output is designed to produce background-appropriate,
 * instrumental music from any diffusion-based audio model.
 */
export function buildMusicPrompt(request: MusicGenerationRequest): string {
  const moodDescription = describeMood(request.mood);

  const parts: string[] = [
    "Cinematic orchestral background score.",
    `Mood: ${moodDescription}.`,
  ];

  if (request.soundDesign && request.soundDesign.trim()) {
    parts.push(`Sound design: ${request.soundDesign.trim()}.`);
  }

  if (request.sceneLocation && request.sceneLocation.trim()) {
    parts.push(`Scene atmosphere: ${request.sceneLocation.trim()}.`);
  }

  if (request.genres && request.genres.length > 0) {
    parts.push(`Genre palette: ${request.genres.join(", ")}.`);
  }

  parts.push(
    `Approximately ${request.durationSeconds} seconds.`,
    INSTRUMENTAL_CONSTRAINTS + ".",
    "Do not generate any spoken words or singing.",
    "Keep the dynamics suitable to remain behind character dialogue.",
  );

  return parts.join(" ");
}

/**
 * Builds a compact, deterministic hash string for deduplication.
 * Same scene + same prompt => same hash => no re-generation.
 */
export function buildPromptHash(request: MusicGenerationRequest): string {
  const key = [
    request.sceneId,
    request.mood.toLowerCase().trim(),
    request.soundDesign.toLowerCase().trim(),
    request.durationSeconds,
    (request.genres ?? []).join(","),
  ].join("|");

  // Simple fast hash (djb2) — sufficient for deduplication
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash = hash >>> 0; // Convert to unsigned 32-bit
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Parses a scene's estimatedDuration string into seconds.
 * Falls back to a default if parsing fails.
 */
export function parseDurationSeconds(
  estimatedDuration: string | undefined,
  fallbackSeconds = 30
): number {
  if (!estimatedDuration) return fallbackSeconds;

  const secondsMatch = estimatedDuration.match(/(\d+)\s*s(ec)?/i);
  if (secondsMatch) return Math.max(5, Math.min(45, parseInt(secondsMatch[1], 10)));

  const minutesMatch = estimatedDuration.match(/(\d+)\s*m(in)?/i);
  if (minutesMatch)
    return Math.max(5, Math.min(45, parseInt(minutesMatch[1], 10) * 60));

  return fallbackSeconds;
}
