"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clapperboard,
  Download,
  Film,
  Mic2,
  Music2,
  RefreshCcw
} from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import ScreenLayout from "@/screens/ScreenLayout";
import { loadCreateStoryDraft } from "@/lib/create-story-storage";
import { loadCustomStoryFromDatabase } from "@/lib/custom-story-db";
import { customDraftToMovieScenes } from "@/lib/custom-story-multimedia";
import { AiStoryStudioStepper } from "@/components/ai-story-studio-stepper";
import {
  saveVideoStudioFlow,
  previousVideoStudioStage,
  type VideoStudioFlowState,
} from "@/lib/video-storage";
import type { CreateStoryDraft } from "@/types/create-story";
import { summarizeVideoAudio, summarizeVideoMusic, videoAudioStatus, videoMusicStatus } from "@/lib/video-studio-media-summary";
import { textDirectionForVideoLanguage } from "@/lib/video-language";
import { loadVideoStudioFromDatabase, saveVideoStudioToDatabase } from "@/lib/video-studio-db";
import { SynchronizedStoryPreview } from "@/components/synchronized-story-preview";

export default function VideoPreviewScreen() {
  const router = useRouter();
  const [createDraft, setCreateDraft] = useState<CreateStoryDraft | null>(null);
  const [videoFlow, setVideoFlow] = useState<VideoStudioFlowState | null>(null);
  const [restoreState, setRestoreState] = useState<"loading" | "ready" | "missing" | "invalid">("loading");
  const [guidedSaveState, setGuidedSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const restoredAudioSummary = useMemo(
    () => summarizeVideoAudio(videoFlow?.script?.scenes ?? []),
    [videoFlow?.script?.scenes]
  );
  const restoredMusicSummary = useMemo(
    () => summarizeVideoMusic(videoFlow?.script?.scenes ?? []),
    [videoFlow?.script?.scenes]
  );

  useEffect(() => {
    const previewMode = new URLSearchParams(window.location.search).get("mode");
    const requestedProjectId = new URLSearchParams(window.location.search).get("project")?.trim();
    const loadedCreateDraft = loadCreateStoryDraft();

    setCreateDraft(loadedCreateDraft);

    if (previewMode === "custom") {
      if (!requestedProjectId) {
        setVideoFlow(null);
        setRestoreState("ready");
        return;
      }
      if (!/^[0-9a-f-]{36}$/i.test(requestedProjectId)) {
        setRestoreState("invalid");
        return;
      }
      void loadCustomStoryFromDatabase(requestedProjectId).then((databaseDraft) => {
        if (databaseDraft?.projectId === requestedProjectId) {
          setCreateDraft(databaseDraft);
          setVideoFlow(null);
          setRestoreState("ready");
          return;
        }
        setRestoreState("missing");
      });
      return;
    }

    if (previewMode === "guided") {
      if (!requestedProjectId) {
        // Guided media preview is database-backed. A cache-only fallback can
        // show an older project after account/project changes.
        setVideoFlow(null);
        setRestoreState("missing");
        return;
      }
      if (!/^[0-9a-f-]{36}$/i.test(requestedProjectId)) {
        setVideoFlow(null);
        setRestoreState("invalid");
        return;
      }
      // The database is authoritative. Never use a different project's
      // browser cache as a fallback for an explicit preview project.
      void loadVideoStudioFromDatabase(requestedProjectId).then((databaseFlow) => {
        if (databaseFlow?.projectId === requestedProjectId) {
          saveVideoStudioFlow(databaseFlow);
          setVideoFlow(databaseFlow);
          setRestoreState("ready");
          return;
        }
        setVideoFlow(null);
        setRestoreState("missing");
      });
      return;
    }

    // There is no safe canonical Guided project to restore from a bare legacy
    // preview URL. Callers must provide an explicit mode and owned project id.
    setVideoFlow(null);
    setRestoreState("missing");
  }, []);

  const persistGuidedPreview = async (nextFlow: VideoStudioFlowState) => {
    if (!nextFlow.projectId || !nextFlow.draftId || !nextFlow.script) return false;
    setGuidedSaveState("saving");
    const saved = await saveVideoStudioToDatabase(nextFlow);
    if (!saved.success) {
      setGuidedSaveState("failed");
      return false;
    }
    saveVideoStudioFlow(nextFlow);
    setVideoFlow(nextFlow);
    setGuidedSaveState("saved");
    return true;
  };

  const saveGuidedPreview = async () => {
    if (!videoFlow) return;
    await persistGuidedPreview({ ...videoFlow, stage: "preview" });
  };

  const returnToGuidedStudio = async () => {
    if (!videoFlow?.projectId) return;
    if (await persistGuidedPreview({ ...videoFlow, stage: "preview" })) {
      router.push(`/video?project=${encodeURIComponent(videoFlow.projectId)}`);
    }
  };

  const goToPreviousGuidedStep = async () => {
    if (!videoFlow?.projectId) return;
    const previous = previousVideoStudioStage("preview");
    if (!previous) return;
    const nextFlow = { ...videoFlow, stage: previous, returnStage: undefined };
    if (await persistGuidedPreview(nextFlow)) {
      router.push(`/video?project=${encodeURIComponent(videoFlow.projectId)}`);
    }
  };

  if (restoreState === "loading") {
    return <ProtectedRoute><ScreenLayout eyebrow="Guided Video Studio" title="Restoring Video Preview" description="Loading the saved project and its media state."><div className="glass-panel rounded-[1.5rem] p-6 text-sm text-white/70">Restoring your authorized Video Studio project…</div></ScreenLayout></ProtectedRoute>;
  }

  if (restoreState === "invalid" || restoreState === "missing") {
    return <ProtectedRoute><ScreenLayout eyebrow="Guided Video Studio" title="Preview unavailable" description={restoreState === "invalid" ? "The requested project link is invalid." : "This project could not be restored. It may be unavailable, belong to another account, or require you to sign in."}><button type="button" onClick={() => router.push("/dashboard")} className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white">Return to Dashboard</button></ScreenLayout></ProtectedRoute>;
  }

  if (videoFlow?.script) {
    return (
      <ProtectedRoute>
        <ScreenLayout
          eyebrow="Guided Video Studio"
          title="Video Preview"
          description="Play the saved story sequence in your browser. This is a synchronized preview only; final MP4 rendering remains unavailable."
          maxWidth="max-w-6xl"
        >
          <section className="glass-panel rounded-[2rem] p-5 sm:p-7">
            <SynchronizedStoryPreview
              scenes={videoFlow.script.scenes}
              language={videoFlow.language}
              projectKey={videoFlow.projectId}
            />

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <PreviewStat label="Story title" value={videoFlow.script.title} rtl={videoFlow.language === "ur"} />
              <PreviewStat label="Scenes" value={String(videoFlow.script.scenes.length)} />
              <PreviewStat
                label="Audio status"
                value={`${videoAudioStatus(restoredAudioSummary, videoFlow.voiceNeedsRegeneration)} (${restoredAudioSummary.narrationClips} narration, ${restoredAudioSummary.dialogueClips} dialogue clips)`}
              />
              <PreviewStat
                label="Music status"
                value={videoMusicStatus(restoredMusicSummary)}
              />
            </div>

            {guidedSaveState === "failed" ? <p role="alert" className="mt-5 rounded-xl border border-red-300/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">Could not save the project. Preview remains open and your existing saved media was not changed.</p> : null}
            {guidedSaveState === "saved" ? <p role="status" className="mt-5 rounded-xl border border-emerald-300/35 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">Project changes saved.</p> : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                disabled
                title="Browser preview is available; MP4 export is not implemented."
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/45"
              >
                <Download className="h-4 w-4" />
                MP4 Export Unavailable
              </button>
              <button
                type="button"
                onClick={() => void goToPreviousGuidedStep()}
                disabled={guidedSaveState === "saving"}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-gold/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" />
                Previous Step
              </button>
              <button
                type="button"
                onClick={() => void saveGuidedPreview()}
                disabled={guidedSaveState === "saving"}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-starlight/20 bg-starlight/10 px-5 py-3 text-sm font-semibold text-starlight transition hover:bg-starlight/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Music2 className="h-4 w-4" />
                {guidedSaveState === "saving" ? "Saving Changes…" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => void returnToGuidedStudio()}
                disabled={guidedSaveState === "saving"}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCcw className="h-4 w-4" />
                Back to Video Studio
              </button>
            </div>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            {videoFlow.script.scenes.map((scene) => (
              <article
                key={scene.sceneNumber}
                className="glass-panel rounded-[1.4rem] p-5"
              >
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-gold" />
                  <p className="text-xs uppercase tracking-[0.24em] text-gold">
                    Scene {scene.sceneNumber}
                  </p>
                  <span className="rounded-full bg-starlight/10 px-2 py-0.5 text-xs text-starlight">
                    {scene.sceneTone}
                  </span>
                </div>
                {scene.generatedImageUrl && (
                  <div className="mb-3 overflow-hidden rounded-xl border border-white/10 h-36 w-full">
                    <img src={scene.generatedImageUrl} alt={scene.title} className="h-full w-full object-cover" />
                  </div>
                )}
                <h3 dir={textDirectionForVideoLanguage(videoFlow.language)} className={`text-lg font-semibold text-white ${videoFlow.language === "ur" ? "text-right" : ""}`}>{scene.title}</h3>
                <p dir={textDirectionForVideoLanguage(videoFlow.language)} className={`mt-3 text-sm leading-7 text-white/90 ${videoFlow.language === "ur" ? "text-right" : ""}`}>{scene.narration}</p>
              </article>
            ))}
          </section>
        </ScreenLayout>
      </ProtectedRoute>
    );
  }

  return <CreateStoryPreview draft={createDraft} />;
}

function CreateStoryPreview({ draft }: { draft: CreateStoryDraft | null }) {
  const router = useRouter();
  const audioStatus = useMemo(() => {
    if (!draft) return "No audio draft found";

    return `Voices: ${draft.audio.voiceStatus}. Background music: ${draft.audio.backgroundMusicStatus}.`;
  }, [draft]);
  const previewScenes = useMemo(() => draft ? customDraftToMovieScenes(draft) : [], [draft]);

  if (!draft) {
    return (
      <ProtectedRoute>
        <ScreenLayout
          eyebrow="AI Story Studio"
          title="Loading Video Preview"
          description="Restoring your custom story preview."
        >
          <div className="glass-panel rounded-[1.5rem] p-6 text-sm text-white/70">
            Opening video preview...
          </div>
        </ScreenLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <ScreenLayout
        eyebrow="AI Story Studio"
        title="Video Preview"
        description="Play your saved Custom story in the browser. This is a synchronized preview only; final MP4 rendering remains unavailable."
        maxWidth="max-w-6xl"
      >
        <AiStoryStudioStepper currentStep={5} />
        <section className="glass-panel rounded-[2rem] p-5 sm:p-7">
          <SynchronizedStoryPreview scenes={previewScenes} language={draft.language} projectKey={draft.projectId || draft.clientImportId} />

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <PreviewStat label="Story title" value={draft.storyTitle} />
            <PreviewStat label="Scenes" value={String(draft.scenes.length)} />
            <PreviewStat label="Audio status" value={audioStatus} />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              disabled
              title="Browser preview is available; MP4 export is not implemented."
              className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/45"
            >
              <Download className="h-4 w-4" />
              MP4 Export Unavailable
            </button>
            <button
              type="button"
              onClick={() => router.push(`/story-builder${draft.projectId ? `?project=${encodeURIComponent(draft.projectId)}` : ""}`)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-gold/25 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Edit Story
            </button>
            <button
              type="button"
              onClick={() => router.push(`/audio-generation${draft.projectId ? `?project=${encodeURIComponent(draft.projectId)}` : ""}`)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-starlight/20 bg-starlight/10 px-5 py-3 text-sm font-semibold text-starlight transition hover:bg-starlight/15"
            >
              <Mic2 className="h-4 w-4" />
              Back to Audio Page
            </button>
            <button
              type="button"
              onClick={() => router.push("/story/mode")}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-5 py-3 text-sm font-semibold text-gold transition hover:bg-gold/15"
            >
              <RefreshCcw className="h-4 w-4" />
              New Story Mode
            </button>
          </div>
        </section>

        <section className="mt-6 grid gap-4 lg:grid-cols-2">
          {draft.scenes.map((scene) => (
            <article
              key={scene.sceneNumber}
              className="glass-panel rounded-[1.4rem] p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.24em] text-starlight/80">
                  Scene {scene.sceneNumber}
                </p>
                <span className="text-xs text-white/70">{(scene as any).estimatedDuration || ""}</span>
              </div>
              {(scene as any).generatedImageUrl && (
                <div className="mb-3 overflow-hidden rounded-xl border border-white/10 h-36 w-full">
                  <img src={(scene as any).generatedImageUrl} alt={scene.title} className="h-full w-full object-cover" />
                </div>
              )}
              <h3 className="text-lg font-semibold text-white">{scene.title}</h3>
              <p className="mt-3 text-sm leading-7 text-white/90">
                {scene.storyDescription || scene.selectedSuggestion}
              </p>
            </article>
          ))}
        </section>
      </ScreenLayout>
    </ProtectedRoute>
  );
}

function VideoFrame({ imageUrl }: { imageUrl?: string }) {
  return (
    <div className="relative mx-auto flex min-h-[22rem] max-w-4xl items-center justify-center overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/35 p-8 text-center">
      {imageUrl && (
        <img src={imageUrl} alt="Video preview background" className="absolute inset-0 h-full w-full object-cover opacity-40 blur-xs" />
      )}
      <div className="relative z-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.2rem] border border-gold/20 bg-gold/10 text-gold">
          <Film className="h-8 w-8" />
        </div>
        <h2 className="mt-6 font-[var(--font-heading)] text-3xl text-white">
          Generated video preview will appear here
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/90">
          The final render will be connected after backend video generation is ready.
        </p>
      </div>
    </div>
  );
}

function PreviewStat({ label, value, rtl = false }: { label: string; value: string; rtl?: boolean }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/75">{label}</p>
      <p dir={rtl ? "rtl" : undefined} className={`mt-2 text-sm font-semibold leading-6 text-white ${rtl ? "text-right" : ""}`}>{value}</p>
    </div>
  );
}
