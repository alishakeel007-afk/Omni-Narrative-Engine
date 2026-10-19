import type { FilmAssist, FilmLanguage } from "@/types/studio";

/** Concrete first choices need no provider call just to open Setup. */
export const GUIDED_STARTS = [
  { label: "The last tape", message: "A night caretaker at a shuttered concert hall finds a tape of a performance that never happened, and the musician on it is still waiting." },
  { label: "The long commute", message: "Two strangers share the same late train every night for a year without speaking, until one of them leaves something behind on purpose." },
  { label: "Lighthouse weather", message: "A keeper who logs the weather for a coast nobody sails any more starts receiving replies to reports she never sent." },
];

export type SuggestionContext = {
  field: string;
  language: FilmLanguage;
  assist: FilmAssist;
  /** Only the project slice this decision actually depends on. */
  depends: string;
};

/**
 * Identity for one decision point.
 *
 * Proposals are reused while the context is unchanged, so revisiting a step
 * costs nothing. Including `depends` means editing the thing a suggestion was
 * based on invalidates it, rather than showing advice about older text.
 */
export function suggestionKey(context: SuggestionContext) {
  const raw = `${context.assist}|${context.language}|${context.field}|${context.depends}`;
  let hash = 5381;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (((hash << 5) + hash) ^ raw.charCodeAt(index)) >>> 0;
  }
  return `${context.field}-${hash.toString(36)}`;
}
