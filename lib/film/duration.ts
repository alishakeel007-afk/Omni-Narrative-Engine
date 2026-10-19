/**
 * The one place clip length is decided.
 *
 * Every other module asks this module rather than carrying its own constant,
 * because the numbers below are properties of the pinned Modal pipeline and
 * drift between copies is how a request ends up rejected at the worker.
 *
 * The transformer accepts frame counts on an `8k+1` grid at a fixed 24 fps, so
 * seconds are never authoritative: a requested length is snapped to the grid
 * and the resulting frame count is what the worker is actually asked for.
 */
export const FILM_FPS = 24;

/** The transformer's frame grid: a valid count is `FRAME_STEP * k + 1`. */
export const FRAME_STEP = 8;

/** The shortest clip the worker accepts. */
export const MIN_FRAMES = 33;

/**
 * The only text/image clip length validated end to end on the pinned pipeline
 * (`service.py` rejects more than this unless the worker is reconfigured).
 * 121 frames at 24 fps is just over five seconds.
 */
export const VALIDATED_MAX_FRAMES = 121;

/**
 * The longest clip the request shape can express — 20 seconds. Reaching it
 * needs BOTH this app configured for it and the worker's own
 * `LTX_MAX_VIDEO_FRAMES` raised to match, and it is untested on our pinned
 * pipeline. See `clipCapability()`.
 */
export const EXTENDED_MAX_FRAMES = 481;

/**
 * Audio-conditioned (Urdu lip-sync) clips take their length from the supplied
 * speech, bounded separately by the worker's `LTX_MAX_AUDIO_SECONDS`. This path
 * is paused pending validation; the constant mirrors the worker so the app can
 * reject over-long speech before paying for a GPU start.
 */
export const AUDIO_MAX_FRAMES = 241;

/** Frames covering `seconds`, snapped up onto the grid and clamped. */
export function snapFrames(seconds: number, maxFrames: number) {
  const target = Math.max(1, Math.round(seconds * FILM_FPS));
  const snapped = Math.ceil((target - 1) / FRAME_STEP) * FRAME_STEP + 1;
  return Math.min(Math.max(snapped, MIN_FRAMES), onGrid(maxFrames));
}

/** The largest valid grid value at or below `frames`. */
export function onGrid(frames: number) {
  return Math.max(MIN_FRAMES, Math.floor((frames - 1) / FRAME_STEP) * FRAME_STEP + 1);
}

export function framesToSeconds(frames: number) {
  return frames / FILM_FPS;
}

/** The four lengths the product offers, in seconds as the user sees them. */
export const CLIP_CHOICES = [5, 10, 15, 20] as const;

export type ClipChoice = {
  /** The label, e.g. 5 for "5s". */
  seconds: number;
  /** What the worker is actually asked for, on the frame grid. */
  frames: number;
  /** The real length that produces, which differs slightly from `seconds`. */
  actualSeconds: number;
  /** Whether this length can be requested on this deployment. */
  available: boolean;
  /** Why not, when unavailable. */
  reason?: string;
};

export type ClipCapability = {
  /** Frames the app will ask the worker for at most. */
  maxFrames: number;
  /** `maxFrames` expressed in seconds, for display only. */
  maxSeconds: number;
  minFrames: number;
  minSeconds: number;
  /** True once any length beyond the validated one is enabled. */
  extended: boolean;
  /** All four choices, with availability. Unavailable ones stay visible. */
  choices: ClipChoice[];
  /** Just the requestable lengths, shortest first. */
  options: number[];
  /** The length used when a project does not name one. */
  defaultSeconds: number;
};

/**
 * Which clip lengths this deployment may request.
 *
 * Each length is enabled individually through `STUDIO_CLIP_SECONDS` (a list,
 * e.g. "5,10"), so a length goes live as it passes testing rather than all of
 * them flipping on together. Five seconds is always available because it is the
 * length validated end to end on the pinned pipeline.
 *
 * Raising this is not sufficient on its own: the worker's own
 * `LTX_MAX_VIDEO_FRAMES` has to allow the frame count too. A mismatch surfaces
 * as the worker's explicit rejection rather than as a silently shortened clip.
 */
