"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Film,
  Loader2,
  Play,
  RefreshCw,
  Scissors,
  X,
} from "lucide-react";
import {
  MAX_FILM_CLIPS,
  MAX_FILM_SECONDS,
  filmGeneration,
  type SceneGeneration,
} from "@/lib/film/generate";
import type { ClipCapability } from "@/lib/film/duration";
import type { SceneJob, StudioState, StudioTake } from "@/types/studio";
import { DecisionFlow, type DecisionPage } from "./decision-flow";
import { FieldAssist } from "./field-assist";
import { continuityProblem } from "@/lib/studio/identity";

type Props = {
  projectId: string;
  state: StudioState;
  /** Resolved server-side; the browser cannot read the deployment's limits. */
  capability?: ClipCapability;
  /** Replaces the project after a server change. */
  onState: (state: StudioState) => void;
  onAssemble: () => Promise<boolean>;
  onSelect: (sceneId: string, takeId: string) => Promise<boolean>;
  onReview: (sceneId: string, takeId: string) => Promise<boolean>;
};

const PHASE_LABEL: Record<string, string> = {
  prepare: "Preparing",
  submitting: "Submitting",
  poll: "Rendering",
  review: "Checking appearance",
  publish: "Saving",
  done: "Done",
};

/**
 * Step 3.
 *
 * One authored scene becomes one generated video, listed as one row. A scene
 * with internal cuts is still one row and one file; splitting it happens in the
 * editor.
 *
 * The durable queue does the work, so this polls it rather than holding
 * generation in the page: a refresh mid-render loses nothing, and a retry
 * resumes an accepted provider job instead of paying for a second one.
 */
