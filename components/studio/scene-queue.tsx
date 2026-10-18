"use client";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  GitBranch,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";
import { ContinuityCheck } from "./continuity-check";
import { continuityProblem } from "@/lib/studio/identity";
import type {
  SceneJob,
  SceneThread,
  StudioState,
  StudioTake,
} from "@/types/studio";

export type SceneQueueHandle = {
  submit: (
    text: string,
    options?: {
      kind?: "image" | "video" | "chat";
      sceneId?: string;
      direct?: boolean;
    },
  ) => Promise<boolean>;
};
type Props = {
  projectId: string | null;
  state: StudioState;
  sceneId: string;
  thread: SceneThread | null;
  onThread: (thread: SceneThread | null) => void;
  onScene: (id: string) => void;
  onDraft: (text: string) => void;
  ensureProject: () => Promise<string>;
  onState: (id: string, state: StudioState) => void;
  onSelect: (sceneId: string, take: StudioTake) => void;
  onReview: (sceneId: string, take: StudioTake) => void;
  onSubmitting: (busy: boolean) => void;
  onError: (message: string) => void;
};
const active = ["queued", "waiting", "running"];
export const SceneQueue = forwardRef<SceneQueueHandle, Props>(
  function SceneQueue(props, ref) {
    const [jobs, setJobs] = useState<SceneJob[]>([]);
    const [threads, setThreads] = useState<SceneThread[]>([]);
    const [fetchError, setFetchError] = useState("");
    const submitting = useRef(false);
    const request = useRef<{ key: string; id: string } | null>(null);
    const alive = useRef(true);
    const latest = useRef(props);
    latest.current = props;
    const load = useCallback(async (id: string) => {
      const response = await fetch(`/api/studio/${id}/jobs`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Could not load scene jobs.");
      if (!alive.current || latest.current.projectId !== id) return;
      setJobs(data.jobs || []);
      setThreads(data.threads || []);
      setFetchError("");
      if (data.state) latest.current.onState(id, data.state);
    }, []);
    useEffect(() => {
      alive.current = true;
      if (!props.projectId) return;
      void load(props.projectId).catch((error) => setFetchError(error.message));
      const timer = setInterval(() => {
        if (!document.hidden)
          void load(props.projectId!).catch((error) => {
            if (alive.current) setFetchError(error.message);
          });
      }, 2500);
      return () => {
        alive.current = false;
        clearInterval(timer);
      };
    }, [props.projectId, load]);
    useImperativeHandle(
      ref,
      () => ({
        submit: async (text, options = {}) => {
          if (submitting.current) return false;
          submitting.current = true;
          latest.current.onSubmitting(true);
          latest.current.onError("");
          const p = latest.current;
          const payload = {
            text,
            sceneId: options.sceneId || p.thread?.sceneId || p.sceneId,
            threadId: p.thread?.id || undefined,
            parentTakeId: !p.thread?.id
              ? p.thread?.parentTakeId || undefined
              : undefined,
            parentJobId: !p.thread?.id
              ? p.thread?.parentJobId || undefined
              : undefined,
            ...options,
          };
          const key = JSON.stringify(payload);
          if (request.current?.key !== key)
            request.current = { key, id: crypto.randomUUID() };
          try {
            const id = await p.ensureProject();
            const response = await fetch(`/api/studio/${id}/jobs`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "submit",
                requestId: request.current.id,
                ...payload,
              }),
            });
            const data = await response.json();
            if (!response.ok || !data.job)
              throw new Error(data.error || "The scene job was not accepted.");
            request.current = null;
            if (p.thread && !p.thread.id)
              p.onThread({ ...p.thread, id: data.job.threadId });
            if (alive.current)
              setJobs((current) =>
                current.some((job) => job.id === data.job.id)
                  ? current
                  : [...current, data.job],
              );
            await load(id).catch((error) => setFetchError(error.message));
            return true;
          } catch (error) {
            p.onError(
              error instanceof Error
                ? error.message
                : "Could not queue this scene.",
            );
            return false;
          } finally {
            submitting.current = false;
            latest.current.onSubmitting(false);
          }
        },
      }),
      [load],
    );
    async function control(job: SceneJob, action: "retry" | "cancel") {
      try {
        const response = await fetch(`/api/studio/${props.projectId}/jobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, jobId: job.id }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        await load(props.projectId!);
      } catch (error) {
        props.onError(
          error instanceof Error ? error.message : "Could not update this job.",
        );
      }
    }
    const displayed = props.thread
      ? jobs.filter(
          (job) => !!props.thread!.id && job.threadId === props.thread!.id,
        )
      : jobs;
    return (
      <section
        className="scene-queue"
        aria-label="Parallel scene conversations"
      >
        <div className="scene-queue-heading">
          <div>
            <strong>
              {props.thread ? props.thread.title : "Your scene conversations"}
            </strong>
            <p>
              {props.thread
                ? "This thread keeps its parent take and accumulated directions."
                : "Queue another scene while your takes are being created."}
            </p>
          </div>
          <span className="scene-queue-count">
            {jobs.filter((job) => active.includes(job.status)).length} pending
          </span>
        </div>
        {props.thread && (
          <button className="studio-btn" onClick={() => props.onThread(null)}>
            <ArrowLeft />
            Back to all scenes
          </button>
        )}
        {fetchError && (
          <p className="studio-error" role="alert">
            {fetchError}
            <button
              className="studio-icon"
              aria-label="Retry loading scene jobs"
              onClick={() =>
                props.projectId &&
                void load(props.projectId).catch((error) =>
                  setFetchError(error.message),
                )
              }
            >
              <RefreshCw />
            </button>
          </p>
        )}
        {!jobs.length && !fetchError && (
          <p className="studio-muted">
            Try “Generate Scene 1,” then request another scene. Select “Refine
            this take” to open a revision thread.
          </p>
        )}
        {props.thread && !props.thread.id && (
          <p className="scene-thread-note">
            <GitBranch />A new branch will be created when you send your edit.
            The parent take stays available.
          </p>
        )}
        {displayed.map((job) => {
          const scene = props.state.scenes.find(
            (scene) => scene.id === job.sceneId,
          );
          const saved = job.result?.take;
          const take =
            scene?.takes.find((take) => take.id === saved?.id) || saved;
          const problem =
            scene && take
              ? continuityProblem(props.state, scene, take)
              : undefined;
          const metadata = threads.find((thread) => thread.id === job.threadId);
          return (
            <article
              key={job.id}
              className="scene-job"
              aria-label={`${scene?.title || "Scene"} ${job.kind} job`}
            >
              <header>
                <div>
                  <small>
                    {scene?.title || "Earlier scene"} · {job.kind}
                  </small>
                  <p>{job.text}</p>
                </div>
                <span className={`scene-job-status ${job.status}`}>
                  {active.includes(job.status) && (
                    <Loader2 className="studio-spinner" />
                  )}
                  {job.status === "running"
                    ? job.phase === "prepare"
                      ? "Directing"
                      : job.phase === "poll"
                        ? "Rendering"
                        : job.phase === "review"
                          ? "Checking appearance"
                          : job.phase === "publish"
                            ? "Saving take"
                            : "Submitting"
                    : job.status.replaceAll("_", " ")}
                </span>
              </header>
              {job.dependsOnId && job.status === "waiting" && (
                <p className="studio-muted">
                  Waiting for its parent job. Other independent scenes can
                  continue.
                </p>
              )}
              {job.result?.reply && (
                <p className="scene-job-reply">{job.result.reply}</p>
              )}
              {take?.url &&
                (take.kind === "image" ? (
                  <img
                    className="scene-job-media"
                    alt={`${scene?.title || "Scene"} revision take`}
                    src={`/api/studio/${props.projectId}/media?jobId=${job.id}`}
                  />
                ) : (
                  <video
                    className="scene-job-media"
                    controls
                    playsInline
                    preload="metadata"
                    src={`/api/studio/${props.projectId}/media?jobId=${job.id}`}
                  />
                ))}
              {job.result?.choices?.map((choice) => (
                <button
                  className="scene-job-choice"
                  key={choice.label}
                  onClick={() => {
                    props.onThread(
                      metadata || {
                        id: job.threadId,
                        sceneId: job.sceneId,
                        title: scene?.title || "Scene thread",
                      },
                    );
                    props.onScene(job.sceneId);
                    props.onDraft(choice.message);
                    document
                      .querySelector<HTMLTextAreaElement>(
                        ".studio-composer textarea",
                      )
                      ?.focus();
                  }}
                >
                  <strong>{choice.label}</strong>
                  {choice.description && <span>{choice.description}</span>}
                  <ArrowUpRight />
                </button>
              ))}
              {job.error && <p className="scene-job-error">{job.error}</p>}
              {job.cancelRequested && active.includes(job.status) && (
                <p className="studio-muted">
                  Cancellation requested. An already accepted provider render
                  will finish and remain available.
                </p>
              )}
              {take && scene && (
                <ContinuityCheck
                  take={take}
                  busy={false}
                  problem={problem}
                  onReview={() => props.onReview(scene.id, take)}
                />
              )}
              <footer>
                {take?.status === "complete" && scene && (
                  <button
                    className="studio-btn primary"
                    disabled={!!problem}
                    onClick={() => props.onSelect(scene.id, take)}
                  >
                    {take.kind === "video"
                      ? scene.selectedVideoId === take.id &&
                        props.state.timeline.includes(scene.id)
                        ? "In your film"
                        : "Add to film"
                      : scene.selectedImageId === take.id
                        ? "Image selected"
                        : "Use this image"}
                  </button>
                )}
                {job.kind !== "chat" &&
                  !["failed", "stale", "cancelled", "needs_attention"].includes(
                    job.status,
                  ) && (
                    <button
                      className="studio-btn"
                      onClick={() => {
                        props.onScene(job.sceneId);
                        props.onThread({
                          id: "",
                          sceneId: job.sceneId,
                          title: `${scene?.title || "Scene"} · ${take?.kind || job.kind} revision`,
                          parentTakeId: take?.id,
                          parentJobId: job.id,
                        });
                        document
                          .querySelector<HTMLTextAreaElement>(
                            ".studio-composer textarea",
                          )
                          ?.focus();
                      }}
                    >
                      <GitBranch />
                      {take ? "Refine this take" : "Refine when ready"}
                    </button>
                  )}
                {!props.thread && (
                  <button
                    className="studio-btn"
                    onClick={() => {
                      props.onScene(job.sceneId);
                      props.onThread(
                        metadata || {
                          id: job.threadId,
                          sceneId: job.sceneId,
                          title: scene?.title || "Scene thread",
                        },
                      );
                    }}
                  >
                    Open thread
                  </button>
                )}
                {active.includes(job.status) && !job.cancelRequested && (
                  <button
                    className="studio-btn"
                    onClick={() => void control(job, "cancel")}
                  >
                    <X />
                    Cancel queued work
                  </button>
                )}
                {["failed", "blocked"].includes(job.status) &&
                  job.phase !== "submitting" && (
                    <button
                      className="studio-btn"
                      onClick={() => void control(job, "retry")}
                    >
                      <RefreshCw />
                      Retry saved job
                    </button>
                  )}
              </footer>
              {take && (
                <details>
                  <summary>Take requirements and source</summary>
                  <p>{take.prompt}</p>
                  <p>Source take: {take.parentTakeId || "Original scene"}</p>
                </details>
              )}
            </article>
          );
        })}
      </section>
    );
  },
);
