"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Route } from "next";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { FILM_STEPS, stepIndex } from "@/lib/film/steps";
import { filmProgress, progressSummary } from "@/lib/film/progress";
import { SetupStep } from "@/components/film/setup-step";
import { ScriptStep } from "@/components/film/script-step";
import { GenerateStep } from "@/components/film/generate-step";
import { EditStep } from "@/components/film/edit-step";
import type { ClipCapability } from "@/lib/film/duration";
import type { FilmBeat, FilmStep, StudioState } from "@/types/studio";

type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * The four-step workflow shell.
 *
 * One screen holds one project state and one save path. The steps are panels
 * rather than routes so moving between them never drops unsaved edits or
 * re-fetches the project.
 */
export default function FilmStudioScreen() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [state, setState] = useState<StudioState | null>(null);
  // Resolved server-side: the browser cannot read the deployment's limits, and
  // offering a length the worker refuses is worse than offering none.
  const [capability, setCapability] = useState<ClipCapability | undefined>();
  const [notices, setNotices] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [attempt, setAttempt] = useState(0);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoadFailed(false);
    (async () => {
      try {
        const response = await fetch(`/api/studio/${id}`, { cache: "no-store" });
        const body = await response.json();
        if (!active) return;
        if (!response.ok) throw new Error(body.error || "This project could not be opened.");
        setState(body.state);
        setCapability(body.capability);
      } catch (cause) {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "This project could not be opened.");
        setLoadFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [id, attempt]);

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  // Serialize blur-saves and clicks so a navigation or build cannot overtake an edit.
  const writes = useRef<Promise<unknown>>(Promise.resolve());
  // The last project the server returned, for decisions made right after a
  // write, before React has re-rendered with it.
  const saved = useRef<StudioState | null>(null);
  const act = useCallback((body: Record<string, unknown>): Promise<boolean> => {
    const run = async () => {
      if (!id) return false;
      setSaveState("saving"); setError("");
      try {
        const response = await fetch(`/api/studio/${id}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "That change could not be saved.");
        setState(result.state);
        saved.current = result.state;
        if (result.capability) setCapability(result.capability);
        setNotices(result.notices ?? []); setSaveState("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
        return true;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That change could not be saved.");
        setSaveState("failed"); return false;
      }
    };
    const next = writes.current.then(run, run);
    writes.current = next;
    return next;
  }, [id]);
  const save = useCallback((patch: Record<string, unknown>) => act({ action: "workflow", patch }), [act]);

  /**
   * Reference upload. Multipart rather than JSON, and it returns the analysed
   * project, so the appearance the user reviews is the one actually stored.
   * Resolves to an error message, or null on success.
   */
  const upload = useCallback(
    async (form: FormData): Promise<string | null> => {
      if (!id) return "This project is not open.";
      setSaveState("saving");
      setError("");
      try {
        const response = await fetch(`/api/studio/${id}/reference`, {
          method: "POST",
          body: form,
        });
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "That photo could not be read. Nothing was saved.");
        setState(body.state);
        setSaveState("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
        return null;
      } catch (cause) {
        setSaveState("failed");
        return cause instanceof Error
          ? cause.message
          : "That photo could not be read. Nothing was saved.";
      }
    },
    [id],
  );

  const goToStep = useCallback(
    async (step: FilmStep) => {
      if (!state || step === state.step) return;
      // Optimistic so navigation never waits on the network; a failed save
      // surfaces its own message and the server stays the source of truth.
      setState({ ...state, step });
      await save({ step });
    },
    [state, save],
  );

  // "Let Omni do it". The id is kept until the server confirms, so a retry
  // after a timeout is recognised as the same request.
  const directRequest = useRef<string | null>(null);
  const [directing, setDirecting] = useState(false);
  const autoDirect = useCallback(async () => {
    setDirecting(true);
    directRequest.current ??= crypto.randomUUID();
    const ok = await act({ action: "autoDirect", requestId: directRequest.current });
    setDirecting(false);
    if (!ok) return false;
    directRequest.current = null;
    setState((current) => (current ? { ...current, step: "generate" } : current));
    await save({ step: "generate" });
    return true;
  }, [act, save]);

  const [building, setBuilding] = useState(false);
  const buildScript = useCallback(async () => {
    setBuilding(true);
    const ok = await act({ action: "script" });
    if (ok) setState((current) => (current ? { ...current, step: "script" } : current));
    // An idea is guided end to end: Omni fills the scene details and the
    // writer lands on Generate. A pasted script stops at Step 2 so its
    // writer can choose who decides the details. If directing fails, the
    // writer is left on Step 2 with the error and can retry from there.
    if (ok && !saved.current?.sourceScript?.trim()) await autoDirect();
    setBuilding(false);
  }, [act, autoDirect]);

  if (!state) {
    return (
      <ProtectedRoute>
        <main className="mx-auto max-w-2xl px-6 py-24 text-center">
          {loadFailed ? (
            <>
              <h1 className="text-2xl font-semibold text-[var(--ink)]">
                This project could not be opened
              </h1>
              <p role="alert" className="mt-3 text-sm text-[var(--muted)]">
                {error} Nothing was changed.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setAttempt((value) => value + 1)}
                  className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:opacity-90"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/dashboard" as Route)}
                  className="rounded-full border border-[var(--line)] px-5 py-2.5 text-sm font-medium text-[var(--ink)] transition hover:bg-black/[0.04]"
                >
                  Back to projects
                </button>
              </div>
            </>
          ) : (
            <p className="flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Opening your story…
            </p>
          )}
        </main>
      </ProtectedRoute>
    );
  }

  const current = state.step ?? "setup";
  const currentIndex = stepIndex(current);
  const previous = FILM_STEPS[currentIndex - 1];
  const next = FILM_STEPS[currentIndex + 1];

  return (
    <ProtectedRoute>
      <StepIndicator state={state} onSelect={goToStep} />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push("/dashboard" as Route)}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--ink)]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Projects
            </button>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--ink)]">
              {state.title}
            </h1>
          </div>
          <p
            className="text-sm text-[var(--muted)]"
            role="status"
            aria-live="polite"
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "failed"
                  ? "Not saved"
                  : ""}
          </p>
        </header>


        {error ? (
          <p
            role="alert"
            className="mt-6 rounded-xl border border-[var(--line)] px-4 py-3 text-sm font-medium text-[var(--ink)]"
          >
            {error}
          </p>
        ) : null}

        {notices.length ? (
          <ul
            role="status"
            className="mt-6 space-y-1.5 rounded-xl border border-[var(--line)] px-4 py-3"
          >
            {notices.map((notice) => (
              <li key={notice} className="text-sm leading-6 text-[var(--ink)]">
                {notice}
              </li>
            ))}
          </ul>
        ) : null}

        <section className="mt-4 rounded-2xl border border-[var(--line)] p-4 sm:p-5">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
            {FILM_STEPS[currentIndex].title}
          </h2>
          <div className="mt-4">
            {current === "setup" ? (
              <SetupStep
                projectId={id as string}
                state={state}
                busy={building}
                capability={capability}
                onSave={save}
                onGenerateScript={buildScript}
                onContinue={() => void goToStep("script")}
                characters={{
                  onCharacter: (characterId, patch) => act({ action: "character", characterId, ...patch }),
                  onReference: (characterId, referenceId, operation) =>
                    act({ action: "reference", characterId, referenceId, operation }),
                  onUpload: upload,
                  onVoice: (characterId, voice) => act({ action: "voice", characterId, voice }),
                  onAction: act,
                }}
              />
            ) : current === "script" ? (
              <ScriptStep
                projectId={id as string}
                state={state}
                capability={capability}
                onScenePatch={(sceneId, patch) => act({ action: "scenePatch", sceneId, patch })}
                onDialogue={(sceneId, operation) => act({ action: "dialogue", sceneId, operation })}
                onBeats={(sceneId, beats: FilmBeat[] | null) => act({ action: "beats", sceneId, beats })}
                onVoice={(characterId, voice) => act({ action: "voice", characterId, voice })}
                onCharacter={(characterId, patch) => act({ action: "character", characterId, ...patch })}
                onReference={(characterId, referenceId, operation) =>
                  act({ action: "reference", characterId, referenceId, operation })
                }
                onUpload={upload}
                onAction={act}
                onContinue={() => void goToStep("generate")}
                directing={directing}
                onAutoDirect={autoDirect}
                onDirect={() => save({ directionMode: "director" })}
              />
            ) : current === "generate" ? (
              <GenerateStep
                projectId={id as string}
                state={state}
                capability={capability}
                onState={setState}
                onAssemble={() => act({ action: "assemble" })}
                onSelect={(sceneId, takeId) => act({ action: "select", sceneId, takeId })}
                onReview={(sceneId, takeId) => act({ action: "reviewTake", sceneId, takeId })}
                onGoToStep={(step) => void goToStep(step)}
                onLockAll={() => act({ action: "lockCharacters" })}
              />
            ) : (
              <EditStep
                projectId={id as string}
                state={state}
                onState={setState}
                onEdit={(operation) => act({ action: "clipEdit", operation })}
              />
            )}
          </div>
        </section>


      </main>
    </ProtectedRoute>
  );
}

function StepIndicator({ state, onSelect }: { state: StudioState; onSelect: (step: FilmStep) => void }) {
  const progress = filmProgress(state);
  // The line has three spans (1→2, 2→3, 3→4), while completion has four
  // phases. Convert the phase percentage so completing a phase lands the
  // arrow underneath the next numbered circle.
  const pathPercent = Math.min(100, Math.round(progress.percent * 4 / 3));
  return <nav className="story-progress" aria-label="Story progress">
    <div className="story-progress-inner">
      <ol className="story-progress-stages">
        {progress.steps.map((step, index) => {
          const done = step.fraction === 1 && !step.invalidated;
          return <li key={step.id} className={`story-progress-stage ${step.id === progress.current ? "current" : ""} ${done ? "done" : ""}`}>
            <button type="button" disabled={!step.reachable} onClick={() => onSelect(step.id)} aria-current={step.id === progress.current ? "step" : undefined}
              aria-label={`${index + 1}. ${step.title}${done ? ", completed" : ""}`} title={step.invalidated ?? step.title}>
              <span className="story-stage-number" style={{ "--story-circle-fill": `${Math.round(step.fraction * 100)}%` } as CSSProperties}><span>{index + 1}</span></span><span className="story-stage-name">{step.title}</span>
            </button>
          </li>;
        })}
      </ol>
      <div className="story-progress-track" role="progressbar" aria-label="Story completion" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}>
        <span className="story-progress-fill" style={{ width: `${pathPercent}%` }} />
        <span className="story-progress-percent" style={{ "--story-progress-head": `${pathPercent}%` } as CSSProperties}><span>{progress.percent}%</span><img src="/omni-mark.png" alt="" /></span>
      </div>
      <div className="story-progress-caption"><span>{progressSummary(progress, state)}</span></div>
    </div>
  </nav>;
}
