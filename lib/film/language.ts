import type { FilmLanguage } from "@/types/studio";

/**
 * Which languages can actually produce video, in one place.
 *
 * Urdu needs the audio-conditioned (A2Vid) lip-sync pipeline, which is
 * implemented but not validated. It stays visible and selectable so the
 * product tells the truth about what is coming, and so a draft written in Urdu
 * is never lost — but generation is refused, here and on the server, rather
 * than quietly routed through the English path where the spoken words would not
 * be the authored ones.
 */
export type LanguageOption = {
  id: FilmLanguage;
  /** English name, for the interface. */
  label: string;
  /** The language's own name, shown alongside. */
  native: string;
  /** False keeps it visible but blocks generation. */
  available: boolean;
  /** Short status for the chip, e.g. "Coming soon". */
  status?: string;
  /** Why, in one sentence the user can act on. */
  note: string;
  rtl: boolean;
};

export const FILM_LANGUAGES: LanguageOption[] = [
  {
    id: "en",
    label: "English",
    native: "English",
    available: true,
    note: "Speech, ambience and score are generated with each clip.",
    rtl: false,
  },
  {
    id: "ur",
    label: "Urdu",
    native: "اردو",
    available: false,
    status: "Coming soon",
    note: "Urdu video and lip-sync are coming soon. You can write and save an Urdu script now, but clips cannot be generated yet.",
    rtl: true,
  },
];

export function filmLanguage(language: FilmLanguage | undefined): LanguageOption {
  return FILM_LANGUAGES.find((item) => item.id === (language ?? "en")) ?? FILM_LANGUAGES[0];
}

export function isRtl(language: FilmLanguage | undefined) {
  return filmLanguage(language).rtl;
}

/**
 * Why this project cannot be generated, or null when it can.
 *
 * Used by the generate step, the queue and the assemble action, so the UI and
 * the server agree and the rule cannot be bypassed by calling the API directly.
 */
export function generationBlockedReason(language: FilmLanguage | undefined): string | null {
  const option = filmLanguage(language);
  if (option.available) return null;
  return `${option.label} video generation is not available yet: it needs the lip-sync pipeline, which is still being validated. Your script is saved — switch the project to English in Setup to generate now.`;
}