export function GenerateStep({
  projectId,
  state,
  capability,
  onState,
  onAssemble,
  onSelect,
  onReview,
}: Props) {
  const [jobs, setJobs] = useState<SceneJob[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [advice, setAdvice] = useState("");
  const alive = useRef(true);
  const pendingRequests = useRef(new Map<string, string>());
  // Focus lands on the question, never on "Yes": a key press carried over
  // from the previous screen must not start paid renders.
  const offerHeading = useRef<HTMLParagraphElement>(null);
  const offerId = state.generateAllOffer?.id;
  useEffect(() => { if (offerId) offerHeading.current?.focus(); }, [offerId]);


  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/studio/${projectId}/jobs`, { cache: "no-store" });
      const body = await response.json();
      if (!alive.current) return;
      if (!response.ok) throw new Error(body.error || "The generation queue is unavailable.");
      setJobs(body.jobs ?? []);
      if (body.state) onState(body.state);
      setError("");
    } catch (cause) {
      if (!alive.current) return;
      setError(cause instanceof Error ? cause.message : "The generation queue is unavailable.");
    }
  }, [projectId, onState]);

  const film = filmGeneration(state, jobs, capability);

  // Polling follows the work: frequent while something is running, idle
  // otherwise, so a finished project is not refetching every few seconds.
  useEffect(() => {
    void refresh();
    const period = film.working ? 4000 : 20000;
    const timer = setInterval(() => void refresh(), period);
    return () => clearInterval(timer);
  }, [refresh, film.working]);

  const submit = useCallback(
    async (scenes: SceneGeneration[], kind: "image" | "video" = "video", fixedIds?: Record<string, string>) => {
      if (!scenes.length) return true;
      setBusy("submit");
      setError("");
      try {
        for (const item of scenes) {
          const key = `${kind}:${item.scene.id}`;
          // A fixed id (the Generate-all offer) makes a repeated submit land
          // on the same durable job instead of paying for a new one.
          const requestId = fixedIds?.[item.scene.id] ?? pendingRequests.current.get(key) ?? crypto.randomUUID();
          pendingRequests.current.set(key, requestId);
          const response = await fetch(`/api/studio/${projectId}/jobs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "submit",
              requestId,
              kind,
              sceneId: item.scene.id,
              // The scene already holds everything the prompt needs, so the
              // director's rewrite is skipped.
              plan: false,
              text: item.scene.visualAction || item.scene.description || item.scene.title,
            }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || `${item.scene.title} could not be queued.`);
          pendingRequests.current.delete(key);
        }
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That generation could not be queued.");
        return false;
      } finally {
        setBusy("");
        void refresh();
      }
    },
    [projectId, refresh],
  );

  const change = useCallback(
    async (jobId: string, action: "retry" | "cancel") => {
      setBusy(jobId);
      setError("");
      try {
        const response = await fetch(`/api/studio/${projectId}/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, jobId }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "That could not be changed.");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That could not be changed.");
      } finally {
        setBusy("");
        void refresh();
      }
    },
    [projectId, refresh],
  );

  const urdu = (state.language ?? "en") === "ur";
  // Asked once after "Let Omni do it". Only scenes that are ready now and
  // were part of the offer are counted, so the number is what will queue.
  const offer = state.generateAllOffer;
  const offered = offer && !urdu ? film.scenes.filter((item) => ["pending", "stale"].includes(item.status) && offer.requestIds[item.scene.id]) : [];
  const answerOffer = async (yes: boolean) => {
    if (!offer) return;
    // Submit first: if this fails or the page closes, the question stays,
    // and answering Yes again reuses the same request ids.
    if (yes && !(await submit(offered, "video", offer.requestIds))) return;
    setBusy("offer");
    try {
      const response = await fetch(`/api/studio/${projectId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "answerGenerateAll", offerId: offer.id }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your answer could not be saved.");
      onState(body.state);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your answer could not be saved.");
    } finally {
      setBusy("");
    }
  };


  if (!state.scenes.length) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No scenes yet. Go back to Script &amp; Characters first.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {offered.length ? (
        <section role="alertdialog" aria-labelledby="generate-all-title" aria-describedby="generate-all-body" className="generate-offer">
          <p id="generate-all-title" tabIndex={-1} ref={offerHeading} className="text-base font-semibold text-[var(--ink)] outline-none">
            Generate all {offered.length} ready scene{offered.length === 1 ? "" : "s"} now?
          </p>
          <p id="generate-all-body" className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Omni has filled in your scene details. This queues {offered.length} scene video{offered.length === 1 ? "" : "s"}. A scene with characters makes a reference frame first, then its video. Rendering continues if you close this page.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="decision-next" disabled={Boolean(busy)} onClick={() => void answerOffer(true)}>
              {busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
              Yes, generate {offered.length}
            </button>
            <button type="button" className="decision-back" disabled={Boolean(busy)} onClick={() => void answerOffer(false)}>Not now</button>
          </div>
        </section>
      ) : null}
      {urdu ? (
        <p
          role="status"
          className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm leading-6 text-[var(--ink)]"
        >
          <strong className="font-semibold">Urdu video is not available yet.</strong> It
          needs the lip-sync pipeline, which is still being validated on real
          output. Your script is saved. Switch the project to English in Setup to
          generate now, or come back for Urdu.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-medium text-[var(--ink)]"
        >
          {error}
        </p>
      ) : null}

      <DecisionFlow storageKey={`story:${projectId}:generate`} pages={[
        ...film.scenes.map((item, index): DecisionPage => ({ id: item.scene.id, title: `Scene ${index + 1} · ${item.scene.title}`,
          description: "Create and review this scene before moving on. A generation starts only when you press its button.", content: <>
            <ul><SceneRow key={item.scene.id} item={item} busy={busy} onGenerate={() => void submit([item])} onGenerateImage={() => void submit([item], "image")} onChange={change} onSelect={onSelect} onReview={onReview} state={state} /></ul>
            <FieldAssist projectId={projectId} state={state} sceneId={item.scene.id} field="editAdvice" label="help with this scene" value={item.problem ?? ""} onAccept={setAdvice} />
            {advice ? <p className="film-help">{advice}</p> : null}
          </> })),
        { id: "assemble", title: "Bring your scenes together", description: "Once every scene has an approved, selected video, open the editor.", ready: film.complete && !film.problem,
          content: <><Budget film={film} sceneCount={state.scenes.length} /><ol className="story-scene-list">{film.scenes.map((item, index) => <li key={item.scene.id}><span className="story-scene-index">{index + 1}</span><span className="flex-1">{item.scene.title}</span><span className="text-xs">{item.status === "ready" ? "Ready" : item.status}</span></li>)}</ol>{film.problem ? <p className="film-help">{film.problem}</p> : null}</> },
      ]} finish={async () => { await onAssemble(); }} finishLabel="Assemble and edit" busy={Boolean(busy)} />

    </div>
  );
}

function Budget({
  film,
  sceneCount,
}: {
  film: ReturnType<typeof filmGeneration>;
  sceneCount: number;
}) {
  const overClips = sceneCount > MAX_FILM_CLIPS;
  const overTime = film.measuredSeconds > MAX_FILM_SECONDS;
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      <Stat label="Scenes" value={`${sceneCount} of ${MAX_FILM_CLIPS}`} flag={overClips} />
      <Stat
        label="Finished length"
        value={`${film.measuredSeconds.toFixed(1)}s of ${MAX_FILM_SECONDS}s`}
        hint="Measured from the finished files"
        flag={overTime}
      />
      <Stat
        label="Asking for"
        value={`${film.requestedSeconds.toFixed(1)}s`}
        hint="Across every scene, generated or not"
      />
    </dl>
  );
}

