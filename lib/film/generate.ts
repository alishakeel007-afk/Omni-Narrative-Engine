import type {
  SceneJob,
  StudioScene,
  StudioState,
  StudioTake,
  TimelineClip,
} from "@/types/studio";
import { characterReferences, continuityProblem } from "@/lib/studio/identity";
import {
  clipSeconds as resolveClipSeconds,
  clipCapability,
  clipLengthProblem,
  type ClipCapability,
} from "./duration";
import { generationBlockedReason } from "./language";
import { clipProblem } from "./shots";

/**
 * Step 3 as a pure function of the project and its job queue.
 *
 * One authored scene becomes ONE generated video. A scene with beats is still
 * one video with cuts inside it, which the editor can split later — there is no
 * derivation of scenes into separate shot records, because that would turn one
 * source file into several and break exactly the thing the beats are for.
 *
 * On the Urdu lip-sync path a clip carries one speaking turn, so a scene with
 * more than one line is refused at authoring time rather than silently split.
 */

export const MAX_FILM_CLIPS = 24;
export const MAX_FILM_SECONDS = 180;

const ACTIVE_JOB = ["queued", "waiting", "running"];

export type SceneStatus =
  | "review"
  /** Generated, selected and current. */
  | "ready"
  /** A job is queued or running for it. */
  | "working"
  /** The job stopped and needs the user. */
  | "failed"
  /** Generated, but the scene changed since. */
  | "stale"
  /** Cannot be generated yet, with a reason. */
  | "blocked"
  /** Can be generated now. */
  | "pending";

export type SceneGeneration = {
  scene: StudioScene;
  index: number;
  status: SceneStatus;
  /** Why it is blocked or failed, phrased as something the user can act on. */
  problem?: string;
  /** The selected completed video, if there is one. */
  take?: StudioTake;
  /** Every completed video for this scene, newest last. */
  takes: StudioTake[];
  job?: SceneJob;
  /** Length this scene will be asked for. */
  requestedSeconds: number;
  /** Measured length of the selected take, once it exists. */
  measuredSeconds?: number;
};

function castProblem(state: StudioState, scene: StudioScene) {
  const cast = state.characters.filter((character) =>
    scene.characterIds.includes(character.id),
  );
  if (cast.length !== scene.characterIds.length)
    return "A character in this scene no longer exists. Fix the cast in Script & Characters.";
  const unready = cast.filter(
    (character) => !character.locked || !characterReferences(character).length,
  );
  if (unready.length)
    return `${unready
      .map((character) => character.name)
      .join(", ")} ${unready.length > 1 ? "need" : "needs"} a reference view and a lock before this scene can be generated.`;
  return null;
}

export function sceneGeneration(
  state: StudioState,
  scene: StudioScene,
  index: number,
  jobs: SceneJob[],
  /**
   * What the deployment allows. Pass the value the API reported: in the browser
   * this module can only see the validated default, so computing it locally
   * would under-report a project configured for longer clips.
   */
  capability: ClipCapability = clipCapability(),
): SceneGeneration {
  const language = state.language ?? "en";
  const requestedSeconds = scene.requestedSeconds ?? state.clipSeconds ?? capability.defaultSeconds;
  const takes = scene.takes.filter(
    (take) => take.kind === "video" && take.status === "complete" && take.url,
  );
  const selected = takes.find((take) => take.id === scene.selectedVideoId);
  const mine = jobs.filter((job) => job.sceneId === scene.id && job.kind !== "chat");
  const job =
    mine.find((item) => ACTIVE_JOB.includes(item.status)) ??
    mine.find((item) => item.status !== "complete") ??
    mine[0];
  const base = { scene, index, takes, job, requestedSeconds };

  if (job && ACTIVE_JOB.includes(job.status))
    return { ...base, status: "working" };

  // A stopped job is reported before anything else: the user has to decide
  // whether to retry it, and a stale notice would hide that.
  if (job && !["complete", "cancelled"].includes(job.status))
    return {
      ...base,
      status: "failed",
      problem: job.error || "This generation stopped. Retry it, or change the scene and try again.",
      take: selected,
      measuredSeconds: selected?.duration,
    };

  const problem =
    // Language first: if this project cannot be generated at all, saying so is
    // more useful than listing what a scene is missing.
    generationBlockedReason(language) ??
    clipLengthProblem(scene.requestedSeconds ?? state.clipSeconds, capability) ??
    castProblem(state, scene) ??
    clipProblem({ scene, language, clipSeconds: resolveClipSeconds(requestedSeconds, capability) });
  if (problem) return { ...base, status: "blocked", problem, take: selected };

  if (!selected) return takes.length ? { ...base, status: "review", take: takes.at(-1),
    problem: "Review the finished take and choose Use take. Generating again creates a new paid take." } : { ...base, status: "pending" };
  // `stale` is set when the take's recorded requirements stopped matching the
  // scene, so an edit elsewhere never silently invalidates this one.
  if (selected.stale || scene.outdated || continuityProblem(state, scene, selected))
    return {
      ...base,
      status: "stale",
      take: selected,
      measuredSeconds: selected.duration,
      problem: "This scene changed after its video was made. Generate it again, or keep this take as it is.",
    };
  return { ...base, status: "ready", take: selected, measuredSeconds: selected.duration };
}

