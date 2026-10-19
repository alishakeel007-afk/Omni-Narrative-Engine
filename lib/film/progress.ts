import type { FilmStep, StudioState } from "@/types/studio";
import { FILM_STEPS, stepIndex } from "./steps";
import { characterReferences, continuityProblem } from "@/lib/studio/identity";
import { filmLanguage } from "./language";
import { exportSignature } from "./export-state";
import { markStaleClips } from "./edit";

/**
 * How far a project has actually come.
 *
 * Progress is derived from saved state only. Opening a step changes nothing:
 * `state.step` is where the user is, never evidence of work done. Each step
 * reports the fraction of its own requirements that are met, so the bar moves
 * when something real is saved and moves back when that work is invalidated.
 */

export type StepStatus = "done" | "current" | "blocked" | "todo";

export type StepProgress = {
  id: FilmStep;
  index: number;
  title: string;
  status: StepStatus;
  /** 0–1 for this step alone. */
  fraction: number;
  /** What this step still needs, in the user's terms. */
  remaining: string[];
  /**
   * Set when previously finished work stopped counting, with the reason. This
   * is what stops a step silently staying green after an edit undermines it.
   */
  invalidated?: string;
  /** Whether the user can usefully open it yet. */
  reachable: boolean;
};

export type FilmProgress = {
  steps: StepProgress[];
  /** 0–100, weighted across the four steps. */
  percent: number;
  current: FilmStep;
};

/** Each step's share of the whole. Generation is the bulk of the work. */
const WEIGHT: Record<FilmStep, number> = {
  setup: 0.15,
  script: 0.3,
  generate: 0.35,
  edit: 0.2,
};

function ratio(met: number, total: number) {
  return total <= 0 ? 0 : Math.min(1, Math.max(0, met / total));
}

function setupProgress(state: StudioState) {
  const remaining: string[] = [];
  const checks = [
    Boolean((state.premise ?? "").trim().length > 10 || (state.sourceScript ?? "").trim().length > 40),
  ];
  if (!checks[0]) remaining.push("Describe your idea, or paste a script");
  return { fraction: ratio(checks.filter(Boolean).length, checks.length), remaining };
}

function scriptProgress(state: StudioState) {
  const remaining: string[] = [];
  if (!state.scenes.length)
    return { fraction: 0, remaining: ["Build the script"], invalidated: undefined };

  const described = state.scenes.filter((scene) =>
    (scene.visualAction ?? scene.description ?? "").trim(),
  ).length;
  const cast = new Set(state.scenes.flatMap((scene) => scene.characterIds));
  const named = state.characters.filter((character) => cast.has(character.id));
  const ready = named.filter(
    (character) => character.locked && characterReferences(character).length,
  );

  if (described < state.scenes.length)
    remaining.push(`Describe the visual action in ${state.scenes.length - described} scene(s)`);
  if (named.length && ready.length < named.length)
    remaining.push(
      `Add a reference view and lock ${named
        .filter((character) => !ready.includes(character))
        .map((character) => character.name)
        .join(", ")}`,
    );
  if (named.length < cast.size) remaining.push("Repair the missing character in the scene cast");

  const parts = [
    ratio(described, state.scenes.length),
    // A project with no cast is valid, so an empty cast counts as satisfied.
    cast.size ? ratio(ready.length, cast.size) : 1,
  ];
  return {
    fraction: parts.reduce((total, value) => total + value, 0) / parts.length,
    remaining,
    invalidated: undefined,
  };
}

function generateProgress(state: StudioState) {
  if (!state.scenes.length) return { fraction: 0, remaining: ["Build the script first"] };
  const finished = state.scenes.filter((scene) =>
    scene.takes.some(
      (take) =>
        take.id === scene.selectedVideoId &&
        take.kind === "video" &&
        take.status === "complete" &&
        take.url &&
        !scene.outdated &&
        !continuityProblem(state, scene, take),
    ),
  );
  const stale = state.scenes.filter((scene) =>
    scene.takes.some((take) => take.id === scene.selectedVideoId && (scene.outdated || continuityProblem(state, scene, take))),
  );
  const outstanding = state.scenes.length - finished.length;
  return {
    fraction: ratio(finished.length, state.scenes.length),
    remaining: outstanding ? [`Generate ${outstanding} more scene(s)`] : [],
    invalidated: stale.length
      ? `${stale.length} scene(s) have a video that no longer matches the scene. Generate them again.`
      : undefined,
  };
}

function editProgress(state: StudioState) {
  const clips = markStaleClips(state, state.clips ?? []);
  if (!clips.length)
    return { fraction: 0, remaining: ["Assemble your finished clips"] };
  const stale = clips.filter((clip) => clip.stale);
  const exported = !stale.length && Boolean(state.exports?.some((item) => item.sourceSignature === exportSignature(state)));
  return {
    // Assembling is most of this step; the export is the last piece.
    fraction: exported ? 1 : stale.length ? 0.4 : 0.6,
    remaining: exported ? [] : ["Export the story"],
    invalidated: stale.length
      ? `${stale.length} clip(s) point at an older video. Relink them before exporting.`
      : undefined,
  };
}

export function filmProgress(state: StudioState): FilmProgress {
  const current = state.step ?? "setup";
  const computed = {
    setup: setupProgress(state),
    script: scriptProgress(state),
    generate: generateProgress(state),
    edit: editProgress(state),
  } as Record<FilmStep, { fraction: number; remaining: string[]; invalidated?: string }>;

  const steps: StepProgress[] = FILM_STEPS.map((meta, index) => {
    const result = computed[meta.id];
    const complete = result.fraction >= 1 && !result.invalidated;
    // A step is reachable when the one before it has produced what it needs,
    // so the user is never sent to a step that cannot show anything — but
    // earlier steps always stay open, so revisiting never costs work.
    const reachable =
      index === 0 || index <= stepIndex(current) ||
      (meta.id === "script" ? state.scenes.length > 0 || computed.setup.fraction === 1 :
        meta.id === "generate" ? state.scenes.length > 0 : Boolean(state.clips?.length));
    return {
      id: meta.id,
      index,
      title: meta.title,
      status: result.invalidated
        ? "blocked"
        : meta.id === current
          ? "current"
          : complete
            ? "done"
            : "todo",
      fraction: result.fraction,
      remaining: result.remaining,
      invalidated: result.invalidated,
      reachable,
    };
  });

  const percent = Math.round(
    steps.reduce((total, step) => total + step.fraction * WEIGHT[step.id], 0) * 100,
  );
  return { steps, percent, current };
}

/** A one-line summary for the compact indicator. */
export function progressSummary(progress: FilmProgress, state: StudioState) {
  const language = filmLanguage(state.language);
  const blocked = progress.steps.find((step) => step.invalidated);
  if (blocked) return blocked.invalidated as string;
  if (!language.available && state.scenes.length)
    return language.note;
  const next = progress.steps.find((step) => step.remaining.length);
  return next?.remaining[0] ?? "Your story is finished and exported.";
}
