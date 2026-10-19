"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Link2,
  Loader2,
  Pause,
  Play,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  clipLength,
  clipSource,
  clipSpans,
  exportProblem,
  filmDuration,
  markStaleClips,
  overlaysAt,
  seek,
} from "@/lib/film/edit";
import { DecisionFlow } from "./decision-flow";
import { FieldAssist } from "./field-assist";
import { OverlayEditor } from "./overlay-editor";
import { MAX_FILM_CLIPS, MAX_FILM_SECONDS } from "@/lib/film/generate";
import {
  MIN_CLIP_SECONDS,
  type StudioState,
  type StudioTextOverlay,
  type TimelineClip,
} from "@/types/studio";

type Operation = Record<string, unknown>;

type Props = {
  projectId: string;
  state: StudioState;
  onState: (state: StudioState) => void;
  onEdit: (operation: Operation) => Promise<boolean>;
};

/** Pixels per second at rest. Short clips still get a usable handle. */
const SCALE = 48;

export function EditStep({ projectId, state, onState, onEdit }: Props) {
  // Staleness is recomputed from the scenes on every render, so a take that
  // arrived while this was open is visible immediately — and nothing silently
  // repoints, because moving a clip's source is only ever Relink.
  const clips = useMemo(() => markStaleClips(state, state.clips ?? []), [state]);
  const spans = useMemo(() => clipSpans(clips), [clips]);
  const total = filmDuration(clips);
  const stale = clips.filter((clip) => clip.stale);
  const problem = exportProblem(state, clips);

  const [part, setPart] = useState("preview");
  const [advice, setAdvice] = useState("");
  const [filmTime, setFilmTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(clips[0]?.id ?? null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const video = useRef<HTMLVideoElement | null>(null);

  const position = seek(clips, filmTime);
  const active = position?.clip;
  const activeSource = active ? clipSource(state, active) : null;

  useEffect(() => {
    if (!clips.some((clip) => clip.id === selected)) setSelected(clips[0]?.id ?? null);
  }, [clips, selected]);

  // One playback clock: film time maps to a position inside one source file.
  // Speech is baked into the clip, so there is no second track to offset.
  useEffect(() => {
    const element = video.current;
    if (!element || !position || !activeSource) return;
    const wanted = position.sourceSeconds;
    if (Math.abs(element.currentTime - wanted) > 0.3) element.currentTime = wanted;
  }, [position, activeSource]);

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (playing) void element.play().catch(() => setPlaying(false));
    else element.pause();
  }, [playing, active?.sourceTakeId]);

  const run = useCallback(
    async (operation: Operation, key = "edit") => {
      setBusy(key);
      setError("");
      const ok = await onEdit(operation);
      if (!ok) setError("That edit was not saved. Nothing changed.");
      setBusy("");
      return ok;
    },
    [onEdit],
  );

  if (!clips.length) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--muted)]">
          Nothing on the timeline yet. Go back to Generate Video and assemble
          your finished scenes.
        </p>
        <Exports state={state} />
      </div>
    );
  }

  return (
    <DecisionFlow storageKey={`story:${projectId}:edit`} pages={[
        { id: "preview", title: "Watch your story", description: "Play through your scenes. Next, we’ll trim and arrange the clips.", content: null },
        { id: "arrange", title: "Trim and arrange", description: "Choose a clip, drag its edges, split it, or move it earlier or later.", content: null },
        { id: "text", title: "Add on-screen text", description: "Add titles and captions to one selected clip at a time.", optional: true, content: null },
        { id: "audio", title: "Set the sound", description: "Adjust the selected clip’s soundtrack level.", optional: true, content: null },
        { id: "export", title: "Download your story", description: "Review the export checks, then create your merged MP4.", content: null },
      ]} onPageChange={setPart}>
      <div className="space-y-6">
      {stale.length ? (
        <div className="rounded-xl border border-[var(--ink)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--ink)]">
            {stale.length} clip{stale.length > 1 ? "s" : ""} point at an older
            video
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            Your trims, order and volumes are kept exactly as they are. Relink
            moves them onto the current video — nothing is replaced until you
            ask.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run({ kind: "relink" }, "relink")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:opacity-50"
            >
              {busy === "relink" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Link2 className="h-3.5 w-3.5" aria-hidden />
              )}
              Relink to the current video
            </button>
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void run({ kind: "removeStale" }, "removeStale")}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-4 py-2 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove those clips
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-medium text-[var(--ink)]"
        >
          {error}
        </p>
      ) : null}

      <div hidden={part === "export"}>
        {activeSource ? (
          <div className="relative aspect-video" style={{ containerType: "size" }}>
            <video
            ref={video}
            key={active?.sourceTakeId}
            src={activeSource.take.url}
            playsInline
            onTimeUpdate={(event) => {
              if (!position || !active) return;
              const at = event.currentTarget.currentTime;
              if (at >= active.sourceOut - 0.05) {
                const span = spans[position.index];
                const nextStart = span.end;
                if (nextStart >= total - 0.05) {
                  setPlaying(false);
                  setFilmTime(total);
                } else setFilmTime(nextStart + 0.01);
                return;
              }
              setFilmTime(spans[position.index].start + (at - active.sourceIn));
            }}
            className="h-full w-full rounded-xl border border-[var(--line)] bg-black/[0.02] object-contain"
          />
            {/* The same timing the exporter uses: seconds into THIS clip. */}
            {active && position
              ? overlaysAt(active, position.offset).map((text, index) => (
                  <span
                    key={index}
                    aria-hidden
                    style={{
                      left: `${text.x * 100}%`,
                      top: `${text.y * 100}%`,
                      color: text.color,
                      // The exporter sizes text in pixels of a 576-high frame,
                      // so the preview scales by the same proportion.
                      fontSize: `${(text.size / 576) * 100}cqh`,
                      transform: `translate(-${text.x * 100}%, -${text.y * 100}%)`,
                      textShadow:
                        "0 0 2px #000, 0 0 2px #000, 0 0 2px #000, 0 0 2px #000",
                    }}
                    className="pointer-events-none absolute max-w-[92%] whitespace-pre-wrap text-center font-semibold leading-tight"
                  >
                    {text.text}
                  </span>
                ))
              : null}
          </div>
        ) : (
          <p className="rounded-xl border border-[var(--line)] px-4 py-6 text-center text-sm text-[var(--muted)]">
            This clip&apos;s source video is unavailable. Relink or remove it.
          </p>
        )}

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? "Pause" : "Play"}
            className="rounded-full bg-[var(--accent)] p-2.5 text-[var(--ink)] transition hover:opacity-90"
          >
            {playing ? (
              <Pause className="h-4 w-4" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(total, 0.1)}
            step={0.05}
            value={Math.min(filmTime, total)}
            onChange={(event) => setFilmTime(Number(event.target.value))}
            aria-label="Story position"
            className="h-1.5 flex-1 accent-[var(--ink)]"
          />
          <span className="w-24 text-right text-xs tabular-nums text-[var(--muted)]">
            {filmTime.toFixed(1)}s / {total.toFixed(1)}s
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!state.history?.past?.length || Boolean(busy)}
          onClick={() => void run({ kind: "undo" }, "undo")}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-40"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          Undo
        </button>
        <button
          type="button"
          disabled={!state.history?.future?.length || Boolean(busy)}
          onClick={() => void run({ kind: "redo" }, "redo")}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-40"
        >
          <Redo2 className="h-3.5 w-3.5" aria-hidden />
          Redo
        </button>
        <span className="flex-1" />
        <span className="text-xs text-[var(--muted)]">
          {clips.length} of {MAX_FILM_CLIPS} clips · {total.toFixed(1)}s of{" "}
          {MAX_FILM_SECONDS}s
        </span>
      </div>

      <ol className="space-y-2" hidden={part === "preview" || part === "export"}>
        {spans.map(({ clip, start }, index) => (
          <ClipStrip
            key={clip.id}
            state={state}
            projectId={projectId}
            part={part}
            clip={clip}
            index={index}
            count={clips.length}
            start={start}
            selected={selected === clip.id}
            playhead={active?.id === clip.id ? filmTime - start : null}
            busy={busy}
            onFocus={() => {
              setSelected(clip.id);
              setFilmTime(start);
            }}
            onRun={run}
            onSeekWithin={(offset) => setFilmTime(start + offset)}
          />
        ))}
      </ol>

      {part === "preview" || part === "arrange" ? <FieldAssist projectId={projectId} state={state} field="editAdvice" label="suggest editing improvements" value={advice} onAccept={setAdvice} /> : null}
      {advice && part !== "export" ? <p className="film-help">{advice}</p> : null}
      <div hidden={part !== "export"}>
      <Export
        projectId={projectId}
        state={state}
        problem={problem}
        onState={onState}
      />
      <Exports state={state} />
      </div>
    </div>
    </DecisionFlow>
  );
}