export type FilmGeneration = {
  scenes: SceneGeneration[];
  /** Scenes that could be generated right now. */
  pending: SceneGeneration[];
  working: number;
  blocked: number;
  failed: number;
  stale: number;
  /** Every scene has a current, selected, completed video. */
  complete: boolean;
  /**
   * Total MEASURED length of the selected takes. Only complete scenes count,
   * so this is a real number rather than a projection.
   */
  measuredSeconds: number;
  /** Total length the project is asking for, including ungenerated scenes. */
  requestedSeconds: number;
  /** Why assembling is not possible yet. */
  problem?: string;
};

export function filmGeneration(
  state: StudioState,
  jobs: SceneJob[],
  capability: ClipCapability = clipCapability(),
): FilmGeneration {
  const scenes = state.scenes.map((scene, index) =>
    sceneGeneration(state, scene, index, jobs, capability),
  );
  const counted = (status: SceneStatus) => scenes.filter((item) => item.status === status).length;
  const measuredSeconds = scenes.reduce((total, item) => total + (item.measuredSeconds ?? 0), 0);
  const requestedSeconds = scenes.reduce((total, item) => total + item.requestedSeconds, 0);
  const complete = scenes.length > 0 && scenes.every((item) => item.status === "ready");

  let problem: string | undefined;
  if (!scenes.length) problem = "There are no scenes yet. Build the script first.";
  else if (!complete) {
    const unfinished = scenes.filter((item) => item.status !== "ready");
    problem = `${unfinished.length} scene${unfinished.length > 1 ? "s" : ""} still ${
      unfinished.length > 1 ? "need" : "needs"
    } a finished video: ${unfinished.map((item) => item.scene.title).join(", ")}.`;
  } else if (scenes.length > MAX_FILM_CLIPS)
    problem = `A story can hold ${MAX_FILM_CLIPS} clips and this has ${scenes.length}. Remove a scene in Script & Characters.`;
  else if (measuredSeconds > MAX_FILM_SECONDS)
    problem = `These clips run ${measuredSeconds.toFixed(1)}s in total, over the ${MAX_FILM_SECONDS}s a story can export. Shorten or remove a scene before assembling.`;

  return {
    scenes,
    pending: scenes.filter((item) => item.status === "pending"),
    working: counted("working"),
    blocked: counted("blocked"),
    failed: counted("failed"),
    stale: counted("stale"),
    complete,
    measuredSeconds,
    requestedSeconds,
    problem,
  };
}

/**
 * The timeline Step 4 starts from: one clip per scene, in scene order, each
 * spanning its whole source take.
 *
 * `sourceOut` is the take's MEASURED duration, never the requested length — a
 * clip that claims time the file does not have fails at export.
 */
export function assembleClips(state: StudioState): TimelineClip[] {
  return state.scenes.flatMap((scene) => {
    const take = scene.takes.find(
      (item) =>
        item.id === scene.selectedVideoId && item.status === "complete" && item.url,
    );
    if (!take?.duration) return [];
    return [
      {
        id: `clip-${scene.id}`,
        sceneId: scene.id,
        sourceTakeId: take.id,
        sourceIn: 0,
        sourceOut: take.duration,
        // The clip's own baked soundtrack. Not a dialogue-only control.
        clipVolume: take.nativeAudio ? 1 : 0,
      },
    ];
  });
}
