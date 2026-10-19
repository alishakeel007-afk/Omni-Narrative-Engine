import {
  MAX_EDIT_HISTORY,
  MIN_CLIP_SECONDS,
  type EditSnapshot,
  type StudioScene,
  type StudioState,
  type StudioTake,
  type StudioTextOverlay,
  type TimelineClip,
} from "@/types/studio";
import { continuityProblem } from "@/lib/studio/identity";
import { MAX_FILM_CLIPS, MAX_FILM_SECONDS } from "./generate";

/**
 * Step 4 as pure functions over a clip list.
 *
 * A clip is an INSTANCE of a source take, not a scene. Splitting produces two
 * instances sharing one source with adjacent ranges, which is why the timeline
 * is a list of instances rather than a list of scene ids — the same source can
 * legitimately appear several times.
 *
 * Nothing here repoints a clip at a different take. A new take makes existing
 * clips stale; `relinkClips` moves them, and only when the user asks.
 */

export type ClipSource = {
  take: StudioTake;
  scene: StudioScene;
  /** Measured length of the file. Trims are clamped to this, never to a guess. */
  duration: number;
};

/** The take a clip is currently built from, by id — not the selected one. */
export function clipSource(state: StudioState, clip: TimelineClip): ClipSource | null {
  const scene = state.scenes.find((item) => item.id === clip.sceneId);
  const take = scene?.takes.find((item) => item.id === clip.sourceTakeId);
  if (!scene || !take?.url || take.status !== "complete" || !take.duration) return null;
  return { take, scene, duration: take.duration };
}

export function clipLength(clip: TimelineClip) {
  return Math.max(0, clip.sourceOut - clip.sourceIn);
}

export function filmDuration(clips: TimelineClip[]) {
  return clips.reduce((total, clip) => total + clipLength(clip), 0);
}

/** Where a clip sits on the film's own clock. */
export function clipSpans(clips: TimelineClip[]) {
  let cursor = 0;
  return clips.map((clip) => {
    const start = cursor;
    cursor += clipLength(clip);
    return { clip, start, end: cursor };
  });
}

/**
 * Film time to a position inside a source file.
 *
 * Speech is baked into the clip, so seeking is a single conversion with no
 * separate audio track to offset.
 */
export function seek(clips: TimelineClip[], filmSeconds: number) {
  const spans = clipSpans(clips);
  const found =
    spans.find((span) => filmSeconds >= span.start && filmSeconds < span.end) ??
    spans[spans.length - 1];
  if (!found) return null;
  const offset = Math.min(Math.max(filmSeconds - found.start, 0), clipLength(found.clip));
  return {
    index: spans.indexOf(found),
    clip: found.clip,
    sourceSeconds: found.clip.sourceIn + offset,
    offset,
  };
}

function uniqueId(clips: TimelineClip[], base: string) {
  let candidate = base;
  let counter = 2;
  const taken = new Set(clips.map((clip) => clip.id));
  while (taken.has(candidate)) candidate = `${base}-${counter++}`;
  return candidate;
}

export type EditResult = { clips: TimelineClip[] } | { problem: string };

/**
 * Overlay timing is relative to the clip it sits on.
 *
 * `exporter.py` renders each clip with `trim=...,setpts=PTS-STARTPTS` and then
 * `drawtext ... enable='between(t,start,end)'`, so `t` restarts at zero for
 * every clip. An `end` of 0 means "until this clip ends", which is the
 * exporter's own `text.end or duration`.
 */
function overlayEnd(text: StudioTextOverlay) {
  return text.end ? text.end : Number.POSITIVE_INFINITY;
}

/**
 * Splits overlays across a cut.
 *
 * Each overlay belongs to the half (or halves) it actually covers — copying the
 * whole list to both would show every caption twice. An overlay spanning the
 * cut legitimately appears in both, clamped on each side, so it still reads as
 * one continuous caption.
 */
export function distributeOverlays(
  texts: StudioTextOverlay[] | undefined,
  firstDuration: number,
): { first?: StudioTextOverlay[]; second?: StudioTextOverlay[] } {
  if (!texts?.length) return {};
  const first: StudioTextOverlay[] = [];
  const second: StudioTextOverlay[] = [];
  for (const text of texts) {
    const end = overlayEnd(text);
    if (text.start < firstDuration)
      first.push({
        ...text,
        // Still running at the cut means it runs to the end of this half.
        end: end >= firstDuration ? 0 : text.end,
      });
    if (end > firstDuration)
      second.push({
        ...text,
        start: Math.max(0, text.start - firstDuration),
        end: text.end ? Math.max(0, text.end - firstDuration) : 0,
      });
  }
  return {
    ...(first.length ? { first } : {}),
    ...(second.length ? { second } : {}),
  };
}

