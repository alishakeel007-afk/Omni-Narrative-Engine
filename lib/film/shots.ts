import type { FilmLanguage, StudioScene } from "@/types/studio";
import { spokenDialogue } from "@/types/studio";
import { sceneSpeechFit, speechBudgetSeconds } from "./dialogue";

/** A scene may be cut into at most this many internal shots. */
export const MAX_BEATS = 8;

/**
 * Beats must address dialogue by stable id, exactly once each.
 *
 * A line assigned to two beats would be spoken twice; a line assigned to none
 * would silently vanish from the clip. Both are authoring errors worth naming
 * rather than guessing past.
 */
export function beatProblem(scene: StudioScene): string | null {
  const beats = scene.beats ?? [];
  if (!beats.length) return null;
  if (beats.length > MAX_BEATS)
    return `A scene supports up to ${MAX_BEATS} shots. Remove a shot or move the rest into another scene.`;
  if (beats.some((beat) => !beat.visualAction.trim()))
    return "Every shot needs a visual action. Describe what the camera sees, or remove the shot.";
  const spoken = new Set(
    spokenDialogue(scene)
      .map((line) => line.id)
      .filter((id): id is string => Boolean(id)),
  );
  const seen = new Set<string>();
  for (const beat of beats) {
    for (const id of beat.dialogueIds ?? []) {
      if (!spoken.has(id))
        return "A shot refers to a dialogue line that is no longer in this scene. Reassign that shot's lines.";
      if (seen.has(id))
        return "A dialogue line is assigned to two shots. Each line belongs to exactly one shot.";
      seen.add(id);
    }
  }
  const unassigned = [...spoken].filter((id) => !seen.has(id));
  if (unassigned.length)
    return `${unassigned.length} dialogue line${unassigned.length > 1 ? "s are" : " is"} not assigned to a shot. Assign every line, or delete it.`;
  return null;
}

/**
 * The single-speaking-turn rule, which belongs to the Urdu lip-sync path only.
 *
 * Urdu generation sends one synthesised speech track to an audio-conditioned
 * pipeline, which drives one mouth for the length of that track. Two turns in
 * one clip have no way to say which face moves when, so the scene has to be
 * split into shots first.
 *
 * This is NOT a constraint on English generation, where speech is produced
 * natively from the prompt and one clip can carry several speakers across its
 * cuts.
 */
export function urduShotProblem(scene: StudioScene): string | null {
  const spoken = spokenDialogue(scene);
  if (spoken.length > 1)
    return `Urdu lip-sync carries one speaking turn per clip, and "${scene.title}" has ${spoken.length}. Split it so each clip holds a single line.`;
  if (scene.beats && scene.beats.length > 1)
    return `Urdu lip-sync cannot cut inside a clip, because one supplied speech track runs across the whole take. Generate "${scene.title}" as a single continuous shot.`;
  const speakers = new Set(spoken.map((line) => line.character));
  if (speakers.size > 1)
    return `Urdu lip-sync carries one speaker per clip. Split "${scene.title}" by speaker.`;
  return null;
}

/**
 * Whether this scene can be generated as one clip of `clipSeconds`.
 *
 * Returns a message naming the scene and the measurement behind the refusal, so
 * the fix is obvious in Step 2 — never a silent truncation.
 */
export function clipProblem(input: {
  scene: StudioScene;
  language: FilmLanguage;
  clipSeconds: number;
}): string | null {
  const { scene, language, clipSeconds } = input;
  if (!((scene.visualAction ?? scene.description) || "").trim()) return "Describe this scene's visual action before generating.";
  if (language === "en" && scene.dialogues.some(line => /[\u0600-\u06ff]/u.test(line.text)))
    return "This scene contains Urdu dialogue. Urdu video and lip-sync are coming soon; keep the draft, or write English dialogue before generating in English.";
  const beats = beatProblem(scene);
  if (beats) return beats;
  if (language === "ur") {
    const urdu = urduShotProblem(scene);
    if (urdu) return urdu;
  }
  const fit = sceneSpeechFit(scene, language, clipSeconds);
  if (fit.overBudget)
    return `"${scene.title}" has about ${fit.estimatedSeconds.toFixed(1)}s of dialogue (estimated), more than the ${speechBudgetSeconds(
      clipSeconds,
    ).toFixed(1)}s that fits a ${clipSeconds.toFixed(1)}s clip. Shorten a line, split the scene, or raise the clip length.`;
  return null;
}