export function clipCapability(): ClipCapability {
  // Read `process.env` directly rather than through `lib/env`, which reaches
  // for `fs`: this module is imported by client components, and a filesystem
  // dependency there breaks the browser bundle. In the browser the variables
  // are absent and this returns the validated default — safe, and not relied
  // on, because the UI is handed the authoritative capability by the API.
  const configured = (process.env.STUDIO_CLIP_SECONDS || "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
  // A single cap is still honoured, so an existing deployment keeps working.
  const cap = Number(process.env.STUDIO_CLIP_MAX_SECONDS);
  const validated = framesToSeconds(VALIDATED_MAX_FRAMES);

  const choices: ClipChoice[] = CLIP_CHOICES.map((seconds) => {
    const frames = snapFrames(seconds, EXTENDED_MAX_FRAMES);
    const withinValidated = frames <= VALIDATED_MAX_FRAMES;
    const enabled =
      withinValidated ||
      configured.some((value) => Math.abs(value - seconds) < 0.01) ||
      (Number.isFinite(cap) && cap >= seconds);
    return {
      seconds,
      frames,
      actualSeconds: framesToSeconds(frames),
      available: enabled,
      ...(enabled
        ? {}
        : {
            reason: `${seconds}s clips are not validated on this pipeline yet. They become available once one has been generated and reviewed.`,
          }),
    };
  });

  const available = choices.filter((choice) => choice.available);
  const maxFrames = Math.max(...available.map((choice) => choice.frames), MIN_FRAMES);
  return {
    maxFrames,
    maxSeconds: framesToSeconds(maxFrames),
    minFrames: MIN_FRAMES,
    minSeconds: framesToSeconds(MIN_FRAMES),
    extended: maxFrames > VALIDATED_MAX_FRAMES,
    choices,
    options: available.map((choice) => choice.seconds),
    defaultSeconds: available[0]?.seconds ?? validated,
  };
}

/** Why a requested length cannot be used, or null when it can. */
export function clipLengthProblem(seconds: number | undefined, capability = clipCapability()) {
  if (seconds === undefined) return null;
  const choice = capability.choices.find((item) => Math.abs(item.seconds - seconds) < 0.01 || Math.abs(item.actualSeconds - seconds) < 0.01);
  // Names all four, because an off-list value is a different mistake from
  // choosing one that is not enabled yet.
  if (!choice)
    return `Clip length must be one of ${CLIP_CHOICES.map((value) => `${value}s`).join(", ")}.`;
  return choice.available ? null : choice.reason ?? null;
}

/**
 * The frame count for a clip, given what the project asked for.
 *
 * An unset or out-of-range request falls back to the validated length rather
 * than to the configured maximum: a project saved while long clips were enabled
 * must not keep requesting them after they are switched back off.
 */
export function clipFrames(requestedSeconds: number | undefined, capability = clipCapability()) {
  if (!requestedSeconds || !Number.isFinite(requestedSeconds))
    return Math.min(VALIDATED_MAX_FRAMES, capability.maxFrames);
  return snapFrames(requestedSeconds, capability.maxFrames);
}

/** The length a clip request will actually produce, in seconds. */
export function clipSeconds(requestedSeconds: number | undefined, capability = clipCapability()) {
  return framesToSeconds(clipFrames(requestedSeconds, capability));
}

/**
 * How long a generation may plausibly hold a project's operation lock.
 *
 * This was a flat four minutes while every clip was five seconds. Longer clips
 * do proportionally more diffusion work, and a lock that expires mid-generation
 * lets a second writer publish over the result — so the window follows the
 * requested length instead of a constant.
 *
 * The fixed part covers a cold container start and model load; the variable
 * part scales with frames. Bounded so a misconfiguration cannot wedge a
 * project indefinitely.
 */
export function generationLockMs(requestedSeconds?: number) {
  const frames = clipFrames(requestedSeconds);
  const startupMs = 180_000;
  const perValidatedClipMs = 60_000;
  return Math.min(900_000, startupMs + Math.round((frames / VALIDATED_MAX_FRAMES) * perValidatedClipMs));
}
