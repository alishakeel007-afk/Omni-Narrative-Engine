import type { MovieScene, VideoGenerationResponse, VideoLanguage } from "@/types/video";

const URDU_SCRIPT = /[\u0600-\u06FF]/;
const LATIN_LETTER = /[A-Za-z]/;

export function isUrduLanguage(value: unknown): value is "ur" {
  return value === "ur";
}

export function textDirectionForVideoLanguage(language: VideoLanguage): "rtl" | "ltr" {
  return language === "ur" ? "rtl" : "ltr";
}

export function containsUrduScript(value: string): boolean {
  return URDU_SCRIPT.test(value);
}

function audienceText(scenes: MovieScene[], title: string, logline: string): string[] {
  return [title, logline, ...scenes.flatMap((scene) => [scene.narration, ...scene.dialogues.map((dialogue) => dialogue.line)])]
    .map((value) => value.trim())
    .filter(Boolean);
}

/** A light guard: names, numbers, and occasional English terms remain valid. */
export function validateUrduAudienceScript(script: Pick<VideoGenerationResponse, "title" | "logline" | "scenes">): string | null {
  const combined = audienceText(script.scenes, script.title, script.logline).join(" ");
  if (!combined) return "Urdu generation returned no audience-facing text.";
  if (containsUrduScript(combined)) return null;
  if (LATIN_LETTER.test(combined)) {
    return "Urdu generation returned Roman Urdu or English-only audience text. Please regenerate in Urdu script.";
  }
  return "Urdu generation did not include readable Urdu-script audience text. Please regenerate.";
}

export function isCurrentVideoScriptLanguage(scriptLanguage: VideoLanguage | undefined, selectedLanguage: VideoLanguage): boolean {
  return !scriptLanguage || scriptLanguage === selectedLanguage;
}