/**
 * Trim one clip, clamped to its source file.
 *
 * A range the file cannot honour is refused rather than quietly shortened: the
 * exporter rejects it anyway, and finding out at export is worse.
 */
export function trimClip(
  state: StudioState,
  clips: TimelineClip[],
  clipId: string,
  range: { sourceIn?: number; sourceOut?: number },
): EditResult {
  const clip = clips.find((item) => item.id === clipId);
  if (!clip) return { problem: "That clip is no longer on the timeline." };
  const source = clipSource(state, clip);
  if (!source) return { problem: "This clip's source video is unavailable." };
  const sourceIn = Math.max(0, range.sourceIn ?? clip.sourceIn);
  const sourceOut = Math.min(source.duration, range.sourceOut ?? clip.sourceOut);
  if (sourceOut - sourceIn < MIN_CLIP_SECONDS)
    return {
      problem: `A clip has to be at least ${MIN_CLIP_SECONDS}s long. Drag the other edge instead.`,
    };
  return {
    clips: clips.map((item) => (item.id === clipId ? { ...item, sourceIn, sourceOut } : item)),
  };
}

/**
 * Split one clip at a point on the film clock.
 *
 * Both halves keep the same source, volumes, fades and overlays: a split is a
 * cut, not a reset. The fade-out moves to the second half and the fade-in stays
 * on the first, so the pair still behaves like the clip it came from.
 */
export function splitClip(
  state: StudioState,
  clips: TimelineClip[],
  clipId: string,
  filmSeconds: number,
): EditResult {
  if (clips.length >= MAX_FILM_CLIPS)
    return { problem: `A story can hold ${MAX_FILM_CLIPS} clips. Delete one before splitting another.` };
  const index = clips.findIndex((item) => item.id === clipId);
  if (index < 0) return { problem: "That clip is no longer on the timeline." };
  const clip = clips[index];
  const spans = clipSpans(clips);
  const at = filmSeconds - spans[index].start + clip.sourceIn;
  if (at - clip.sourceIn < MIN_CLIP_SECONDS || clip.sourceOut - at < MIN_CLIP_SECONDS)
    return {
      problem: `Both halves have to be at least ${MIN_CLIP_SECONDS}s. Move the playhead further into the clip.`,
    };
  // Overlays are redistributed by the time they cover, not copied wholesale.
  const overlays = distributeOverlays(clip.texts, at - clip.sourceIn);
  const first: TimelineClip = { ...clip, sourceOut: at };
  delete first.fadeOut;
  delete first.texts;
  if (overlays.first) first.texts = overlays.first;
  const second: TimelineClip = {
    ...clip,
    id: uniqueId(clips, `${clip.id}-b`),
    sourceIn: at,
  };
  delete second.fadeIn;
  delete second.texts;
  if (overlays.second) second.texts = overlays.second;
  return { clips: [...clips.slice(0, index), first, second, ...clips.slice(index + 1)] };
}

export function deleteClip(clips: TimelineClip[], clipId: string): EditResult {
  if (!clips.some((item) => item.id === clipId))
    return { problem: "That clip is no longer on the timeline." };
  // Deleting an instance never touches the source take, so the scene can be
  // placed again later.
  return { clips: clips.filter((item) => item.id !== clipId) };
}

export function moveClip(clips: TimelineClip[], clipId: string, toIndex: number): EditResult {
  const from = clips.findIndex((item) => item.id === clipId);
  if (from < 0) return { problem: "That clip is no longer on the timeline." };
  const target = Math.min(Math.max(toIndex, 0), clips.length - 1);
  if (target === from) return { clips };
  const next = [...clips];
  const [moved] = next.splice(from, 1);
  next.splice(target, 0, moved);
  return { clips: next };
}

