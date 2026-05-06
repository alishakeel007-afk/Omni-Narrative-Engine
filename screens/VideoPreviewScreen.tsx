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
import { AiStoryStudioStepper } from "@/components/ai-story-studio-stepper";
import {
  loadVideoStudioFlow,
  saveVideoStudioFlow,
  type VideoStudioFlowState,
  type VideoStudioStage
} from "@/lib/video-storage";
import type { CreateStoryDraft } from "@/types/create-story";

export default function VideoPreviewScreen() {
  const router = useRouter();
  const [createDraft, setCreateDraft] = useState<CreateStoryDraft | null>(null);
  const [videoFlow, setVideoFlow] = useState<VideoStudioFlowState | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const previewMode = new URLSearchParams(window.location.search).get("mode");
    const loadedVideoFlow = loadVideoStudioFlow();
    const loadedCreateDraft = loadCreateStoryDraft();

    setCreateDraft(loadedCreateDraft);

    if (previewMode === "custom") {
      setVideoFlow(null);
      return;
    }

    if (previewMode === "guided") {
      setVideoFlow(loadedVideoFlow.script ? loadedVideoFlow : null);
      return;
    }

    setVideoFlow(
      loadedCreateDraft.video.status === "ready"
        ? null
        : loadedVideoFlow.script
          ? loadedVideoFlow
          : null
    );
  }, []);

  const openVideoStage = (stage: VideoStudioStage) => {
    const currentFlow = loadVideoStudioFlow();
    saveVideoStudioFlow({
      ...currentFlow,
      stage
    });
    router.push("/video");
  };

  if (videoFlow?.script) {
    return (
      <ProtectedRoute>
        <ScreenLayout
          eyebrow="Guided Video Studio"
          title="Video Preview"
          description="The real video backend is not connected yet. Your generated story, dialogues, voices, and music status stay saved while you edit backward."
          maxWidth="max-w-6xl"
        >
          <section className="glass-panel rounded-[2rem] p-5 sm:p-7">
            <VideoFrame />

            <div className="mt-6 grid gap-4 md:grid-cols-4">
              <PreviewStat label="Story title" value={videoFlow.script.title} />
              <PreviewStat label="Scenes" value={String(videoFlow.script.scenes.length)} />
              <PreviewStat
                label="Audio status"
                value={
                  videoFlow.voiceNeedsRegeneration
                    ? "Voice needs regeneration"
                    : videoFlow.voiceResult
                      ? `Ready (${videoFlow.voiceResult.audio.generatedCount} clips)`
                      : "Not generated"
                }
              />
              <PreviewStat
                label="Music status"
                value={
                  videoFlow.music.status === "ready"
                    ? videoFlow.music.title || "Ready"
                    : videoFlow.music.status
                }
              />
            </div>

            {notice ? (
              <div className="mt-5 rounded-[1rem] border border-starlight/20 bg-starlight/10 px-4 py-3 text-sm text-starlight">
                {notice}
              </div>
            ) : null}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                onClick={() =>
                  setNotice("Video download will be available after backend integration.")
                }
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/55"
              >
                <Download className="h-4 w-4" />
                Download Video
              </button>
              <button
                type="button"
                onClick={() => openVideoStage("scenes")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-gold/25 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Edit Dialogues
              </button>
              <button
                type="button"
                onClick={() => openVideoStage("music")}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-starlight/20 bg-starlight/10 px-5 py-3 text-sm font-semibold text-starlight transition hover:bg-starlight/15"
              >
                <Music2 className="h-4 w-4" />
                Back to Audio & Music
              </button>
              <button
                type="button"
                onClick={() => openVideoStage("setup")}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01]"
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
                <h3 className="text-lg font-semibold text-white">{scene.title}</h3>
                <p className="mt-3 text-sm leading-7 text-white/64">{scene.narration}</p>
              </article>
            ))}
          </section>
        </ScreenLayout>
      </ProtectedRoute>
    );
  }

  return <CreateStoryPreview draft={createDraft} notice={notice} setNotice={setNotice} />;
}

function CreateStoryPreview({
  draft,
  notice,
  setNotice
}: {
  draft: CreateStoryDraft | null;
  notice: string;
  setNotice: (value: string) => void;
}) {
  const router = useRouter();
  const audioStatus = useMemo(() => {
    if (!draft) return "No audio draft found";

    return `Voices: ${draft.audio.voiceStatus}. Background music: ${draft.audio.backgroundMusicStatus}.`;
  }, [draft]);

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
        description="The video backend is intentionally not connected yet. This page preserves the final preview step and all navigation."
        maxWidth="max-w-6xl"
      >
        <AiStoryStudioStepper currentStep={5} />
        <section className="glass-panel rounded-[2rem] p-5 sm:p-7">
          <VideoFrame />

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <PreviewStat label="Story title" value={draft.storyTitle} />
            <PreviewStat label="Scenes" value={String(draft.scenes.length)} />
            <PreviewStat label="Audio status" value={audioStatus} />
          </div>

          {notice ? (
            <div className="mt-5 rounded-[1rem] border border-starlight/20 bg-starlight/10 px-4 py-3 text-sm text-starlight">
              {notice}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              type="button"
              onClick={() =>
                setNotice("Video download will be available after backend integration.")
              }
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-5 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01]"
            >
              <Download className="h-4 w-4" />
              Download Video
            </button>
            <button
              type="button"
              onClick={() => router.push("/story-builder")}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-gold/25 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Edit Story
            </button>
            <button
              type="button"
              onClick={() => router.push("/audio-generation")}
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
              key={scene.id}
              className="glass-panel rounded-[1.4rem] p-5"
            >
              <div className="mb-3 flex items-center gap-2">
                <Clapperboard className="h-4 w-4 text-gold" />
                <p className="text-xs uppercase tracking-[0.24em] text-gold">
                  Scene {scene.sceneNumber}
                </p>
              </div>
              <h3 className="text-lg font-semibold text-white">{scene.title}</h3>
              <p className="mt-3 text-sm leading-7 text-white/64">
                {scene.storyDescription || scene.selectedSuggestion}
              </p>
            </article>
          ))}
        </section>
      </ScreenLayout>
    </ProtectedRoute>
  );
}

function VideoFrame() {
  return (
    <div className="mx-auto flex min-h-[22rem] max-w-4xl items-center justify-center rounded-[1.6rem] border border-white/10 bg-black/35 p-8 text-center">
      <div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.2rem] border border-gold/20 bg-gold/10 text-gold">
          <Film className="h-8 w-8" />
        </div>
        <h2 className="mt-6 font-[var(--font-heading)] text-3xl text-white">
          Generated video preview will appear here
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-white/64">
          The final render will be connected after backend video generation is ready.
        </p>
      </div>
    </div>
  );
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
      <p className="text-xs uppercase tracking-[0.2em] text-white/42">{label}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-white">{value}</p>
    </div>
  );
}