function Stat({
  label,
  value,
  hint,
  flag,
}: {
  label: string;
  value: string;
  hint?: string;
  flag?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        flag ? "border-[var(--ink)]" : "border-[var(--line)]"
      }`}
    >
      <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-[var(--ink)]">{value}</dd>
      {hint ? (
        <dd className="mt-0.5 text-xs leading-5 text-[var(--muted)]">{hint}</dd>
      ) : null}
    </div>
  );
}

function SceneRow({
  item,
  busy,
  onGenerate,
  onGenerateImage,
  onChange,
  onSelect,
  onReview,
  state,
}: {
  item: SceneGeneration;
  busy: string;
  onGenerate: () => void;
  onGenerateImage: () => void;
  onChange: (jobId: string, action: "retry" | "cancel") => Promise<void>;
  onSelect: Props["onSelect"];
  onReview: Props["onReview"];
  state: StudioState;
}) {
  const { scene, status, problem, take, takes, job } = item;
  const cuts = scene.beats?.length ?? 0;

  return (
    <li className="rounded-2xl border border-[var(--line)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-48 flex-1">
          <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Scene {item.index + 1} · asking for {item.requestedSeconds.toFixed(1)}s
            {cuts > 1 ? ` · ${cuts} cuts in one video` : ""}
          </span>
          <h4 className="mt-0.5 text-base font-semibold text-[var(--ink)]">
            {scene.title}
          </h4>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
            {scene.visualAction || scene.description}
          </p>
        </div>
        <StatusBadge status={status} phase={job?.phase} />
      </div>

      {problem ? (
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-[var(--ink)]">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}

      {take?.url ? (
        <div className="mt-3">
          <video
            src={take.url}
            controls
            preload="metadata"
            className="w-full max-w-md rounded-xl border border-[var(--line)]"
          />
          <p className="mt-1.5 text-xs text-[var(--muted)]">
            {take.duration
              ? `${take.duration.toFixed(1)}s measured`
              : "Length not measured yet"}
            {take.requestedSeconds
              ? ` · ${take.requestedSeconds.toFixed(1)}s requested`
              : ""}
            {take.nativeAudio ? " · speech, ambience and score are in this file" : ""}
          </p>
        </div>
      ) : null}

      {takes.length ? (
        <div className="mt-3">
          <span className="text-xs font-medium text-[var(--ink)]">
            {takes.length} takes
          </span>
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {takes.map((option, position) => (
              <li key={option.id}>
                <button
                  type="button"
                  aria-pressed={option.id === scene.selectedVideoId}
                  disabled={Boolean(busy) || Boolean(continuityProblem(state, scene, option))}
                  title={continuityProblem(state, scene, option)}
                  onClick={() => void onSelect(scene.id, option.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition ${
                    option.id === scene.selectedVideoId
                      ? "border-[var(--accent)] bg-[var(--accent)]"
                      : "border-[var(--line)] hover:bg-black/[0.04]"
                  }`}
                >
                  {option.id === scene.selectedVideoId ? "Using take" : "Use take"} {position + 1}
                  {option.duration ? ` · ${option.duration.toFixed(1)}s` : ""}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {status !== "working" && status !== "blocked" ? <button type="button" className="guest-pill" disabled={Boolean(busy)} onClick={onGenerateImage}>Generate scene image</button> : null}
        {take?.identity?.length && take.continuity?.status !== "passed" ? <button type="button" className="guest-pill" disabled={Boolean(busy)}
          onClick={() => void onReview(scene.id, take.id)}>Recheck appearance</button> : null}
        {status === "working" && job ? (
          <button
            type="button"
            disabled={busy === job.id}
            onClick={() => void onChange(job.id, "cancel")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs font-medium text-[var(--ink)] transition hover:bg-black/[0.04] disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Stop
          </button>
        ) : null}

        {status === "failed" && job ? (
          <button
            type="button"
            disabled={busy === job.id}
            onClick={() => void onChange(job.id, "retry")}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:opacity-50"
          >
            {busy === job.id ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            )}
            Retry this scene
          </button>
        ) : null}

        {["pending", "stale", "review"].includes(status) ? (
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={onGenerate}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] transition hover:opacity-90 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            {status === "stale" || status === "review" ? "Generate another take" : "Generate this scene"}
          </button>
        ) : null}
      </div>

      {status === "failed" ? (
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
          Retrying picks up the render that was already accepted where it can, so
          it does not pay for a second one.
        </p>
      ) : null}

      <TakeReview take={take} />
      {scene.takes.some(option => option.kind === "image" && option.status === "complete") ? <details className="film-disclosure">
        <summary>Scene reference images</summary>
        <p className="film-help">Approve a checked image to use its pixels for the next video. A new image or video uses provider credits.</p>
        <div className="mt-3 flex flex-wrap gap-3">{scene.takes.filter(option => option.kind === "image" && option.status === "complete" && option.url).map(option =>
          <div key={option.id} className="max-w-48">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={option.url} alt={`Reference frame for ${scene.title}`} className="w-44 rounded-lg" />
            <button type="button" className="guest-pill mt-2" disabled={Boolean(busy) || Boolean(continuityProblem(state, scene, option))}
              title={continuityProblem(state, scene, option)} aria-pressed={scene.selectedImageId === option.id}
              onClick={() => void onSelect(scene.id, option.id)}>{scene.selectedImageId === option.id ? "Using this reference" : "Approve and use reference"}</button>
            <TakeReview take={option} />
            {option.identity?.length && option.continuity?.status !== "passed" ? <button type="button" className="film-text-button mt-2"
              onClick={() => void onReview(scene.id, option.id)}>Recheck image</button> : null}
          </div>)}</div>
      </details> : null}
    </li>
  );
}

