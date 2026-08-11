"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clapperboard,
  Loader2,
  Mic2,
  Music2,
  Sparkles
} from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { PlaySceneAudioButton } from "@/components/play-scene-audio-button";
import { PreviewFinalAudioButton } from "@/components/preview-final-audio-button";
import ScreenLayout from "@/screens/ScreenLayout";
import { AiStoryStudioStepper, type AiStoryStudioStep } from "@/components/ai-story-studio-stepper";
import {
  loadCreateStoryDraft,
  saveCreateStoryDraft
} from "@/lib/create-story-storage";
import type { CreateStoryDraft } from "@/types/create-story";
import { logActivity } from "@/lib/log-activity";

export default function AudioGenerationScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<CreateStoryDraft | null>(null);

  useEffect(() => {
    setDraft(loadCreateStoryDraft());
  }, []);

  const totalDialogueLines = useMemo(
    () =>
      draft?.scenes.reduce(
        (total, scene) =>
          total + scene.dialogues.filter((dialogue) => dialogue.text.trim()).length,
        0
      ) ?? 0,
    [draft]
  );

  const persistDraft = (nextDraft: CreateStoryDraft) => {
    setDraft(nextDraft);
    saveCreateStoryDraft(nextDraft);
  };

  const generateVoices = async () => {
    if (!draft || draft.audio.voiceStatus === "generating") return;

    persistDraft({
      ...draft,
      audio: {
        ...draft.audio,
        voiceMessage: "Generating character voices with Deepgram...",
        voiceStatus: "generating"
      }
    });

    try {
      // Map create-story draft to the format expected by /api/video/tts
      const mappedScenes = draft.scenes.map((scene) => {
        const dialoguesToGenerate = scene.dialogues
          .filter((d) => d.text.trim())
          .map((d) => {
            const char = draft.characters.find((c) => c.id === d.characterId);
            return {
              id: d.id,
              character: d.characterName,
              delivery: "neutral",
              line: d.text,
              voiceProfile: {
                deepgramModel: (d.voiceStyle || char?.voiceStyle || "").toLowerCase().includes("female")
                  ? "aura-asteria-en"
                  : "aura-orion-en",
                description: d.voiceStyle || char?.voiceStyle || "Character voice",
                gender: (d.voiceStyle || char?.voiceStyle || "").toLowerCase().includes("female") ? "female" : "male",
                tone: "neutral"
              }
            };
          });

        if (draft.includeNarration && scene.storyDescription.trim()) {
          dialoguesToGenerate.unshift({
            id: "narrator",
            character: "Narrator",
            delivery: "neutral",
            line: scene.storyDescription,
            voiceProfile: {
              deepgramModel: "aura-asteria-en",
              description: "Narrator voice",
              gender: "female",
              tone: "neutral"
            }
          });
        }

        return {
          id: scene.id,
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          sceneTone: scene.sceneTone || draft.tones[0] || "cinematic",
          mood: scene.sceneTone || draft.tones[0] || "cinematic",
          sceneGenre: scene.sceneGenre || draft.genres[0] || "cinematic",
          narration: scene.storyDescription || scene.selectedSuggestion,
          dialogues: dialoguesToGenerate
        };
      });

      const res = await fetch("/api/video/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes: mappedScenes })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate voices");
      }

      // Map the returned audioUrls back to our draft
      const updatedScenes = draft.scenes.map((scene, sceneIndex) => {
        const returnedScene = data.scenes?.[sceneIndex];
        if (!returnedScene) return scene;

        const narrationDialogue = draft.includeNarration ? returnedScene.dialogues?.[0] : null;
        const mappedDialogues = scene.dialogues.map((dialogue, dialogueIndex) => {
          // If narration is included, the character dialogues are shifted by 1 in the returned array
          const returnedDialogue = returnedScene.dialogues?.[draft.includeNarration ? dialogueIndex + 1 : dialogueIndex];
          if (returnedDialogue && returnedDialogue.audioUrl) {
            return { ...dialogue, audioUrl: returnedDialogue.audioUrl };
          }
          return dialogue;
        });

        return {
          ...scene,
          narrationAudioUrl: narrationDialogue?.audioUrl,
          dialogues: mappedDialogues
        };
      });

      persistDraft({
        ...draft,
        scenes: updatedScenes,
        audio: {
          ...draft.audio,
          voiceMessage: `Generated ${data.generatedCount} voice lines successfully.`,
          voiceStatus: "ready"
        }
      });

      await logActivity("audio_generated", { type: "voice", storyTitle: draft.storyTitle, lines: data.generatedCount });

    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      persistDraft({
        ...draft,
        audio: {
          ...draft.audio,
          voiceMessage: `Failed: ${msg}`,
          voiceStatus: "idle"
        }
      });
    }
  };

  const generateBackgroundMusic = async () => {
    if (!draft || draft.audio.backgroundMusicStatus === "generating") return;

    persistDraft({
      ...draft,
      audio: {
        ...draft.audio,
        backgroundMusicMessage: "Generating cinematic background score...",
        backgroundMusicStatus: "generating"
      }
    });

    try {
      const res = await fetch("/api/background-music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sceneMood: draft.tones[0] || "cinematic",
          sceneTitle: draft.storyTitle,
          audioPrompt: `A ${draft.genres.join(" ")} soundtrack`
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate music");
      }

      persistDraft({
        ...draft,
        audio: {
          ...draft.audio,
          backgroundMusicMessage: "Background music generated successfully.",
          backgroundMusicStatus: "ready",
          backgroundMusicUrl: data.trackUrl
        }
      });

      await logActivity("audio_generated", { type: "music", storyTitle: draft.storyTitle });

    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      persistDraft({
        ...draft,
        audio: {
          ...draft.audio,
          backgroundMusicMessage: `Failed: ${msg}`,
          backgroundMusicStatus: "idle"
        }
      });
    }
  };

  const generateVideo = async () => {
    if (!draft) return;

    const nextDraft = {
      ...draft,
      video: {
        message: "Generated video preview will appear here after backend integration.",
        status: "ready" as const
      }
    };

    persistDraft(nextDraft);
    await logActivity("video_previewed", { storyTitle: draft.storyTitle });
    router.push("/video-preview?mode=custom");
  };

  if (!draft) {
    return (
      <ProtectedRoute>
        <ScreenLayout
          eyebrow="AI Story Studio"
          title="Loading Audio Generation"
          description="Restoring your custom story audio draft."
        >
          <div className="glass-panel rounded-[1.5rem] p-6 text-sm text-white/70">
            Opening audio workspace...
          </div>
        </ScreenLayout>
      </ProtectedRoute>
    );
  }

  const voiceReady = draft.audio.voiceStatus === "ready";
  const musicReady = draft.audio.backgroundMusicStatus === "ready";
  const canGenerateVideo = draft.scenes.length > 0 && voiceReady && musicReady;

  const currentStep: AiStoryStudioStep = draft.audio.voiceStatus === "ready" ? 4 : 3;

  return (
    <ProtectedRoute>
      <ScreenLayout
        eyebrow="AI Story Studio"
        title="Audio Generation"
        description="Review the final story, assign voice placeholders, generate character voices and background music separately, then continue to video preview."
        maxWidth="max-w-7xl"
      >
        <AiStoryStudioStepper currentStep={currentStep} />
        <section className="glass-panel rounded-[1.8rem] p-5 sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-starlight/70">Story Title</p>
              <h2 className="mt-2 font-[var(--font-heading)] text-3xl text-white">
                {draft.storyTitle}
              </h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-white/90">
                {draft.scenes.length} scene{draft.scenes.length === 1 ? "" : "s"} prepared with {totalDialogueLines} dialogue line{totalDialogueLines === 1 ? "" : "s"}.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Scenes" value={String(draft.scenes.length)} />
              <Stat label="Characters" value={String(draft.characters.length)} />
              <Stat label="Voices" value={draft.audio.voiceStatus} />
              <Stat label="Music" value={draft.audio.backgroundMusicStatus} />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-stretch gap-3 [&>*]:flex-1 [&>*]:min-w-[200px] xl:[&>*]:min-w-[180px]">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={generateVoices}
                disabled={draft.audio.voiceStatus === "generating"}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-5 py-3 text-sm font-semibold text-slate-950 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
              >
                {draft.audio.voiceStatus === "generating" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mic2 className="h-4 w-4" />
                )}
                {draft.audio.voiceStatus === "ready" ? "Regenerate Voices" : "Generate Voices"}
              </button>
              {draft.audio.voiceStatus === "idle" && (
                <p className="mt-1 text-center text-[10px] text-white/75 uppercase tracking-tighter">Required for music</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={generateBackgroundMusic}
                disabled={draft.audio.backgroundMusicStatus === "generating" || draft.audio.voiceStatus !== "ready"}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-starlight/20 bg-starlight/10 px-5 py-3 text-sm font-semibold text-starlight transition-all duration-300 hover:bg-starlight/15 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
              >
                {draft.audio.backgroundMusicStatus === "generating" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Music2 className="h-4 w-4" />
                )}
                {draft.audio.backgroundMusicStatus === "ready" ? "Regenerate Music" : "Generate Music"}
              </button>
              {draft.audio.voiceStatus !== "ready" && (
                <p className="mt-1 text-center text-[10px] text-white/75 uppercase tracking-tighter italic">Generate voices first</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => router.push("/story-builder")}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition-all duration-300 hover:border-gold/25 hover:text-white hover:scale-[1.02] active:scale-[0.98]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <PreviewFinalAudioButton
                backgroundMusicUrl={draft.audio.backgroundMusicUrl}
                voiceAudioUrls={draft.scenes.flatMap(scene => scene.dialogues.map(d => (d as any).audioUrl))}
              />
              {draft.audio.backgroundMusicStatus !== "ready" && (
                <p className="mt-1 text-center text-[10px] text-white/75 uppercase tracking-tighter italic">Music required</p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={generateVideo}
                disabled={!canGenerateVideo}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-5 py-3 text-sm font-semibold text-gold transition-all duration-300 hover:bg-gold/15 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
              >
                <Clapperboard className="h-4 w-4" />
                Generate Video
              </button>
              {!canGenerateVideo && (
                <p className="mt-1 text-center text-[10px] text-white/75 uppercase tracking-tighter italic">Complete all audio</p>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <StatusPanel
              icon={<Mic2 className="h-4 w-4" />}
              label="Voice Status"
              message={draft.audio.voiceMessage}
              status={draft.audio.voiceStatus}
            />
            <div className="flex flex-col gap-3">
              <StatusPanel
                icon={<Music2 className="h-4 w-4" />}
                label="Music Status"
                message={draft.audio.backgroundMusicMessage}
                status={draft.audio.backgroundMusicStatus}
              />
              {draft.audio.backgroundMusicUrl && (
                <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-starlight">Preview Background Music</p>
                  <audio
                    controls
                    src={draft.audio.backgroundMusicUrl}
                    className="h-8 w-full outline-none [&::-webkit-media-controls-enclosure]:bg-transparent [&::-webkit-media-controls-panel]:bg-transparent"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8 space-y-6">
          {draft.scenes.map((scene) => (
            <article key={scene.id} className="glass-panel overflow-hidden rounded-[2rem]">
              <div className="border-b border-white/10 bg-white/[0.03] p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
                      Scene {scene.sceneNumber}
                    </span>
                    <span className="rounded-full border border-starlight/20 bg-starlight/10 px-3 py-1 text-xs text-starlight">
                      {draft.tones[0] || "Cinematic"}
                    </span>
                  </div>
                  <h3 className="font-[var(--font-heading)] text-2xl text-white">{scene.title}</h3>
                </div>
                <PlaySceneAudioButton audioUrls={scene.dialogues.map(d => (d as any).audioUrl)} />
              </div>
              <div className="grid gap-5 p-6 lg:grid-cols-2">
                {scene.dialogues.map((dialogue) => (
                  <div
                    key={dialogue.id}
                    className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4"
                  >
                    <p className="text-sm font-semibold text-white">{dialogue.characterName}</p>
                    <p className="mt-3 text-sm leading-7 text-white/72">
                      "{dialogue.text || "No dialogue written yet."}"
                    </p>
                    {(dialogue as any).audioUrl ? (
                      <audio controls src={(dialogue as any).audioUrl} className="mt-3 w-full" />
                    ) : (
                      <p className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/75">
                        Waiting for voice generation.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      </ScreenLayout>
    </ProtectedRoute>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/75">{label}</p>
      <p className="mt-2 text-sm font-semibold capitalize text-white">{value}</p>
    </div>
  );
}

function StatusPanel({
  icon,
  label,
  message,
  status
}: {
  icon: React.ReactNode;
  label: string;
  message: string;
  status: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 text-gold">
        {icon}
        <p className="text-xs uppercase tracking-[0.24em]">{label}</p>
      </div>
      <div className="mt-3 flex items-center gap-2">
        {status === "generating" ? (
          <Loader2 className="h-4 w-4 animate-spin text-starlight" />
        ) : (
          <Sparkles className="h-4 w-4 text-starlight" />
        )}
        <p className="text-sm font-semibold capitalize text-white">{status}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-white/90">{message}</p>
    </div>
  );
}
