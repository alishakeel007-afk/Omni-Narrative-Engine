import type { FilmLanguage, StudioScene } from "@/types/studio";
import { spokenDialogue } from "@/types/studio";

/**
 * Pre-generation speech estimates.
 *
 * These rates are a heuristic only. Label anything derived from them as
 * estimated: the real number arrives from the synthesised audio on the Urdu
 * path, and from the generated take's measured duration on the English one.
 *
 * Nothing here carries its own clip-length constant. The limit is always passed
 * in, because it depends on what the project asked for and on what this
 * deployment is configured for — see `lib/film/duration.ts`.
 */
const WORDS_PER_SECOND: Record<FilmLanguage, number> = {
  en: 2.6,
  ur: 2.2,
};

/**
 * Share of a clip that can be speech. A line that fills the entire clip leaves
 * no room to enter, land or breathe, so the budget is deliberately under the
 * clip length rather than equal to it.
 */
const SPEECH_SHARE = 0.8;

export function wordCount(text: string) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Estimated spoken length. Never present this as a measurement. */
export function estimateSpokenSeconds(text: string, language: FilmLanguage) {
  return wordCount(text) / WORDS_PER_SECOND[language];
}

/** Seconds of a `clipSeconds` clip that may be speech. */
export function speechBudgetSeconds(clipSeconds: number) {
  return clipSeconds * SPEECH_SHARE;
}

/** Roughly how many words fit, used to steer generated dialogue. */
export function wordBudget(language: FilmLanguage, clipSeconds: number) {
  return Math.max(4, Math.floor(speechBudgetSeconds(clipSeconds) * WORDS_PER_SECOND[language]));
}

export type DialogueFit = {
  words: number;
  estimatedSeconds: number;
  overBudget: boolean;
  limitSeconds: number;
};

/**
 * Whether one line fits the time available to it.
 *
 * `limitSeconds` is the budget for this line alone. On the Urdu path that is
 * the whole clip's speech budget, because a lip-synced clip carries one
 * speaking turn. On the English path a clip can hold several turns, so the
 * caller divides the budget — see `sceneSpeechFit`.
 */
export function dialogueFit(
  text: string,
  language: FilmLanguage,
  limitSeconds: number,
): DialogueFit {
  const estimatedSeconds = estimateSpokenSeconds(text, language);
  return {
    words: wordCount(text),
    estimatedSeconds,
    overBudget: estimatedSeconds > limitSeconds,
    limitSeconds,
  };
}

export type SceneSpeechFit = {
  /** Estimated total speech across every spoken line in the scene. */
  estimatedSeconds: number;
  budgetSeconds: number;
  overBudget: boolean;
  lines: number;
};

/**
 * Whether a scene's whole exchange fits one generated clip.
 *
 * This is the English check: several speakers may share one clip, so what
 * matters is the total, not any single line.
 */
export function sceneSpeechFit(
  scene: Pick<StudioScene, "dialogues">,
  language: FilmLanguage,
  clipSeconds: number,
): SceneSpeechFit {
  const spoken = spokenDialogue(scene);
  const estimatedSeconds = spoken.reduce(
    (total, line) => total + estimateSpokenSeconds(line.text, language),
    0,
  );
  const budgetSeconds = speechBudgetSeconds(clipSeconds);
  return {
    estimatedSeconds,
    budgetSeconds,
    overBudget: estimatedSeconds > budgetSeconds,
    lines: spoken.length,
  };
}
