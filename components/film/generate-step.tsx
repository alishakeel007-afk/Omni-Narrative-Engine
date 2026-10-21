"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Loader2, Play, RefreshCw, Trash2, X } from "lucide-react";
import { filmGeneration, MAX_FILM_CLIPS, MAX_FILM_SECONDS, type SceneGeneration } from "@/lib/film/generate";
import { clipCapability, type ClipCapability } from "@/lib/film/duration";
import { clipProblem } from "@/lib/film/shots";
import { SpeechGuidance } from "./speech-guidance";
import { referenceTakeProblem, sceneReferenceProblem } from "@/lib/film/reference";
import { continuityProblem, imageReviewOverridden, sceneHasCharacterReferences } from "@/lib/studio/identity";
import type { SceneJob, StudioScene, StudioState, StudioTake } from "@/types/studio";
import { DecisionFlow, type DecisionPage } from "./decision-flow";
import { Select } from "@/components/ui/select";
import { ActionErrorToast } from "@/components/ui/action-error-toast";

type Props = {
  projectId: string;
  state: StudioState;
  capability?: ClipCapability;
  onState: (state: StudioState) => void;
  onAssemble: () => Promise<boolean>;
  onSelect: (sceneId: string, takeId: string, skipCheck?: boolean) => Promise<boolean>;
  onReview: (sceneId: string, takeId: string) => Promise<boolean>;
  onScenePatch?: (sceneId: string, patch: Partial<StudioScene>) => Promise<boolean>;
  onGoToStep: (step: "setup" | "script") => void;
  onLockAll: () => Promise<boolean>;
};

const ACTIVE = ["queued", "waiting", "running"];
const PHASE: Record<string, string> = { prepare: "Preparing", submitting: "Submitting", poll: "Generating", review: "Checking scene and characters", publish: "Saving", done: "Finished" };