function ClipStrip({
  state,
  projectId,
  part,
  clip,
  index,
  count,
  start,
  selected,
  playhead,
  busy,
  onFocus,
  onRun,
  onSeekWithin,
}: {
  state: StudioState;
  projectId: string;
  part: string;
  clip: TimelineClip;
  index: number;
  count: number;
  start: number;
  selected: boolean;
  playhead: number | null;
  busy: string;
  onFocus: () => void;
  onRun: (operation: Operation, key?: string) => Promise<boolean>;
  onSeekWithin: (offset: number) => void;
}) {
  const source = clipSource(state, clip);
  const scene = state.scenes.find((item) => item.id === clip.sceneId);
  const length = clipLength(clip);
  const width = Math.max(72, length * SCALE);
  const [drag, setDrag] = useState<{ edge: "in" | "out"; value: number } | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);

  const sourceIn = drag?.edge === "in" ? drag.value : clip.sourceIn;
  const sourceOut = drag?.edge === "out" ? drag.value : clip.sourceOut;

  const onDrag = (edge: "in" | "out") => (event: React.PointerEvent) => {
    if (!source) return;
    event.preventDefault();
    const element = event.currentTarget as HTMLElement;
    element.setPointerCapture(event.pointerId);
    const originX = event.clientX;
    const originIn = clip.sourceIn;
    const originOut = clip.sourceOut;

    const move = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - originX) / SCALE;
      if (edge === "in")
        setDrag({
          edge,
          value: Math.min(
            Math.max(0, originIn + delta),
            originOut - MIN_CLIP_SECONDS,
          ),
        });
      else
        setDrag({
          edge,
          value: Math.max(
            Math.min(source.duration, originOut + delta),
            originIn + MIN_CLIP_SECONDS,
          ),
        });
    };
    const up = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", up);
      setDrag((current) => {
        if (current)
          void onRun(
            { kind: "trim", clipId: clip.id, [current.edge === "in" ? "sourceIn" : "sourceOut"]: current.value },
            `trim-${clip.id}`,
          );
        return null;
      });
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", up);
  };

  return (
    <li>
      <div
        className={`rounded-2xl border p-3 ${
          clip.stale
            ? "border-[var(--ink)]"
            : selected
              ? "border-[var(--accent)]"
              : "border-[var(--line)]"
        }`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <button
            type="button"
            onClick={onFocus}
            className="text-left text-xs font-medium uppercase tracking-wide text-[var(--muted)] transition hover:text-[var(--ink)]"
          >
            Clip {index + 1} · {scene?.title ?? "Removed scene"} ·{" "}
            {length.toFixed(1)}s
            {clip.stale ? " · older video" : ""}
          </button>
          <span className="text-xs tabular-nums text-[var(--muted)]">
            starts {start.toFixed(1)}s
          </span>
        </div>

        <div className="mt-2 overflow-x-auto" hidden={part !== "arrange"}>
          <div
            ref={strip}
            style={{ width }}
            onClick={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              onSeekWithin(((event.clientX - box.left) / box.width) * length);
            }}
            className="relative h-16 cursor-pointer rounded-lg border border-[var(--line)] bg-black/[0.04]"
          >
            {source ? (
              <Thumbnail url={source.take.url as string} at={clip.sourceIn} />
            ) : null}
            {playhead !== null && length > 0 ? (
              <span
                aria-hidden
                style={{ left: `${Math.min(Math.max(playhead / length, 0), 1) * 100}%` }}
                className="absolute top-0 h-full w-0.5 bg-[var(--ink)]"
              />
            ) : null}
            <button
              type="button"
              aria-label={`Trim the start of clip ${index + 1}`}
              onPointerDown={onDrag("in")}
              className="absolute left-0 top-0 h-full w-3 cursor-ew-resize rounded-l-lg bg-[var(--ink)]/70"
            />
            <button
              type="button"
              aria-label={`Trim the end of clip ${index + 1}`}
              onPointerDown={onDrag("out")}
              className="absolute right-0 top-0 h-full w-3 cursor-ew-resize rounded-r-lg bg-[var(--ink)]/70"
            />
          </div>
        </div>

        <p hidden={part !== "arrange"} className="mt-1.5 text-xs tabular-nums text-[var(--muted)]">
          {sourceIn.toFixed(2)}s – {sourceOut.toFixed(2)}s of{" "}
          {source ? `${source.duration.toFixed(1)}s` : "an unavailable file"}
          {drag ? " (release to save)" : ""}
        </p>

        <div hidden={part !== "arrange"} className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={Boolean(busy) || playhead === null}
            title={playhead === null ? "Move the playhead into this clip first" : undefined}
            onClick={() => void onRun({ kind: "split", clipId: clip.id, filmSeconds: start + (playhead ?? 0) }, `split-${clip.id}`)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-40"
          >
            <Scissors className="h-3.5 w-3.5" aria-hidden />
            Split here
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || index === 0}
            aria-label="Move earlier"
            onClick={() => void onRun({ kind: "move", clipId: clip.id, toIndex: index - 1 }, `move-${clip.id}`)}
            className="rounded-full border border-[var(--line)] p-1.5 text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={Boolean(busy) || index === count - 1}
            aria-label="Move later"
            onClick={() => void onRun({ kind: "move", clipId: clip.id, toIndex: index + 1 }, `move-${clip.id}`)}
            className="rounded-full border border-[var(--line)] p-1.5 text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            aria-label="Delete this clip"
            onClick={() => void onRun({ kind: "delete", clipId: clip.id }, `delete-${clip.id}`)}
            className="rounded-full border border-[var(--line)] p-1.5 text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>

        {selected && part === "text" ? <>
        <FieldAssist projectId={projectId} state={state} field="overlayText" label="write on-screen text" value={clip.texts?.map(text => text.text).join(" ") ?? ""} sceneId={clip.sceneId} onAccept={answer => onRun({ kind: "patch", clipId: clip.id, patch: { texts: [...(clip.texts ?? []), { text: answer, start: 0, end: Math.min(3, length), x: .5, y: .85, size: 32, color: "#ffffff" }] } })} />
        <OverlayEditor
          clip={clip}
          length={length}
          disabled={Boolean(busy)}
          onChange={(texts: StudioTextOverlay[]) =>
            void onRun({ kind: "patch", clipId: clip.id, patch: { texts } }, `texts-${clip.id}`)
          }
        />

        </> : null}
        <div hidden={!selected || part !== "audio"} className="mt-3 grid gap-3 sm:grid-cols-2">
          <Slider
            label="Clip audio"
            hint="Speech, ambience and score, as generated into this file"
            value={clip.clipVolume}
            onCommit={(value) =>
              void onRun({ kind: "patch", clipId: clip.id, patch: { clipVolume: value } }, `vol-${clip.id}`)
            }
          />
          {scene?.musicUrl && !source?.take.nativeAudio ? (
            <Slider
              label="Music"
              hint="A separate track mixed in at export"
              value={clip.musicVolume ?? 0}
              onCommit={(value) =>
                void onRun({ kind: "patch", clipId: clip.id, patch: { musicVolume: value } }, `mus-${clip.id}`)
              }
            />
          ) : (
            <p className="text-xs leading-5 text-[var(--muted)]">
              No separate music track. This clip&apos;s soundtrack is baked in,
              so it has one level, not a dialogue level and a music level.
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * A poster frame, drawn by seeking a hidden video once.
 *
 * The canvas is only displayed, never read back, so a cross-origin source
 * tainting it does not matter.
 */
function Thumbnail({ url, at }: { url: string; at: number }) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let cancelled = false;
    const element = document.createElement("video");
    element.preload = "metadata";
    element.muted = true;
    element.src = url;
    const draw = () => {
      if (cancelled || !canvas.current) return;
      const context = canvas.current.getContext("2d");
      if (!context) return;
      try {
        context.drawImage(element, 0, 0, canvas.current.width, canvas.current.height);
      } catch {
        // A frame that cannot be drawn just leaves the placeholder showing.
      }
    };
    const onMeta = () => {
      element.currentTime = Math.min(at + 0.1, Math.max(0, (element.duration || 1) - 0.1));
    };
    element.addEventListener("loadedmetadata", onMeta);
    element.addEventListener("seeked", draw);
    return () => {
      cancelled = true;
      element.removeEventListener("loadedmetadata", onMeta);
      element.removeEventListener("seeked", draw);
      element.src = "";
    };
  }, [url, at]);
  return (
    <canvas
      ref={canvas}
      width={160}
      height={90}
      aria-hidden
      className="h-full w-full rounded-lg object-cover"
    />
  );
}