export function patchClip(
  clips: TimelineClip[],
  clipId: string,
  patch: Partial<Pick<TimelineClip, "clipVolume" | "musicVolume" | "fadeIn" | "fadeOut" | "texts">>,
): EditResult {
  const clip = clips.find((item) => item.id === clipId);
  if (!clip) return { problem: "That clip is no longer on the timeline." };
  const length = clipLength(clip);
  const next = { ...clip, ...patch };
  // A fade longer than the clip would mean a clip that never reaches full
  // level; clamp rather than refuse, since the intent is unambiguous.
  if (next.fadeIn !== undefined) next.fadeIn = Math.min(next.fadeIn, length);
  if (next.fadeOut !== undefined) next.fadeOut = Math.min(next.fadeOut, length);
  return { clips: clips.map((item) => (item.id === clipId ? next : item)) };
}

/**
 * Marks clips stale when their source is no longer the scene's current take.
 *
 * This is what preserves edits across regeneration: a new take does not move,
 * reset or delete anything. The clip keeps pointing at the take it was built
 * from, and says it needs attention.
 */
export function markStaleClips(state: StudioState, clips: TimelineClip[]): TimelineClip[] {
  return clips.map((clip) => {
    const scene = state.scenes.find((item) => item.id === clip.sceneId);
    const source = scene?.takes.find((item) => item.id === clip.sourceTakeId);
    const current =
      !!scene &&
      scene.selectedVideoId === clip.sourceTakeId &&
      !!source &&
      source.status === "complete" &&
      !scene.outdated && !continuityProblem(state, scene, source);
    if (current) {
      if (!clip.stale) return clip;
      const { stale, ...rest } = clip;
      void stale;
      return rest;
    }
    return clip.stale ? clip : { ...clip, stale: true };
  });
}

export type RelinkOutcome = {
  clips: TimelineClip[];
  /** Per-clip notes about what relinking had to change. */
  notes: string[];
  relinked: number;
  /** Clips whose scene no longer has any usable take. */
  orphaned: string[];
};

/**
 * Moves stale clips onto their scene's current take. Explicit, never automatic.
 *
 * Order, splits, volumes, fades and overlays are preserved. A trim that no
 * longer fits the new file is clamped and reported per clip, rather than the
 * clip being dropped — the user decides whether to remove it.
 */
export function relinkClips(state: StudioState, clips: TimelineClip[]): RelinkOutcome {
  const notes: string[] = [];
  const orphaned: string[] = [];
  let relinked = 0;
  const next = clips.map((clip) => {
    if (!clip.stale) return clip;
    const scene = state.scenes.find((item) => item.id === clip.sceneId);
    const take = scene?.takes.find(
      (item) =>
        item.id === scene.selectedVideoId &&
        item.status === "complete" &&
        item.url &&
        item.duration,
    );
    if (!scene || !take?.duration) {
      orphaned.push(clip.id);
      notes.push(
        `${scene?.title ?? "A removed scene"} has no finished video to relink to. Generate it again, or remove its clips.`,
      );
      return clip;
    }
    if (take.duration < MIN_CLIP_SECONDS) {
      orphaned.push(clip.id);
      notes.push(
        `${scene.title}: the new video is only ${take.duration.toFixed(2)}s, shorter than the ${MIN_CLIP_SECONDS}s a clip needs. Remove the clip, or generate the scene again.`,
      );
      return clip;
    }
    let sourceIn = Math.min(clip.sourceIn, take.duration);
    let sourceOut = Math.min(clip.sourceOut, take.duration);
    if (sourceOut - sourceIn < MIN_CLIP_SECONDS) {
      // The old range sits past the end of the new file. Sliding the start
      // forward would change WHICH part plays, not just its length, so the
      // clip takes the whole new video and the reset is reported.
      sourceIn = 0;
      sourceOut = take.duration;
      notes.push(
        `${scene.title}: the trim was past the end of the new ${take.duration.toFixed(1)}s video, so this clip now uses all of it. Re-trim it if you wanted a different part.`,
      );
    } else if (sourceOut < clip.sourceOut)
      notes.push(
        `${scene.title}: trimmed to ${(sourceOut - sourceIn).toFixed(1)}s to fit the new ${take.duration.toFixed(1)}s video.`,
      );
    relinked += 1;
    const { stale, ...rest } = clip;
    void stale;
    return { ...rest, sourceTakeId: take.id, sourceIn, sourceOut };
  });
  return { clips: next, notes, relinked, orphaned };
}