/** Appearance review, which gates assembly rather than being advisory. */
function TakeReview({ take }: { take?: StudioTake }) {
  if (!take?.continuity) return null;
  const { status, checks } = take.continuity;
  if (status === "passed") return null;
  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] p-3">
      <span className="text-xs font-medium text-[var(--ink)]">
        {status === "pending"
          ? "Appearance check running"
          : status === "failed"
            ? "Appearance check found a mismatch"
            : status === "review"
              ? "Appearance needs your eyes"
              : "Appearance check could not finish"}
      </span>
      {checks?.length ? (
        <ul className="mt-1.5 space-y-1">
          {checks.map((check) => (
            <li key={check.characterId} className="text-xs leading-5 text-[var(--muted)]">
              {check.verdict}: {check.notes}
            </li>
          ))}
        </ul>
      ) : null}
      {status !== "pending" ? (
        <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">
          A story cannot be assembled while a character does not match their
          reference views. Generate this scene again, or correct the reference in
          Script &amp; Characters.
        </p>
      ) : null}
    </div>
  );
}

function StatusBadge({ status, phase }: { status: string; phase?: string }) {
  const label =
    status === "review" ? "Choose a take" : status === "working"
      ? PHASE_LABEL[phase || ""] || "Working"
      : status === "ready"
        ? "Ready"
        : status === "failed"
          ? "Stopped"
          : status === "stale"
            ? "Out of date"
            : status === "blocked"
              ? "Blocked"
              : "Not generated";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-[var(--ink)] ${
        status === "ready" ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--line)]"
      }`}
    >
      {status === "working" ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : status === "ready" ? (
        <Check className="h-3 w-3" aria-hidden />
      ) : null}
      {label}
    </span>
  );
}