function Slider({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string;
  hint: string;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <label className="block">
      <span className="text-xs font-medium text-[var(--ink)]">{label}</span>
      <span className="ml-2 text-xs tabular-nums text-[var(--muted)]">
        {Math.round(local * 100)}%
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={local}
        onChange={(event) => setLocal(Number(event.target.value))}
        onPointerUp={() => onCommit(local)}
        onKeyUp={() => onCommit(local)}
        className="mt-1 block h-1.5 w-full accent-[var(--ink)]"
      />
      <span className="mt-0.5 block text-xs leading-5 text-[var(--muted)]">{hint}</span>
    </label>
  );
}

/** Export, and its polling. Only a Supabase-archived MP4 counts as a result. */
function Export({
  projectId,
  state,
  problem,
  onState,
}: {
  projectId: string;
  state: StudioState;
  problem: string | null;
  onState: (state: StudioState) => void;
}) {
  const pending = state.renderJobs?.findLast(item => !["complete", "error", "needs_attention"].includes(item.status));
  const [requestId, setRequestId] = useState<string | null>(pending?.requestId ?? null);
  const [status, setStatus] = useState(pending?.status ?? "");
  const [error, setError] = useState("");

  const job = state.renderJobs?.find((item) => item.requestId === requestId);

  useEffect(() => {
    if (!requestId || !job || ["complete", "error", "needs_attention"].includes(job.status))
      return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch(
            `/api/studio/${projectId}/render?requestId=${encodeURIComponent(requestId)}`,
            { cache: "no-store" },
          );
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "The export status is unavailable.");
          onState(body.state);
          setStatus(body.job?.status || "");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "The export status is unavailable.");
        }
      })();
    }, 5000);
    return () => clearInterval(timer);
  }, [projectId, requestId, job, onState]);

  const start = async () => {
    const id = requestId && !job ? requestId : crypto.randomUUID();
    setRequestId(id);
    setError("");
    setStatus("submitting");
    try {
      const response = await fetch(`/api/studio/${projectId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "The export could not start.");
      setRequestId(id);
      onState(body.state);
      setStatus(body.job?.status || "queued");
    } catch (cause) {
      setStatus("");
      setError(cause instanceof Error ? cause.message : "The export could not start.");
    }
  };

  const running = status && !["complete", "error", "needs_attention"].includes(status);

  return (
    <div className="border-t border-[var(--line)] pt-6">
      <button
        type="button"
        disabled={Boolean(problem) || Boolean(running)}
        onClick={() => void start()}
        title={problem ?? undefined}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:opacity-50"
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
        {running ? "Exporting…" : "Export the story"}
      </button>
      {problem ? (
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{problem}</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[var(--ink)]">
          {error}
        </p>
      ) : null}
      {job?.error ? (
        <p role="alert" className="mt-2 text-xs font-medium text-[var(--ink)]">
          {job.error}
        </p>
      ) : null}
    </div>
  );
}

function Exports({ state }: { state: StudioState }) {
  if (!state.exports?.length) return null;
  return (
    <div className="border-t border-[var(--line)] pt-6">
      <h3 className="text-sm font-semibold text-[var(--ink)]">Exports</h3>
      <ul className="mt-2 space-y-2">
        {[...state.exports].reverse().map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] px-4 py-3"
          >
            <span className="text-sm text-[var(--ink)]">{item.name}</span>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-[var(--ink)] underline"
            >
              Open
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
