import type { MovieCharacterVoice } from "@/types/video";

// Models exposed by this application's current Deepgram Aura-2 voice library.
export const SUPPORTED_DEEPGRAM_VOICES = new Set([
  "aura-2-amalthea-en", "aura-2-andromeda-en", "aura-2-apollo-en", "aura-2-arcas-en",
  "aura-2-aries-en", "aura-2-asteria-en", "aura-2-athena-en", "aura-2-atlas-en",
  "aura-2-aurora-en", "aura-2-cora-en", "aura-2-cordelia-en", "aura-2-draco-en",
  "aura-2-helena-en", "aura-2-hera-en", "aura-2-hermes-en", "aura-2-iris-en",
  "aura-2-janus-en", "aura-2-jupiter-en", "aura-2-luna-en", "aura-2-mars-en",
  "aura-2-minerva-en", "aura-2-neptune-en", "aura-2-orion-en", "aura-2-orpheus-en",
  "aura-2-pandora-en", "aura-2-pluto-en", "aura-2-saturn-en", "aura-2-thalia-en",
  "aura-2-vesta-en", "aura-2-zeus-en",
]);

export function resolveDeepgramVoiceModel(candidate: string | undefined, fallback: string): string {
  if (candidate && SUPPORTED_DEEPGRAM_VOICES.has(candidate)) return candidate;
  return fallback;
}

export function hasSpeechText(text: string | undefined): boolean {
  return Boolean(text?.trim());
}

export function isNarratorVoice(profile: Pick<MovieCharacterVoice, "archetype" | "character">): boolean {
  return profile.archetype.toLowerCase() === "narrator" || profile.character.trim().toLowerCase() === "narrator";
}