/** Why this timeline cannot be exported yet. */
export function exportProblem(state: StudioState, clips: TimelineClip[]): string | null {
  if (!clips.length) return "There are no clips to export.";
  if (clips.length > MAX_FILM_CLIPS)
    return `A story can hold ${MAX_FILM_CLIPS} clips and this has ${clips.length}. Delete some before exporting.`;
  const stale = clips.filter((clip) => clip.stale);
  if (stale.length) {
    const titles = [
      ...new Set(
        stale.map(
          (clip) => state.scenes.find((item) => item.id === clip.sceneId)?.title ?? "a removed scene",
        ),
      ),
    ];
    return `${stale.length} clip${stale.length > 1 ? "s" : ""} still point at an older video (${titles.join(
      ", ",
    )}). Relink them first, so the export uses what you can see.`;
  }
  for (const clip of clips) {
    const source = clipSource(state, clip);
    if (!source)
      return `A clip's source video is unavailable (${
        state.scenes.find((item) => item.id === clip.sceneId)?.title ?? "removed scene"
      }). Relink or remove it.`;
    if (clip.sourceOut > source.duration + 0.05)
      return `A clip claims ${clip.sourceOut.toFixed(1)}s of a ${source.duration.toFixed(
        1,
      )}s video. Relink it to fix the trim.`;
  }
  const total = filmDuration(clips);
  if (total > MAX_FILM_SECONDS)
    return `This story runs ${total.toFixed(1)}s, over the ${MAX_FILM_SECONDS}s limit. Trim or delete a clip.`;
  return null;
}

/**
 * Records one undoable step.
 *
 * History holds clip lists only, so an undo never reaches back into generated
 * takes or exports — undoing an edit cannot un-generate a video.
 */
export function pushHistory(state: StudioState, clips: TimelineClip[]): StudioState {
  const past = [
    ...(state.history?.past ?? []),
    { clips: structuredClone(state.clips ?? []) } satisfies EditSnapshot,
  ].slice(-MAX_EDIT_HISTORY);
  // A new edit abandons the redo branch, as every editor does.
  return { ...state, clips, history: { past, future: [] } };
}

export function undo(state: StudioState): StudioState | { problem: string } {
  const past = state.history?.past ?? [];
  if (!past.length) return { problem: "There is nothing to undo." };
  const previous = past[past.length - 1];
  return {
    ...state,
    clips: previous.clips,
    history: {
      past: past.slice(0, -1),
      future: [
        { clips: structuredClone(state.clips ?? []) },
        ...(state.history?.future ?? []),
      ].slice(0, MAX_EDIT_HISTORY),
    },
  };
}

export function redo(state: StudioState): StudioState | { problem: string } {
  const future = state.history?.future ?? [];
  if (!future.length) return { problem: "There is nothing to redo." };
  const [next, ...rest] = future;
  return {
    ...state,
    clips: next.clips,
    history: {
      past: [
        ...(state.history?.past ?? []),
        { clips: structuredClone(state.clips ?? []) },
      ].slice(-MAX_EDIT_HISTORY),
      future: rest,
    },
  };
}

/**
 * The payload `exporter.py` renders, one entry per clip INSTANCE.
 *
 * `voices` is always empty and `voice_*` always zero: speech is baked into the
 * clip, so the same trim applies to picture and sound and no offset arithmetic
 * is needed. Music is only attached when the scene has a stored object the
 * exporter's host allowlist will accept.
 */
export function renderClips(state: StudioState, clips: TimelineClip[]) {
  return clips.map((clip) => {
    const source = clipSource(state, clip);
    if (!source) throw new Error("A clip's source video is unavailable.");
    const music =
      clip.musicVolume && source.scene.musicUrl && !source.take.nativeAudio
        ? source.scene.musicUrl
        : null;
    return {
      url: source.take.url as string,
      start: clip.sourceIn,
      end: clip.sourceOut,
      volume: clip.clipVolume,
      fade_in: clip.fadeIn || 0,
      fade_out: clip.fadeOut || 0,
      texts: clip.texts || [],
      voices: [] as string[],
      music,
      voice_delay: 0,
      voice_volume: 0,
      music_volume: music ? (clip.musicVolume as number) : 0,
    };
  });
}

/** Overlays showing at `offset` seconds into a clip, for the preview. */
export function overlaysAt(clip: TimelineClip, offset: number) {
  const length = clipLength(clip);
  return (clip.texts ?? []).filter(
    (text) => offset >= text.start && offset <= Math.min(text.end || length, length),
  );
}
