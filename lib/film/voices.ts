import type { FilmVoiceProfile } from "@/types/studio";

/**
 * Selectable Urdu voices.
 *
 * These mirror the archetypes `lib/audio/elevenlabs-urdu-tts.ts` can resolve.
 * There is deliberately no narrator entry: narration is not spoken content in
 * this product. A voice can still be unavailable at generation time if its id
 * is not configured, which that module reports per line rather than silently
 * substituting a different identity.
 */
export const URDU_VOICE_ARCHETYPES: FilmVoiceProfile[] = [
  { archetype: "hero_male", gender: "male", label: "Hero (male)" },
  { archetype: "hero_female", gender: "female", label: "Hero (female)" },
  { archetype: "villain_male", gender: "male", label: "Villain (male)" },
  { archetype: "villain_female", gender: "female", label: "Villain (female)" },
  { archetype: "mentor_male", gender: "male", label: "Mentor (male)" },
  { archetype: "mentor_female", gender: "female", label: "Mentor (female)" },
  { archetype: "elder_male", gender: "male", label: "Elder (male)" },
  { archetype: "elder_female", gender: "female", label: "Elder (female)" },
  { archetype: "young_male", gender: "male", label: "Young (male)" },
  { archetype: "young_female", gender: "female", label: "Young (female)" },
  { archetype: "neutral_male", gender: "male", label: "Neutral (male)" },
  { archetype: "neutral_female", gender: "female", label: "Neutral (female)" },
  { archetype: "child", gender: "", label: "Child" },
  { archetype: "creature_robot", gender: "", label: "Creature or robot" },
];

export function urduVoice(archetype: string) {
  return URDU_VOICE_ARCHETYPES.find((voice) => voice.archetype === archetype);
}
