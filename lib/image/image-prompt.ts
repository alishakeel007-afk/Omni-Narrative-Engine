// ============================================================
// lib/image/image-prompt.ts
// Formats and hashes visual prompts for consistent AI image generation.
// ============================================================

import type { ImageGenerationRequest } from "./types";

// SDXL responds best to a small set of concrete visual requirements. Keeping
// the prompt bounded also prevents a verbose generated scene description from
// pushing the location, cast, or key prop out of the model's attention.
const MAX_IMAGE_PROMPT_LENGTH = 1_200;


function compact(value: string | undefined, maxLength: number): string {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const candidate = normalized.slice(0, maxLength + 1);
  const boundary = Math.max(candidate.lastIndexOf(". "), candidate.lastIndexOf("; "), candidate.lastIndexOf(", "), candidate.lastIndexOf(" "));
  return (boundary > Math.floor(maxLength * 0.6) ? candidate.slice(0, boundary) : normalized.slice(0, maxLength)).replace(/[\s,;:.]+$/, "");
}

function uniqueFacts(values: Array<string | undefined>, maxItems: number, maxLength: number): string[] {
  const seen = new Set<string>();
  const facts: string[] = [];

  for (const value of values) {
    const fact = compact(value, maxLength);
    const key = fact.toLowerCase();
    if (!fact || seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
    if (facts.length === maxItems) break;
  }

  return facts;
}

function truncatePrompt(parts: string[]): string {
  let prompt = "";
  for (const part of parts) {
    const separator = prompt ? "\n" : "";
    if (prompt.length + separator.length + part.length > MAX_IMAGE_PROMPT_LENGTH) {
      const remaining = MAX_IMAGE_PROMPT_LENGTH - prompt.length - separator.length;
      if (remaining > 24) prompt += `${separator}${part.slice(0, remaining - 1).trimEnd()}.`;
      break;
    }
    prompt += `${separator}${part}`;
  }
  return prompt;
}

/**
 * Clean and structure the prompt for AI text-to-image models
 */
export function buildImagePrompt(request: ImageGenerationRequest): string {
  const brief = request.visualBrief;
  const sceneDescription = compact(
    request.imagePrompt || request.visualPrompt || request.sceneTitle || "Cinematic story scene",
    520
  );
  const visualAction = compact(request.visualPrompt, 320);
  const location = compact(request.location, 180);
  const appearances = uniqueFacts(request.characterAppearances ?? [], 4, 220);
  const names = uniqueFacts(request.characterNames ?? [], 4, 80);
  const continuity = uniqueFacts(request.continuityNotes ?? [], 2, 180);
  const artStyle = compact(request.artStyle, 140);

  const parts = [
    "Cinematic story illustration. Required story facts are mandatory and take priority over decoration.",
    brief?.requiredVisualEvents.length ? `REQUIRED VISUAL EVENTS (show clearly): ${brief.requiredVisualEvents.join(" | ")}.` : `Required action and important objects: ${sceneDescription}`,
    brief?.visibleCharacterActions.length ? `REQUIRED CHARACTER ACTIONS: ${brief.visibleCharacterActions.join(" | ")}.` : "",
    brief?.primaryLocation ? `SETTING: ${brief.primaryLocation}${brief.interiorOrExterior === "mixed" ? "; compose it so the required interior and exterior facts are both visible." : "."}` : (location ? `SETTING: ${location}.` : "Use the stated story setting; do not invent a different location."),
    brief?.essentialObjects.length ? `ESSENTIAL OBJECTS: ${brief.essentialObjects.join(", ")}.` : "",
    brief?.compositionAndCamera ? `COMPOSITION: ${brief.compositionAndCamera}` : "",
    visualAction && visualAction.toLowerCase() !== sceneDescription.toLowerCase()
      ? `Visual staging: ${visualAction}`
      : "",
    appearances.length > 0
      ? `Characters present, preserve these established visual identities and clothing exactly: ${appearances.join("; ")}. Do not add unlisted protagonists.`
      : names.length > 0
        ? `Characters present: ${names.join(", ")}. Keep their established identity consistent with earlier scenes.`
        : "",
    continuity.length > 0 ? `Character continuity only: ${continuity.map((fact) => fact.replace(/[.]+$/, "")).join("; ")}.` : "",
    artStyle ? `Keep the established project art direction: ${artStyle}.` : "",
    request.mood ? `Lighting and atmosphere: ${compact(request.mood, 120)}.` : "Cinematic lighting appropriate to the stated scene.",
    "Focused composition, clear character blocking, physically plausible props, story still."
  ].filter(Boolean);

  return truncatePrompt(parts);
}

/**
 * Supported by the configured Cloudflare SDXL Lightning model. This is kept
 * short and only rejects contradictions to the authored setting/cast; it does
 * not try to replace the positive scene brief with generic style keywords.
 */
export function buildImageNegativePrompt(request: ImageGenerationRequest): string {
  // Never negate an interior/exterior view generically: scenes can correctly
  // show an apartment *and* a blackout skyline, or a laboratory and a sky
  // event. The canonical brief supplies only non-contradictory exclusions.
  return [...new Set(request.visualBrief?.negativeConstraints ?? ["unrelated setting", "unlisted protagonists", "text, watermark, logo"])].join(", ");
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
    (request.visualPrompt || "").toLowerCase().trim(),
    (request.mood || "").toLowerCase().trim(),
    (request.location || "").toLowerCase().trim(),
    (request.characterNames ?? []).map((name) => name.toLowerCase().trim()).sort().join("|"),
    (request.characterAppearances ?? []).map((appearance) => appearance.toLowerCase().trim()).sort().join("|"),
    (request.continuityNotes ?? []).map((note) => note.toLowerCase().trim()).sort().join("|"),
  ].join("|");

  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash) ^ key.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