export function GenerateStep({ projectId, state, capability, onState, onAssemble, onSelect, onReview, onScenePatch, onGoToStep, onLockAll }: Props) {
  const [jobs, setJobs] = useState<SceneJob[]>([]);
  const [queueError, setQueueError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const alive = useRef(true);
  const refreshing = useRef(false);
  const mutation = useRef(0);
  const revision = useRef(state.revision);
  useEffect(() => { revision.current = state.revision; }, [state.revision]);
  const pendingRequests = useRef(new Map<string, string>());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current || document.hidden) return;
    refreshing.current = true;
    const version = mutation.current;
    try {
      const response = await fetch(`/api/studio/${projectId}/jobs`, { cache: "no-store" });
      const body = await response.json();
      if (!alive.current || version !== mutation.current) return;
      if (!response.ok) throw new Error(body.error || "The generation queue is unavailable.");
      setJobs(body.jobs ?? []);
      if (body.state && body.state.revision > revision.current) onState(body.state);
      setQueueError("");
    } catch (cause) {
      if (alive.current) setQueueError(cause instanceof Error ? cause.message : "The queue could not refresh.");
    } finally { refreshing.current = false; }
  }, [projectId, onState]);

  const film = filmGeneration(state, jobs, capability);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), film.working ? 5000 : 20000);
    const visible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [refresh, film.working]);

  const submit = async (item: SceneGeneration, kind: "image" | "video", instructions = "", fixedId?: string, direct?: boolean) => {
    if (kind === "video") {
      const problem = clipProblem({ scene: item.scene, language: state.language ?? "en", clipSeconds: item.requestedSeconds });
      if (problem) throw new Error(problem);
    }
    mutation.current++;
    const key = `${kind}:${item.scene.id}`;
    const requestId = fixedId ?? pendingRequests.current.get(key) ?? crypto.randomUUID();
    pendingRequests.current.set(key, requestId);
    const response = await fetch(`/api/studio/${projectId}/jobs`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", requestId, kind, sceneId: item.scene.id, plan: false,
        text: item.scene.visualAction || item.scene.description || item.scene.title, instructions, ...(direct === undefined ? {} : { direct }) }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "This generation could not be queued.");
    pendingRequests.current.delete(key);
    if (body.job) setJobs(current => [...current.filter(job => job.id !== body.job.id), body.job]);
    void refresh();
    return true;
  };

  const change = async (jobId: string, action: "retry" | "cancel") => {
    mutation.current++;
    const response = await fetch(`/api/studio/${projectId}/jobs`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, jobId }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The job could not be updated.");
    setJobs(current => current.map(job => job.id === jobId ? { ...job, status: action === "retry" ? "queued" : "cancelled", error: null } : job));
    void refresh();
    return true;
  };

  const deleteTake = async (sceneId: string, takeId: string) => {
    mutation.current++;
    const response = await fetch(`/api/studio/${projectId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteTake", sceneId, takeId }),
    });
    const body = await response.json();
    if (body.state) onState(body.state);
    if (!response.ok) throw new Error(body.error || "This take could not be deleted. Please try again.");
    void refresh();
    return true;
  };
  const keepTakes = async (sceneId: string, takeIds: string[]) => {
    mutation.current++;
    const response = await fetch(`/api/studio/${projectId}`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "keepTakes", sceneId, takeIds }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "The old takes could not be kept. Please try again.");
    onState(body.state);
    return true;
  };

  const offered = state.generateAllOffer && (state.language ?? "en") !== "ur"
    ? film.scenes.filter(item => !sceneReferenceProblem(state, item.scene) && ["pending", "stale"].includes(item.status) && state.generateAllOffer!.requestIds[item.scene.id]) : [];
  const answerOffer = async (yes: boolean) => {
    if (!state.generateAllOffer) return;
    setBusy("offer"); setError("");
    try {
      if (yes) for (const item of offered) await submit(item, "video", "", state.generateAllOffer.requestIds[item.scene.id]);
      const response = await fetch(`/api/studio/${projectId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "answerGenerateAll", offerId: state.generateAllOffer.id }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Your answer could not be saved.");
      onState(body.state);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your answer could not be saved."); }
    finally { setBusy(""); }
  };

  if (!state.scenes.length) return <p>No scenes yet. Go back to Script &amp; Characters first.</p>;
  const pages: DecisionPage[] = film.scenes.map((item, index) => ({
    id: item.scene.id, title: `Scene ${index + 1} · ${item.scene.title}`,
    description: sceneHasCharacterReferences(state, item.scene)
      ? "This scene uses a character reference. Choose a scene image, then generate the video. You can accept the image yourself if its check does not match."
      : "Generate the video directly from your scene. A reference image is optional.",
    content: <SceneRow item={item} state={state} jobs={jobs} capability={capability ?? clipCapability()}
      onSubmit={(kind, instructions, direct) => submit(item, kind, instructions, undefined, direct)} onChange={change}
      onSelect={onSelect} onReview={onReview} onScenePatch={onScenePatch} onDelete={deleteTake} onKeep={keepTakes} />,
  }));
  pages.push({ id: "assemble", title: "Bring your scenes together", ready: film.complete && !film.problem,
    description: "Review and choose a video for every scene, then open the editor.",
    content: <><dl className="grid gap-3 sm:grid-cols-3"><div>Scenes: {state.scenes.length} of {MAX_FILM_CLIPS}</div><div>Finished length: {film.measuredSeconds.toFixed(1)}s of {MAX_FILM_SECONDS}s</div><div>Requested: {film.requestedSeconds.toFixed(1)}s</div></dl>
      <ol className="story-scene-list">{film.scenes.map((item, index) => <li key={item.scene.id}><span className="story-scene-index">{index + 1}</span><span className="flex-1">{item.scene.title}</span><span>{item.status === "ready" ? "Ready" : item.status}</span></li>)}</ol>{film.problem ? <p className="film-help">{film.problem}</p> : null}</>,
  });

  return <div className="space-y-5">
    <details className="generate-change-options">
      <summary className="inline-flex cursor-pointer items-center gap-2 text-sm text-[var(--muted)]">Need to change something first? <ChevronDown size={14} aria-hidden /></summary>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="guest-pill" onClick={() => onGoToStep("setup")}>Edit setup</button>
        <button type="button" className="guest-pill" onClick={() => onGoToStep("script")}>Edit script &amp; characters</button>
        {state.characters.some(character => !character.locked && character.references?.length) ? <button type="button" className="guest-pill" disabled={!!busy} onClick={async () => { setBusy("lock"); setError(""); try { if (!await onLockAll()) throw new Error("References could not be locked. Check each character's reference first."); } catch (cause) { setError(cause instanceof Error ? cause.message : "References could not be locked."); } finally { setBusy(""); } }}>{busy === "lock" ? "Locking…" : "Lock character references"}</button> : null}
      </div>
    </details>
    {offered.length ? <section className="generate-offer" aria-label="Generate ready scenes"><p>Generate all {offered.length} ready scenes?</p><div className="mt-3 flex gap-2"><button type="button" className="decision-next" disabled={!!busy} onClick={() => void answerOffer(true)}>{busy ? "Queueing…" : `Yes, generate ${offered.length}`}</button><button type="button" className="decision-back" disabled={!!busy} onClick={() => void answerOffer(false)}>Not now</button></div></section> : null}
    {(state.language ?? "en") === "ur" ? <p role="status" className="film-help">Urdu video is not enabled yet. Your script is saved. Native Urdu speech is not documented as validated; the supplied-audio lip-sync route still needs output validation.</p> : null}
    <ActionErrorToast message={error || queueError} onDismiss={() => { setError(""); setQueueError(""); }} />
    <DecisionFlow storageKey={`story:${projectId}:generate`} pages={pages} busy={!!busy}
      finish={async () => { setBusy("assemble"); setError(""); try { if (!await onAssemble()) throw new Error("The editor could not open. Review and choose a finished video for every scene first."); } catch (cause) { setError(cause instanceof Error ? cause.message : "The story could not be assembled."); } finally { setBusy(""); } }} finishLabel="Assemble and edit" />
  </div>;
}

