"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  Mic2,
  RefreshCcw,
  Sparkles
} from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import {
  VIDEO_DRAFT_STORAGE_KEY,
  VIDEO_VOICE_RESULT_STORAGE_KEY
} from "@/lib/video-storage";
import type { MovieScene, VideoGenerationResponse } from "@/types/video";

export default function VideoVoiceScreen() {
  const [draft, setDraft] = useState<VideoGenerationResponse | null>(null);
  const [result, setResult] = useState<VideoGenerationResponse | null>(null);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const hasStarted = useRef(false);

  const generateVoices = useCallback(async (script: VideoGenerationResponse) => {
    setIsGenerating(true);
    setError("");

    try {
      const response = await fetch("/api/video/tts", {
        body: JSON.stringify({ script }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Voice generation failed.");
      }

      const nextResult = payload as VideoGenerationResponse;
      setResult(nextResult);
      window.localStorage.setItem(VIDEO_VOICE_RESULT_STORAGE_KEY, JSON.stringify(nextResult));
    } catch (voiceError) {
      setError(
        voiceError instanceof Error
          ? voiceError.message
          : "Voice generation failed."
      );
    } finally {
      setIsGenerating(false);
    }
  }, []);

  useEffect(() => {
    try {
      const rawDraft = window.localStorage.getItem(VIDEO_DRAFT_STORAGE_KEY);

      if (!rawDraft) {
        return;
      }

      const parsedDraft = JSON.parse(rawDraft) as VideoGenerationResponse;
      setDraft(parsedDraft);

      if (!hasStarted.current) {
        hasStarted.current = true;
        void generateVoices(parsedDraft);
      }
    } catch {
      window.localStorage.removeItem(VIDEO_DRAFT_STORAGE_KEY);
    }
  }, [generateVoices]);

  const visibleResult = result ?? draft;
  const generatedCount = result?.audio.generatedCount ?? 0;
  const totalDialogueLines =
    visibleResult?.scenes.reduce((total, scene) => total + scene.dialogues.length, 0) ?? 0;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-300">
                <Mic2 className="h-4 w-4" />
                Step 2: Deepgram TTS
              </div>
              <h1 className="mt-4 font-[var(--font-heading)] text-4xl font-bold text-white sm:text-5xl">
                Voice Generation
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                This page converts the confirmed dialogue from Step 1 into speech. Script edits stay locked here so voice generation uses the exact approved text.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/video"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition hover:border-cyan-300/35 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Edit Script
              </Link>
              {draft ? (
                <button
                  type="button"
                  onClick={() => generateVoices(draft)}
                  disabled={isGenerating}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                  Generate Voices Again
                </button>
              ) : null}
            </div>
          </div>

          {!visibleResult ? (
            <div className="glass-panel flex min-h-[28rem] items-center justify-center rounded-[2rem] p-8 text-center">
              <div>
                <Sparkles className="mx-auto h-10 w-10 text-gold" />
                <h2 className="mt-5 text-2xl font-semibold text-white">No confirmed film sequence found</h2>
                <p className="mt-3 text-sm text-white/90">
                  Generate and confirm a script in Video Studio before creating voices.
                </p>
                <Link
                  href="/video"
                  className="mt-6 inline-flex rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 px-6 py-3 text-sm font-bold text-white"
                >
                  Open Video Studio
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <section className="glass-panel rounded-[2rem] p-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">Confirmed Film</p>
                    <h2 className="mt-3 font-[var(--font-heading)] text-3xl text-white">{visibleResult.title}</h2>
                    <p className="mt-4 text-sm leading-7 text-white/70">{visibleResult.logline}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Scenes" value={String(visibleResult.scenes.length)} />
                    <Stat label="Dialogue" value={String(totalDialogueLines)} />
                    <Stat label="Voiced" value={String(generatedCount)} />
                    <Stat label="Provider" value="Deepgram" />
                  </div>
                </div>

                {isGenerating ? (
                  <div className="mt-6 rounded-[1.4rem] border border-cyan-400/20 bg-cyan-400/10 p-5">
                    <div className="flex items-center gap-3 text-cyan-100">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <p className="text-sm font-semibold">Converting dialogue into speech...</p>
                    </div>
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-6 flex gap-3 rounded-[1.4rem] border border-red-500/30 bg-red-500/10 p-5 text-sm leading-6 text-red-200">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                    <span>{error}</span>
                  </div>
                ) : null}

                {result?.audio.errors.length ? (
                  <div className="mt-6 rounded-[1.4rem] border border-gold/20 bg-gold/10 p-5 text-sm leading-7 text-white/70">
                    {result.audio.errors[0]}
                  </div>
                ) : null}
              </section>

              {visibleResult.scenes.map((scene) => (
                <VoiceSceneCard key={`${visibleResult.id}-${scene.sceneNumber}`} scene={scene} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/75">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function VoiceSceneCard({ scene }: { scene: MovieScene }) {
  return (
    <article className="glass-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-white/10 bg-white/[0.03] p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
            Scene {scene.sceneNumber}
          </span>
          <span className="rounded-full border border-starlight/20 bg-starlight/10 px-3 py-1 text-xs text-starlight">
            {scene.mood}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/90">
            {scene.sceneTone}
          </span>
        </div>
        <h3 className="font-[var(--font-heading)] text-2xl text-white">{scene.title}</h3>
        <p className="mt-2 text-sm text-white/85">{scene.location}</p>
      </div>

      <div className="grid gap-5 p-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <ReadOnlyBlock label="Narration" text={scene.narration} />
          <ReadOnlyBlock label="Sound Design" text={scene.soundDesign} />
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Mic2 className="h-4 w-4 text-gold" />
            <p className="text-xs uppercase tracking-[0.26em] text-white/75">Generated Voice Clips</p>
          </div>

          <div className="space-y-3">
            {scene.dialogues.map((dialogue) => (
              <div key={dialogue.id} className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-white">{dialogue.character}</p>
                  <span className="rounded-full bg-starlight/10 px-2 py-0.5 text-xs text-starlight">
                    {dialogue.delivery}
                  </span>
                  <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs text-gold">
                    {dialogue.voiceProfile.voiceName} / {dialogue.voiceProfile.gender}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-7 text-white/72">"{dialogue.line}"</p>
                {dialogue.audioUrl ? (
                  <audio controls src={dialogue.audioUrl} className="mt-3 w-full" />
                ) : (
                  <p className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/75">
                    {dialogue.audioError ?? "Waiting for voice generation."}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function ReadOnlyBlock({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-white/75">{label}</p>
      <p className="mt-3 text-sm leading-7 text-white/72">{text}</p>
    </div>
  );
}