type RowProps = {
  item: SceneGeneration; state: StudioState; jobs: SceneJob[]; capability: ClipCapability;
  onSubmit: (kind: "image" | "video", instructions: string, direct?: boolean) => Promise<boolean>;
  onChange: (id: string, action: "retry" | "cancel") => Promise<boolean>;
  onSelect: Props["onSelect"]; onReview: Props["onReview"]; onScenePatch: Props["onScenePatch"];
  onDelete: (sceneId: string, takeId: string) => Promise<boolean>;
  onKeep: (sceneId: string, takeIds: string[]) => Promise<boolean>;
};

function SceneRow({ item, state, jobs, capability, onSubmit, onChange, onSelect, onReview, onScenePatch, onDelete, onKeep }: RowProps) {
  const { scene } = item;
  const [pending, setPending] = useState("");
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const actionError = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!error || !actionError.current) return;
    const bounds = actionError.current.getBoundingClientRect();
    // Inserting feedback below a button near the mobile viewport edge can
    // hide the result. Reveal a new error without changing keyboard focus.
    if (bounds.top < 0 || bounds.bottom > window.innerHeight)
      actionError.current.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [error, action]);
  const [imageInstructions, setImageInstructions] = useState("");
  const [videoInstructions, setVideoInstructions] = useState("");
  const [useOptionalImage, setUseOptionalImage] = useState(!!scene.selectedImageId);
  useEffect(() => { setUseOptionalImage(!!scene.selectedImageId); }, [scene.selectedImageId]);
  const [confirmDelete, setConfirmDelete] = useState<StudioTake>();
  const [replacement, setReplacement] = useState<"image" | "video">();
  const actionLock = useRef(false);
  const mine = jobs.filter(job => job.sceneId === scene.id);
  const imageJob = [...mine].reverse().find(job => job.kind === "image");
  const videoJob = [...mine].reverse().find(job => job.kind === "video");
  const imageWorking = imageJob && ACTIVE.includes(imageJob.status);
  const videoWorking = videoJob && ACTIVE.includes(videoJob.status);
  const images = scene.takes.filter(take => take.kind === "image" && take.status === "complete" && take.url).slice().reverse();
  const videos = scene.takes.filter(take => take.kind === "video" && take.status === "complete" && take.url).slice().reverse();
  const referencesRequired = sceneHasCharacterReferences(state, scene);
  const directVideo = !referencesRequired && (!scene.selectedImageId || !useOptionalImage);
  const imageProblem = directVideo ? undefined : sceneReferenceProblem(state, scene);
  const run = async (name: string, work: () => Promise<boolean>, success: string) => {
    if (actionLock.current) return;
    actionLock.current = true; setAction(name); setPending(name); setError(""); setMessage("");
    try { if (!await work()) throw new Error("The action could not be completed. Please try again."); setMessage(success); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The action failed. Please try again."); }
    finally { actionLock.current = false; setPending(""); }
  };
  const feedback = (name: string) => action === name ? <div className="basis-full" aria-live="polite">
    {pending ? <p role="status" className="film-action-feedback"><Loader2 size={15} className="animate-spin" aria-hidden />{pending.startsWith("delete:") || pending.startsWith("cleanup:") ? "Deleting the take and clearing storage…" : pending.startsWith("select:") ? "Saving your selection…" : pending.startsWith("check:") ? "Checking the scene and character profile…" : pending === "image" ? "Queueing the reference image…" : pending === "video" ? "Queueing the video…" : "Saving…"}</p>
      : error ? <p ref={actionError} role="alert" className="film-action-error"><AlertCircle size={16} aria-hidden />{error}</p>
        : message ? <p role="status" className="film-action-feedback"><Check size={15} aria-hidden />{message}</p> : null}
  </div> : null;
  const select = (take: StudioTake, skipCheck = false) => run(`select:${take.id}`, async () => {
    const problem = take.kind === "image" ? referenceTakeProblem(state, scene, take) : continuityProblem(state, scene, take);
    if (problem && !skipCheck) throw new Error(problem);
    return onSelect(scene.id, take.id, skipCheck);
  }, take.kind === "image" ? skipCheck ? "Image check skipped. Your chosen image will be used for video generation." : "Reference image selected. You can now generate the video." : "Video selected for your story.");
  const rejected = (kind: "image" | "video") => (kind === "image" ? images : videos).filter(take => take.continuity?.status === "failed" && !take.savedForLater && !imageReviewOverridden(state, scene, take));
  const generate = (kind: "image" | "video", deleteRejected?: boolean) => {
    if (kind === "video" && imageProblem) {
      void run("video", async () => { throw new Error(imageProblem); }, "");
      return;
    }
    if (deleteRejected === undefined && rejected(kind).length) { setReplacement(kind); setError(""); setMessage(""); return; }
    setReplacement(undefined);
    void run(kind, async () => {
      if (deleteRejected) for (const take of rejected(kind)) await onDelete(scene.id, take.id);
      else if (deleteRejected === false && rejected(kind).length) await onKeep(scene.id, rejected(kind).map(take => take.id));
      // An unfinished cleanup must be resolved before spending on a replacement.
      if (state.takeDeletions?.some(item => item.sceneId === scene.id && item.kind === kind && item.pending))
        throw new Error("Finish deleting the old take using Retry deletion before generating a replacement.");
      return onSubmit(kind, kind === "image" ? imageInstructions : videoInstructions, kind === "video" ? directVideo : undefined);
    }, kind === "image" ? referencesRequired ? "Reference image queued. Its scene and character checks run when it finishes." : "Optional reference image queued." : !directVideo ? "Video queued using your selected reference image." : "Video queued directly from your scene, without a reference image.");
  };
  const deleteControl = (take: StudioTake) => <>
    <button type="button" className="take-delete-icon" aria-label={`Delete ${take.kind}`} title={`Delete ${take.kind}`} disabled={!!pending} onClick={() => setConfirmDelete(take)}><Trash2 size={16} aria-hidden /></button>
    {confirmDelete?.id === take.id ? <div role="group" aria-label={`Delete ${take.kind} confirmation`} className="mt-2 basis-full text-sm">
      <p>Permanently delete this {take.kind} and its stored file?{take.id === scene.selectedImageId || take.id === scene.selectedVideoId ? " Its current selection will be cleared." : ""}</p>
      <div className="mt-2 flex flex-wrap gap-3"><button type="button" className="guest-pill" disabled={!!pending} onClick={() => void run(`delete:${take.id}`, async () => { await onDelete(scene.id, take.id); setConfirmDelete(undefined); return true; }, `${take.kind === "image" ? "Image" : "Video"} deleted and storage cleared.`)}>Delete permanently</button><button type="button" className="film-text-button" disabled={!!pending} onClick={() => setConfirmDelete(undefined)}>Keep this {take.kind}</button></div>
    </div> : null}
    {feedback(`delete:${take.id}`)}
  </>;
  const replacementChoice = (kind: "image" | "video") => replacement === kind ? <div role="group" aria-label={`Keep or delete old ${kind} takes`} className="mt-3 rounded-lg border border-[var(--line)] p-3 text-sm">
    <p>{rejected(kind).length} old {kind} take{rejected(kind).length === 1 ? " did" : "s did"} not match. Keep {rejected(kind).length === 1 ? "it" : "them"} in saved takes, or delete {rejected(kind).length === 1 ? "it" : "them"} before generating a replacement?</p>
    <p className="film-help">Deleting frees storage. Previous generation credits are not refunded. A new generation uses credits.</p>
    <div className="mt-2 flex flex-wrap gap-3"><button type="button" className="guest-pill" disabled={!!pending} onClick={() => generate(kind, false)}>Keep old {kind}s &amp; generate</button><button type="button" className="guest-pill" disabled={!!pending} onClick={() => generate(kind, true)}>Delete old {kind}s &amp; generate</button><button type="button" className="film-text-button" onClick={() => setReplacement(undefined)}>Cancel</button></div>
  </div> : null;
  const renderJob = (job: SceneJob | undefined) => job && ACTIVE.includes(job.status)
    ? <div role="status" className="flex flex-wrap items-center gap-2 text-sm"><Loader2 size={15} className="animate-spin" aria-hidden />{PHASE[job.phase] ?? "Queued"}…<button type="button" className="film-text-button" disabled={!!pending} onClick={() => void run(`stop:${job.id}`, () => onChange(job.id, "cancel"), "Stop requested.")}><X size={14} aria-hidden /> Stop</button>{feedback(`stop:${job.id}`)}</div>
    : job && ["failed", "needs_attention", "blocked"].includes(job.status)
      ? <div className="film-action-error"><p>{job.error || "Generation stopped."}</p>{job.retryable !== false ? <button type="button" className="guest-pill mt-2" disabled={!!pending} onClick={() => void run(`retry-job:${job.id}`, () => onChange(job.id, "retry"), "Retry queued. The original accepted render will be reused where available.")}><RefreshCw size={14} aria-hidden /> Retry interrupted generation</button> : <p>Check this submission with the provider before requesting another paid render.</p>}{feedback(`retry-job:${job.id}`)}</div> : null;

  return <article className="scene-generation-flow">
    <p className="text-xs text-[var(--muted)]">{scene.visualAction || scene.description}</p>
    <ActionErrorToast message={error && action.startsWith("delete:") && !scene.takes.some(take => action === `delete:${take.id}`) ? error : ""} onDismiss={() => setError("")} />
    {state.takeDeletions?.filter(item => item.sceneId === scene.id && item.pending).map(item => <div key={item.takeId} className="film-action-error" role="status"><p>{item.error || `Storage cleanup for the deleted ${item.kind} is unfinished.`}</p><button type="button" className="guest-pill mt-2" disabled={!!pending} onClick={() => void run(`cleanup:${item.takeId}`, () => onDelete(scene.id, item.takeId), "Deletion finished and storage cleared.")}>Retry deletion</button>{feedback(`cleanup:${item.takeId}`)}</div>)}

    <ReferenceStage sceneId={scene.id} required={referencesRequired}>
      <p className="film-help">{referencesRequired ? "Check the setting, action, props and character appearance. Choose a matching image, or skip the check and use your preferred image." : "An image is optional. Generate a video directly, or create an opening frame here if you prefer."}</p>
      {renderJob(imageJob)}
      {images.length ? <TakeGallery takes={images} selectedId={scene.selectedImageId} kind="image" render={(take, index) => {
        const problem = referenceTakeProblem(state, scene, take);
        const selected = take.id === scene.selectedImageId && !problem;
        const overridden = imageReviewOverridden(state, scene, take);
        return <div key={take.id} className={`scene-reference-option ${selected ? "selected" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={take.url} alt={`Reference image ${images.length - index} for ${scene.title}`} loading="lazy" />
          <TakeReview take={take} required={referencesRequired} overridden={overridden} />
          {problem ? <p id={`reference-problem-${take.id}`} className="film-help">{problem}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="guest-pill" aria-pressed={selected} aria-describedby={problem ? `reference-problem-${take.id}` : undefined} disabled={!!pending} onClick={() => void select(take)}>{selected ? "Using this reference" : pending === `select:${take.id}` ? "Selecting…" : "Use this reference"}</button>
            {referencesRequired && take.continuity?.status !== "passed" && !overridden && !take.stale ? <button type="button" className="guest-pill" disabled={!!pending} onClick={() => void select(take, true)}>Skip check and use this image</button> : null}
            {referencesRequired ? <button type="button" className="film-text-button" disabled={!!pending} onClick={() => void run(`check:${take.id}`, () => onReview(scene.id, take.id), "Check finished. Review the result below the image.")}>{pending === `check:${take.id}` ? "Checking…" : "Retry image check"}</button> : null}
            {deleteControl(take)}
            {feedback(`select:${take.id}`)}{feedback(`check:${take.id}`)}
          </div>
        </div>;
      }} /> : !imageWorking ? <p className="film-help">{referencesRequired ? "No reference image yet. Generate the opening frame for this scene first." : "No reference image selected. You can generate the video without one."}</p> : null}
      <details className="mt-3"><summary className="film-text-button cursor-pointer">Add instructions for the image</summary><label className="mt-2 block text-sm" htmlFor={`image-instructions-${scene.id}`}>Additional image instructions</label><textarea id={`image-instructions-${scene.id}`} className="decision-input mt-2" rows={3} maxLength={4000} value={imageInstructions} onChange={event => setImageInstructions(event.target.value)} placeholder="For example: keep the dark shirt, move the laptop to the left, and match the reference hairstyle." /></details>
      <button type="button" className="decision-next mt-3" disabled={!!pending || !!imageWorking} onClick={() => generate("image")}>
        {pending === "image" || imageWorking ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />}{imageWorking ? "Generating reference image…" : images.length ? "Regenerate image" : "Generate reference image"}
      </button>
      {feedback("image")}
      {replacementChoice("image")}
    </ReferenceStage>

    <section className="scene-media-stage" aria-labelledby={`video-stage-${scene.id}`}>
      <h4 id={`video-stage-${scene.id}`} className="font-semibold">{referencesRequired ? "2. Video" : "Video"}</h4>
      {!referencesRequired && scene.selectedImageId ? <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={useOptionalImage} disabled={!!pending || !!videoWorking} onChange={event => setUseOptionalImage(event.target.checked)} />Use the selected opening image</label> : null}
      {!imageProblem ? !directVideo ? <p className="film-action-feedback"><Check size={15} aria-hidden />Your selected reference image will be used.</p> : <p className="film-help">No character reference uploaded for this scene. Generate the video directly from your script.</p> : null}
      {onScenePatch ? <label className="mt-3 block text-sm">Video length<Select aria-label="Video length" className="decision-input mt-1" value={scene.requestedSeconds ?? state.clipSeconds ?? 5} disabled={!!pending || !!videoWorking} onChange={event => { const seconds = Number(event.target.value); void run("length", () => onScenePatch(scene.id, { requestedSeconds: seconds }), "Video length saved."); }}>{capability.choices.map(choice => <option key={choice.seconds} value={choice.seconds} disabled={!choice.available}>{choice.seconds}s{choice.available ? "" : " — unavailable"}</option>)}</Select></label> : <p className="film-help">Requested length: {item.requestedSeconds.toFixed(1)}s</p>}
      {feedback("length")}
      {scene.beats && scene.beats.length > 1 ? <p className="film-help">{scene.beats.length} shots in one video. Fewer clear actions and cuts improve consistency.</p> : null}
      <SpeechGuidance scene={scene} language={state.language ?? "en"} seconds={item.requestedSeconds} options={capability.options} />
      {renderJob(videoJob)}
      <TakeGallery takes={videos} selectedId={scene.selectedVideoId} kind="video" render={take => <div key={take.id} className="mt-4">
        <video src={take.url} controls preload="metadata" className="w-full rounded-xl" aria-label={`Video take for ${scene.title}`} />
        <p className="film-help">{take.duration ? `${take.duration.toFixed(1)}s measured` : "Finished video"}{take.nativeAudio ? " · audio included" : ""}</p>
        <TakeReview take={take} required={referencesRequired} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button type="button" className="guest-pill" disabled={!!pending} aria-pressed={take.id === scene.selectedVideoId} onClick={() => void select(take)}>{take.id === scene.selectedVideoId ? "Using this video" : "Use this video"}</button>
          {referencesRequired && take.continuity && take.continuity.status !== "passed" ? <button type="button" className="film-text-button" disabled={!!pending} onClick={() => void run(`check:${take.id}`, () => onReview(scene.id, take.id), "Video check finished.")}>Retry video check</button> : null}
          {deleteControl(take)}
          {feedback(`select:${take.id}`)}{feedback(`check:${take.id}`)}
        </div>
      </div>} />
      <details className="mt-3"><summary className="film-text-button cursor-pointer">Add instructions for the video</summary><label className="mt-2 block text-sm" htmlFor={`video-instructions-${scene.id}`}>Additional video instructions</label><textarea id={`video-instructions-${scene.id}`} className="decision-input mt-2" rows={3} maxLength={4000} value={videoInstructions} onChange={event => setVideoInstructions(event.target.value)} placeholder="Describe a clear action, camera movement or sound while preserving the approved image." /></details>
      {imageProblem ? <p id={`video-reference-problem-${scene.id}`} className="film-reference-notice"><AlertCircle size={16} aria-hidden />{imageProblem}</p> : null}
      <button type="button" className="decision-next mt-3" aria-describedby={imageProblem ? `video-reference-problem-${scene.id}` : undefined} disabled={!!pending || !!videoWorking || (state.language ?? "en") === "ur"} onClick={() => generate("video")}>
        {pending === "video" || videoWorking ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Play size={15} aria-hidden />}{videoWorking ? "Generating video…" : videos.length ? "Generate another video" : "Generate video"}
      </button>
      {feedback("video")}
      {replacementChoice("video")}
      <p className="film-help">Generating a new image or video uses provider credits. Retrying an interrupted render reuses its saved request where supported.</p>
    </section>
  </article>;
}

function ReferenceStage({ sceneId, required, children }: { sceneId: string; required: boolean; children: React.ReactNode }) {
  const content = <section className="scene-media-stage" aria-labelledby={`image-stage-${sceneId}`}>
    <h4 id={`image-stage-${sceneId}`} className="font-semibold">{required ? "1. Reference image" : "Reference image (optional)"}</h4>{children}
  </section>;
  return required ? content : <details className="mt-3"><summary className="film-text-button cursor-pointer">Add a reference image (optional)</summary>{content}</details>;
}

function TakeGallery({ takes, selectedId, kind, render }: { takes: StudioTake[]; selectedId?: string; kind: "image" | "video"; render: (take: StudioTake, index: number) => React.ReactNode }) {
  const latest = takes.find(take => !take.savedForLater);
  const visible = takes.filter(take => !take.savedForLater && (take === latest || take.id === selectedId));
  const older = takes.filter(take => !visible.includes(take));
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (!older.length) setExpanded(false); }, [older.length]);
  return <>
    {takes.length > 0 && !visible.length ? <p className="film-help">Your new {kind} will appear here. The old take is kept below.</p> : null}
    <div className={kind === "image" ? "scene-reference-grid" : ""}>{visible.map(take => render(take, takes.indexOf(take)))}</div>
    {older.length ? <details className="mt-3" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary className="film-text-button cursor-pointer">Saved {kind} takes ({older.length})</summary>{expanded ? <div className={kind === "image" ? "scene-reference-grid" : ""}>{older.map(take => render(take, takes.indexOf(take)))}</div> : null}</details> : null}
  </>;
}

function TakeReview({ take, required, overridden = false }: { take: StudioTake; required: boolean; overridden?: boolean }) {
  if (overridden) return <p className="film-action-feedback"><Check size={14} aria-hidden />Image check skipped. You chose to use this image.</p>;
  if (!required) return <p className="film-help">Review this {take.kind} yourself. No character reference check is required.</p>;
  const review = take.continuity;
  if (!review) return <p className="film-help">Scene and character checks have not run. Review this {take.kind} before selecting it.</p>;
  if (review.status === "passed") return <p className="film-action-feedback"><Check size={14} aria-hidden />{review.sceneCheck ? "Scene and character checks passed." : "Character appearance check passed."}</p>;
  return <div className={`take-review-result ${review.status === "failed" ? "mismatch" : ""}`} role={review.status === "failed" || review.status === "error" ? "alert" : "status"}>
    <p className="font-semibold">{review.status === "failed" ? `This ${take.kind} does not match the scene and/or character profile.` : review.status === "pending" ? "Checking scene and character appearance…" : review.status === "error" ? "The check could not finish." : "The scene or character match is uncertain."}</p>
    {review.sceneCheck && review.sceneCheck.verdict !== "match" ? <p>Scene: {review.sceneCheck.notes}</p> : null}
    {review.checks?.filter(check => check.verdict !== "match").map(check => <p key={check.characterId}>{take.identity?.find(identity => identity.characterId === check.characterId)?.name ?? "Character"}: {check.notes}</p>)}
    {review.error ? <p>{review.error}</p> : null}
    {take.kind === "image" ? <p>Retry the check, regenerate with additional instructions, or choose Skip check and use this image.</p> : null}
  </div>;
}
