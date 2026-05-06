"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clapperboard,
  Edit3,
  Loader2,
  Mic2,
  Music2,
  RefreshCcw,
  Sparkles,
  Wand2,
  X
} from "lucide-react";
import { PlaySceneAudioButton } from "@/components/play-scene-audio-button";
import { PreviewFinalAudioButton } from "@/components/preview-final-audio-button";
import { ProtectedRoute } from "@/components/protected-route";
import {
  DEFAULT_VIDEO_GENRES,
  DEFAULT_VIDEO_TONES,
  VIDEO_STAGE_LABELS,
  createStoryTextFromScript,
  loadVideoStudioFlow,
  saveVideoStudioFlow,
  type VideoStudioFlowState,
  type VideoStudioStage
} from "@/lib/video-storage";
import type { MovieDialogueLine, MovieScene, VideoGenerationResponse } from "@/types/video";

type EditableSceneField =
  | "directorNotes"
  | "imagePrompt"
  | "narration"
  | "soundDesign"
  | "visualPrompt";

export default function VideoStudioScreen() {
  const router = useRouter();
  const [flow, setFlow] = useState<VideoStudioFlowState | null>(null);
  const [error, setError] = useState("");
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [customGenreInput, setCustomGenreInput] = useState("");
  const [customToneInput, setCustomToneInput] = useState("");

  useEffect(() => {
    setFlow(loadVideoStudioFlow());
  }, []);

  const visibleScript = flow?.voiceResult ?? flow?.script ?? null;
  const totalDialogueLines = useMemo(
    () => visibleScript?.scenes.reduce((total, scene) => total + scene.dialogues.length, 0) ?? 0,
    [visibleScript]
  );

  const persistFlow = (nextFlow: VideoStudioFlowState) => {
    setFlow(nextFlow);
    saveVideoStudioFlow(nextFlow);
  };

  const updateFlow = (partial: Partial<VideoStudioFlowState>) => {
    if (!flow) return;
    persistFlow({
      ...flow,
      ...partial
    });
  };

  const setStage = (stage: VideoStudioStage) => {
    if (!flow) return;
    persistFlow({
      ...flow,
      stage
    });
    setError("");
    setEditingKey(null);
  };

  const toggleGenre = (genre: string) => {
    if (!flow) return;
    const nextGenres = flow.genres.includes(genre)
      ? flow.genres.length === 1
        ? flow.genres
        : flow.genres.filter((item) => item !== genre)
      : [...flow.genres, genre];

    persistFlow({
      ...flow,
      genres: nextGenres,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script)
    });
  };

  const toggleTone = (tone: string) => {
    if (!flow) return;
    const nextTones = flow.tones.includes(tone)
      ? flow.tones.length === 1
        ? flow.tones
        : flow.tones.filter((item) => item !== tone)
      : [...flow.tones, tone];

    persistFlow({
      ...flow,
      tones: nextTones,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script)
    });
  };

  const addCustomGenre = () => {
    if (!flow) return;
    const customGenre = customGenreInput.trim();
    if (!customGenre) return;
    const nextGenres = flow.genres.includes(customGenre)
      ? flow.genres
      : [...flow.genres, customGenre];
    persistFlow({
      ...flow,
      genres: nextGenres,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script)
    });
    setCustomGenreInput("");
  };

  const addCustomTone = () => {
    if (!flow) return;
    const customTone = customToneInput.trim();
    if (!customTone) return;
    const nextTones = flow.tones.includes(customTone)
      ? flow.tones
      : [...flow.tones, customTone];
    persistFlow({
      ...flow,
      tones: nextTones,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script)
    });
    setCustomToneInput("");
  };

  const updateSceneCount = (sceneCount: number) => {
    if (!flow) return;
    persistFlow({
      ...flow,
      sceneCount,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script)
    });
  };

  const updateRoughIdea = (roughIdea: string) => {
    if (!flow) return;
    persistFlow({
      ...flow,
      roughIdea
    });
  };

  const updateAcceptedStory = (acceptedStory: string) => {
    if (!flow) return;
    persistFlow({
      ...flow,
      acceptedStory,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script),
      voiceNeedsRegeneration: Boolean(flow.voiceResult)
    });
  };

  const generateStory = async (scenarioOverride?: string) => {
    if (!flow || isGeneratingStory) return;
    const scenario = (scenarioOverride ?? flow.roughIdea).trim();

    if (scenario.length < 12) {
      setError("Write a clearer rough story idea before generating with Gemini.");
      return;
    }

    setIsGeneratingStory(true);
    setError("");
    setEditingKey(null);

    try {
      const response = await fetch("/api/video/generate", {
        body: JSON.stringify({
          genre: flow.genres,
          includeAudio: false,
          sceneCount: flow.sceneCount,
          scenario,
          tone: flow.tones
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Gemini story generation failed.");
      }

      const script = payload as VideoGenerationResponse;
      const storyText = createStoryTextFromScript(script);
      persistFlow({
        ...flow,
        acceptedStory: storyText,
        generatedStory: storyText,
        roughIdea: scenario,
        scenesNeedRegeneration: false,
        script,
        stage: "storyReview",
        videoOutdated: true,
        voiceNeedsRegeneration: false,
        voiceResult: null
      });
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Gemini story generation failed."
      );
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const regenerateScenes = async () => {
    if (!flow || isGeneratingStory) return;
    const scenario = (flow.acceptedStory || flow.generatedStory || flow.roughIdea).trim();

    if (scenario.length < 12) {
      setError("The accepted story needs more text before regenerating scenes and dialogues.");
      return;
    }

    setIsGeneratingStory(true);
    setError("");
    setEditingKey(null);

    try {
      const response = await fetch("/api/video/generate", {
        body: JSON.stringify({
          genre: flow.genres,
          includeAudio: false,
          sceneCount: flow.sceneCount,
          scenario,
          tone: flow.tones
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Scene and dialogue regeneration failed.");
      }

      const script = payload as VideoGenerationResponse;
      persistFlow({
        ...flow,
        generatedStory: flow.generatedStory || createStoryTextFromScript(script),
        scenesNeedRegeneration: false,
        script,
        stage: "scenes",
        videoOutdated: true,
        voiceNeedsRegeneration: false,
        voiceResult: null
      });
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Scene and dialogue regeneration failed."
      );
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const acceptStory = () => {
    if (!flow?.script) {
      setError("Generate the story first before continuing to scenes.");
      return;
    }

    setStage("scenes");
  };

  const updateFilmField = (field: "logline" | "title", value: string) => {
    if (!flow?.script) return;

    const nextScript = {
      ...flow.script,
      [field]: value
    };

    persistFlow({
      ...flow,
      script: nextScript,
      videoOutdated: true
    });
  };

  const updateSceneField = (
    sceneNumber: number,
    field: EditableSceneField,
    value: string
  ) => {
    if (!flow?.script) return;

    const nextScript = {
      ...flow.script,
      scenes: flow.script.scenes.map((scene) =>
        scene.sceneNumber === sceneNumber ? { ...scene, [field]: value } : scene
      )
    };

    persistFlow({
      ...flow,
      script: nextScript,
      videoOutdated: true
    });
  };

  const updateDialogueLine = (sceneNumber: number, dialogueId: string, value: string) => {
    if (!flow?.script) return;

    const nextScript = {
      ...flow.script,
      scenes: flow.script.scenes.map((scene) =>
        scene.sceneNumber === sceneNumber
          ? {
              ...scene,
              dialogues: scene.dialogues.map((dialogue) =>
                dialogue.id === dialogueId ? { ...dialogue, line: value } : dialogue
              )
            }
          : scene
      )
    };

    persistFlow({
      ...flow,
      script: nextScript,
      videoOutdated: true,
      voiceNeedsRegeneration: Boolean(flow.voiceResult)
    });
  };

  const generateVoice = async () => {
    if (!flow?.script || isGeneratingVoice) return;

    setIsGeneratingVoice(true);
    setError("");

    try {
      const response = await fetch("/api/video/tts", {
        body: JSON.stringify({ script: flow.script }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Voice generation failed.");
      }

      const voiceResult = payload as VideoGenerationResponse;
      persistFlow({
        ...flow,
        script: voiceResult,
        videoOutdated: true,
        voiceNeedsRegeneration: false,
        voiceResult
      });
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : "Voice generation failed.");
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  const generateBackgroundMusic = async () => {
    if (!flow?.script || isGeneratingMusic) return;

    const primaryScene = flow.script.scenes[0];
    setIsGeneratingMusic(true);
    setError("");
    persistFlow({
      ...flow,
      music: {
        ...flow.music,
        message: "Generating background music...",
        status: "generating"
      }
    });

    try {
      const response = await fetch("/api/background-music", {
        body: JSON.stringify({
          audioPrompt: flow.script.scenes.map((scene) => scene.soundDesign).join("\n"),
          sceneMood: primaryScene?.mood ?? flow.tones.join(", "),
          sceneTitle: flow.script.title
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Background music generation failed.");
      }

      persistFlow({
        ...flow,
        music: {
          message: "Background music is ready.",
          mood: payload.mood ?? primaryScene?.mood ?? "ambient",
          status: "ready",
          title: payload.title ?? "Generated Background Score",
          trackUrl: payload.trackUrl ?? ""
        },
        videoOutdated: true
      });
    } catch (musicError) {
      persistFlow({
        ...flow,
        music: {
          ...flow.music,
          message:
            musicError instanceof Error
              ? musicError.message
              : "Background music generation failed.",
          status: "error"
        }
      });
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  const openPreview = () => {
    if (!flow) return;
    persistFlow({
      ...flow,
      stage: "preview",
      videoOutdated: false
    });
    router.push("/video-preview?mode=guided");
  };

  if (!flow) {
    return (
      <ProtectedRoute>
        <div className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-xl">
            <div className="glass-panel rounded-[2rem] p-8 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-gold" />
              <h1 className="mt-4 font-[var(--font-heading)] text-3xl text-white">
                Loading Video Studio
              </h1>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent" />

          <section className="relative px-4 py-10 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 backdrop-blur-sm">
                    <div className="h-2 w-2 rounded-full bg-cyan-400" />
                    Guided Video Studio
                  </div>
                  <div>
                    <h1 className="font-[var(--font-heading)] text-5xl font-bold text-white sm:text-6xl">
                      Cinematic
                      <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                        {" "}Story Engine
                      </span>
                    </h1>
                    <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
                      Create a cinematic story with AI, refine scenes and dialogue, generate voice, music, and preview your final video.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-4 backdrop-blur-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-emerald-300">Current Stage</div>
                  <div className="text-sm font-semibold text-emerald-200">
                    {VIDEO_STAGE_LABELS.find((stage) => stage.id === flow.stage)?.label}
                  </div>
                </div>
              </div>

              <StageIndicator currentStage={flow.stage} />

              {error ? (
                <div className="mb-6 flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm leading-6 text-red-200 backdrop-blur-sm">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                  <span>{error}</span>
                </div>
              ) : null}

              <Warnings flow={flow} />

              {flow.stage === "setup" ? (
          <SetupStage
            flow={flow}
            customGenreInput={customGenreInput}
            customToneInput={customToneInput}
            onAddCustomGenre={addCustomGenre}
            onAddCustomTone={addCustomTone}
            onContinue={() => setStage("storyIdea")}
            onCustomGenreInputChange={setCustomGenreInput}
            onCustomToneInputChange={setCustomToneInput}
            onSceneCountChange={updateSceneCount}
            onToggleGenre={toggleGenre}
            onToggleTone={toggleTone}
                />
              ) : null}

              {flow.stage === "storyIdea" ? (
                <StoryIdeaStage
                  flow={flow}
                  isGenerating={isGeneratingStory}
                  onBack={() => setStage("setup")}
                  onGenerate={() => generateStory()}
                  onRoughIdeaChange={updateRoughIdea}
                />
              ) : null}

              {flow.stage === "storyReview" ? (
                <StoryReviewStage
                  flow={flow}
                  isGenerating={isGeneratingStory}
                  onAcceptedStoryChange={updateAcceptedStory}
                  onBack={() => setStage("storyIdea")}
                  onContinue={acceptStory}
                  onRegenerate={() => generateStory()}
                />
              ) : null}

              {flow.stage === "scenes" ? (
                <ScenesStage
                  editingKey={editingKey}
                  flow={flow}
                  isGenerating={isGeneratingStory}
                  totalDialogueLines={totalDialogueLines}
                  onBack={() => setStage("storyReview")}
                  onContinue={() => setStage("voice")}
                  onDialogueChange={updateDialogueLine}
                  onEditingChange={setEditingKey}
                  onRegenerate={regenerateScenes}
                  onSceneFieldChange={updateSceneField}
                  onTitleChange={updateFilmField}
                />
              ) : null}

              {flow.stage === "voice" ? (
                <VoiceStage
                  flow={flow}
                  isGenerating={isGeneratingVoice}
                  script={visibleScript}
                  totalDialogueLines={totalDialogueLines}
                  onBack={() => setStage("scenes")}
                  onContinue={() => setStage("music")}
                  onGenerate={generateVoice}
                />
              ) : null}

              {flow.stage === "music" ? (
                <MusicStage
                  flow={flow}
                  isGenerating={isGeneratingMusic}
                  onBack={() => setStage("voice")}
                  onGenerate={generateBackgroundMusic}
                  onPreview={openPreview}
                />
              ) : null}

              {flow.stage === "preview" ? (
                <PreviewShortcutStage
                  flow={flow}
                  onBackAudio={() => setStage("music")}
                  onBackDialogues={() => setStage("scenes")}
                  onPreview={openPreview}
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>
      {/* Floating Action Bar */}
      {(() => {
        let isReady = false;
        let label = "";
        let sublabel = "";
        let action = () => {};
        let actionLabel = "";

        if (flow.stage === "voice" && flow.voiceResult && !flow.voiceNeedsRegeneration) {
          isReady = true;
          label = "Voices Ready";
          sublabel = "All character dialogues generated.";
          action = () => setStage("music");
          actionLabel = "Continue to Music";
        } else if (flow.stage === "music" && flow.music.status === "ready") {
          isReady = true;
          label = "Music Ready";
          sublabel = "Cinematic score generated.";
          action = openPreview;
          actionLabel = "Continue to Video";
        }

        if (!isReady) return null;

        return (
          <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-6 rounded-full border border-cyan-500/30 bg-black/60 px-8 py-4 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">{label}</p>
                  <p className="text-[10px] text-white/60">{sublabel}</p>
                </div>
              </div>
              <button
                onClick={action}
                className="rounded-full bg-cyan-500 px-6 py-2 text-xs font-black uppercase tracking-tighter text-slate-950 transition hover:scale-105 active:scale-95"
              >
                {actionLabel}
              </button>
            </div>
          </div>
        );
      })()}
    </ProtectedRoute>
  );
}

function StageIndicator({ currentStage }: { currentStage: VideoStudioStage }) {
  const currentIndex = VIDEO_STAGE_LABELS.findIndex((stage) => stage.id === currentStage);

  return (
    <div className="mb-8 grid gap-2 md:grid-cols-4 xl:grid-cols-7">
      {VIDEO_STAGE_LABELS.map((stage, index) => {
        const isCurrent = stage.id === currentStage;
        const isPast = index < currentIndex;

        return (
          <div
            key={stage.id}
            className={`rounded-[1rem] border px-3 py-3 text-sm transition ${
              isCurrent
                ? "border-cyan-400/45 bg-cyan-400/15 text-cyan-100"
                : isPast
                  ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                  : "border-white/10 bg-white/5 text-white/50"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.18em]">Step {index + 1}</p>
            <p className="mt-1 font-semibold">{stage.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function Warnings({ flow }: { flow: VideoStudioFlowState }) {
  const warnings = [
    flow.scenesNeedRegeneration
      ? "Story/setup changed after scenes were generated. Regenerate scenes and dialogues when ready."
      : null,
    flow.voiceNeedsRegeneration
      ? "Dialogues changed. Please regenerate voice audio."
      : null,
    flow.videoOutdated && flow.stage !== "preview"
      ? "Preview may be outdated until you open it again after the latest changes."
      : null
  ].filter(Boolean) as string[];

  if (warnings.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {warnings.map((warning) => (
        <div
          key={warning}
          className="rounded-[1rem] border border-gold/20 bg-gold/10 px-4 py-3 text-sm leading-6 text-gold"
        >
          {warning}
        </div>
      ))}
    </div>
  );
}

function SetupStage({
  flow,
  customGenreInput,
  customToneInput,
  onAddCustomGenre,
  onAddCustomTone,
  onContinue,
  onCustomGenreInputChange,
  onCustomToneInputChange,
  onSceneCountChange,
  onToggleGenre,
  onToggleTone
}: {
  flow: VideoStudioFlowState;
  customGenreInput: string;
  customToneInput: string;
  onAddCustomGenre: () => void;
  onAddCustomTone: () => void;
  onContinue: () => void;
  onCustomGenreInputChange: (value: string) => void;
  onCustomToneInputChange: (value: string) => void;
  onSceneCountChange: (value: number) => void;
  onToggleGenre: (value: string) => void;
  onToggleTone: (value: string) => void;
}) {
  return (
    <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-slate-700/50 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl">
        <SectionHeader
          icon={<Clapperboard className="h-7 w-7 text-white" />}
          label="Stage 1"
          title="Setup"
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <PaletteGroup
            activeItems={flow.genres}
            color="cyan"
            customInput={customGenreInput}
            customPlaceholder="Write a custom genre"
            label="Genre Palette"
            options={DEFAULT_VIDEO_GENRES}
            onAddCustom={onAddCustomGenre}
            onCustomInputChange={onCustomGenreInputChange}
            onToggle={onToggleGenre}
          />
          <PaletteGroup
            activeItems={flow.tones}
            color="purple"
            customInput={customToneInput}
            customPlaceholder="Write a custom tone"
            label="Emotional Palette"
            options={DEFAULT_VIDEO_TONES}
            onAddCustom={onAddCustomTone}
            onCustomInputChange={onCustomToneInputChange}
            onToggle={onToggleTone}
          />
        </div>

        <div className="mt-6">
          <label className="mb-4 block text-sm font-semibold text-slate-200">
            Number of Scenes
          </label>
          <input
            type="range"
            min={1}
            max={10}
            value={flow.sceneCount}
            onChange={(event) => onSceneCountChange(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-cyan-400"
          />
          <p className="mt-3 text-sm text-slate-400">{flow.sceneCount} scene sequence</p>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-8 w-full rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 px-8 py-5 text-sm font-bold text-white transition hover:scale-[1.01]"
        >
          Continue to Story Idea
        </button>
      </section>

      <InfoPanel
        title="What this stage saves"
        text="Genre, tone, and scene count stay saved when you go forward or return from later stages."
      />
    </div>
  );
}

function StoryIdeaStage({
  flow,
  isGenerating,
  onBack,
  onGenerate,
  onRoughIdeaChange
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
  onRoughIdeaChange: (value: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl">
      <SectionHeader
        icon={<Wand2 className="h-7 w-7 text-white" />}
        label="Stage 2"
        title="Rough Story Idea"
      />
      <label className="mb-3 block text-sm font-semibold text-slate-200">
        Rough story idea
      </label>
      <textarea
        value={flow.roughIdea}
        onChange={(event) => onRoughIdeaChange(event.target.value)}
        placeholder="Describe your rough story concept, characters, world, conflict, and ending..."
        className="min-h-56 w-full resize-y rounded-2xl border border-slate-600/50 bg-slate-800/50 px-6 py-5 text-sm leading-7 text-white outline-none backdrop-blur-sm transition placeholder:text-slate-400 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
      />
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <SecondaryButton onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to Setup
        </SecondaryButton>
        <PrimaryButton disabled={isGenerating} onClick={onGenerate}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Generate Story with AI
        </PrimaryButton>
      </div>
    </section>
  );
}

function StoryReviewStage({
  flow,
  isGenerating,
  onAcceptedStoryChange,
  onBack,
  onContinue,
  onRegenerate
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  onAcceptedStoryChange: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onRegenerate: () => void;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <SectionHeader
        icon={<Sparkles className="h-7 w-7 text-white" />}
        label="Stage 3"
        title="Generated Story Review"
      />
      <label className="mb-3 block text-sm font-semibold text-white">
        Accept or edit the Gemini-generated story
      </label>
      <textarea
        value={flow.acceptedStory}
        onChange={(event) => onAcceptedStoryChange(event.target.value)}
        className="min-h-[28rem] w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-sm leading-7 text-white outline-none focus:border-gold/35"
      />
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <SecondaryButton onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to Story Idea
        </SecondaryButton>
        <SecondaryButton disabled={isGenerating} onClick={onRegenerate}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Regenerate Story
        </SecondaryButton>
        <PrimaryButton onClick={onContinue}>
          <Check className="h-4 w-4" />
          Accept Story / Continue to Scenes
        </PrimaryButton>
      </div>
    </section>
  );
}

function ScenesStage({
  editingKey,
  flow,
  isGenerating,
  totalDialogueLines,
  onBack,
  onContinue,
  onDialogueChange,
  onEditingChange,
  onRegenerate,
  onSceneFieldChange,
  onTitleChange
}: {
  editingKey: string | null;
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  totalDialogueLines: number;
  onBack: () => void;
  onContinue: () => void;
  onDialogueChange: (sceneNumber: number, dialogueId: string, value: string) => void;
  onEditingChange: (key: string | null) => void;
  onRegenerate: () => void;
  onSceneFieldChange: (sceneNumber: number, field: EditableSceneField, value: string) => void;
  onTitleChange: (field: "logline" | "title", value: string) => void;
}) {
  const script = flow.script;

  if (!script) {
    return (
      <InfoPanel
        title="No generated scenes yet"
        text="Go back to Story Idea and generate a story before reviewing scenes and dialogues."
      />
    );
  }

  return (
    <section className="space-y-5">
      <div className="glass-panel rounded-[2rem] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">
              Stage 4: Scenes and Dialogues
            </p>
            <EditableBlock
              editKey="film-title"
              editingKey={editingKey}
              label="Movie Title"
              singleLine
              text={script.title}
              onChange={(value) => onTitleChange("title", value)}
              onEditingChange={onEditingChange}
            />
            <EditableBlock
              editKey="film-logline"
              editingKey={editingKey}
              label="Logline"
              text={script.logline}
              onChange={(value) => onTitleChange("logline", value)}
              onEditingChange={onEditingChange}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Scenes" value={String(script.scenes.length)} />
            <Stat label="Runtime" value={script.estimatedRuntime} />
            <Stat label="Dialogue" value={String(totalDialogueLines)} />
            <Stat label="Cast" value={String(script.characterVoices.length)} />
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <SecondaryButton onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Story Review
          </SecondaryButton>
          <SecondaryButton disabled={isGenerating} onClick={onRegenerate}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Regenerate Scenes & Dialogues
          </SecondaryButton>
          <PrimaryButton onClick={onContinue}>
            <Mic2 className="h-4 w-4" />
            Continue to Audio Generation
          </PrimaryButton>
        </div>
      </div>

      {script.scenes.map((scene) => (
        <SceneCard
          key={`${script.id}-${scene.sceneNumber}`}
          editingKey={editingKey}
          scene={scene}
          onDialogueChange={onDialogueChange}
          onEditingChange={onEditingChange}
          onSceneFieldChange={onSceneFieldChange}
        />
      ))}
    </section>
  );
}

function VoiceStage({
  flow,
  isGenerating,
  script,
  totalDialogueLines,
  onBack,
  onContinue,
  onGenerate
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  script: VideoGenerationResponse | null;
  totalDialogueLines: number;
  onBack: () => void;
  onContinue: () => void;
  onGenerate: () => void;
}) {
  const generatedCount = flow.voiceResult?.audio.generatedCount ?? 0;

  return (
    <section className="space-y-6">
      <div className="glass-panel rounded-[2rem] p-6">
        <SectionHeader
          icon={<Mic2 className="h-7 w-7 text-white" />}
          label="Stage 5"
          title="Voice Audio"
        />
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Dialogue" value={String(totalDialogueLines)} />
          <Stat label="Voiced" value={String(generatedCount)} />
          <Stat label="Provider" value="Deepgram" />
          <Stat label="Status" value={flow.voiceNeedsRegeneration ? "Needs regen" : flow.voiceResult ? "Ready" : "Idle"} />
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <SecondaryButton onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Edit Dialogues
          </SecondaryButton>
          <PrimaryButton disabled={!script || isGenerating} onClick={onGenerate}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
            Generate Voice
          </PrimaryButton>
          <SecondaryButton disabled={!script || isGenerating} onClick={onGenerate}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Regenerate Voice
          </SecondaryButton>
          <PrimaryButton
            disabled={!script || isGenerating || !flow.voiceResult || flow.voiceNeedsRegeneration}
            onClick={onContinue}
          >
            <Music2 className="h-4 w-4" />
            Continue to Music
          </PrimaryButton>
          {!flow.voiceResult && !isGenerating && (
            <p className="col-span-full mt-2 text-center text-xs text-white/40 italic">
              Please generate voice audio to unlock background music.
            </p>
          )}
        </div>
      </div>

      {script?.scenes.map((scene) => (
        <VoiceSceneCard key={`${script.id}-${scene.sceneNumber}`} scene={scene} />
      ))}
    </section>
  );
}

function MusicStage({
  flow,
  isGenerating,
  onBack,
  onGenerate,
  onPreview
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
  onPreview: () => void;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <SectionHeader
        icon={<Music2 className="h-7 w-7 text-white" />}
        label="Stage 6"
        title="Background Music"
      />
      <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-5">
        <p className="text-xs uppercase tracking-[0.26em] text-white/45">Music Status</p>
        <h3 className="mt-2 text-xl font-semibold capitalize text-white">{flow.music.status}</h3>
        <p className="mt-3 text-sm leading-7 text-white/68">{flow.music.message}</p>
        {flow.music.trackUrl ? (
          <audio controls src={flow.music.trackUrl} className="mt-4 w-full" />
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-stretch gap-3 [&>*]:flex-1 [&>*]:min-w-[200px] xl:[&>*]:min-w-[180px]">
        <SecondaryButton onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </SecondaryButton>
        <PrimaryButton disabled={isGenerating} onClick={onGenerate}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4" />}
          Generate Music
        </PrimaryButton>
        <SecondaryButton disabled={isGenerating} onClick={onGenerate}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Regenerate Music
        </SecondaryButton>
        <div className="flex">
          <PreviewFinalAudioButton
            backgroundMusicUrl={flow.music.trackUrl}
            voiceAudioUrls={flow.script?.scenes.flatMap(scene => scene.dialogues.map(d => d.audioUrl)).filter((url): url is string => !!url) || []}
          />
        </div>
        <PrimaryButton
          disabled={!flow.music.trackUrl || isGenerating}
          onClick={onPreview}
        >
          <Clapperboard className="h-4 w-4" />
          Preview Video
        </PrimaryButton>
        {!flow.music.trackUrl && !isGenerating && (
          <p className="col-span-full mt-2 text-center text-xs text-white/40 italic">
            Complete background music to unlock final video preview.
          </p>
        )}
      </div>
    </section>
  );
}

function PreviewShortcutStage({
  flow,
  onBackAudio,
  onBackDialogues,
  onPreview
}: {
  flow: VideoStudioFlowState;
  onBackAudio: () => void;
  onBackDialogues: () => void;
  onPreview: () => void;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <SectionHeader
        icon={<Clapperboard className="h-7 w-7 text-white" />}
        label="Stage 7"
        title="Video Preview"
      />
      <p className="text-sm leading-7 text-white/68">
        Preview data is saved for {flow.script?.title ?? "the current film"}. Open the dedicated preview page or jump back to editing.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <SecondaryButton onClick={onBackDialogues}>
          <ArrowLeft className="h-4 w-4" />
          Back to Edit Dialogues
        </SecondaryButton>
        <SecondaryButton onClick={onBackAudio}>
          <Music2 className="h-4 w-4" />
          Back to Audio & Music
        </SecondaryButton>
        <PrimaryButton onClick={onPreview}>
          <Clapperboard className="h-4 w-4" />
          Open Preview Page
        </PrimaryButton>
      </div>
    </section>
  );
}

function SectionHeader({
  icon,
  label,
  title
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
}) {
  return (
    <div className="mb-8 flex items-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">
          {label}
        </p>
        <h2 className="text-2xl font-bold text-white">{title}</h2>
      </div>
    </div>
  );
}

function InfoPanel({ title, text }: { title: string; text: string }) {
  return (
    <section className="glass-panel flex min-h-[24rem] items-center rounded-[2rem] p-8">
      <div>
        <Sparkles className="h-10 w-10 text-gold" />
        <h2 className="mt-5 font-[var(--font-heading)] text-3xl text-white">{title}</h2>
        <p className="mt-4 text-sm leading-7 text-white/64">{text}</p>
      </div>
    </section>
  );
}

function PaletteGroup({
  activeItems,
  color,
  customInput,
  customPlaceholder,
  label,
  options,
  onAddCustom,
  onCustomInputChange,
  onToggle
}: {
  activeItems: string[];
  color: "cyan" | "purple";
  customInput: string;
  customPlaceholder: string;
  label: string;
  options: string[];
  onAddCustom: () => void;
  onCustomInputChange: (value: string) => void;
  onToggle: (value: string) => void;
}) {
  const activeClass =
    color === "cyan"
      ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-200 shadow-lg shadow-cyan-500/20"
      : "border-purple-400/50 bg-purple-500/20 text-purple-200 shadow-lg shadow-purple-500/20";

  return (
    <div>
      <label className="mb-4 block text-sm font-semibold text-slate-200">{label}</label>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all duration-300 ${
              activeItems.includes(option)
                ? activeClass
                : "border-slate-600/50 bg-slate-800/30 text-slate-300 hover:border-slate-500/50 hover:bg-slate-700/50"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={customInput}
          onChange={(event) => onCustomInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddCustom();
            }
          }}
          placeholder={customPlaceholder}
          className="min-w-0 flex-1 rounded-xl border border-slate-600/50 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50"
        />
        <button
          type="button"
          onClick={onAddCustom}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function PrimaryButton({
  children,
  disabled = false,
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 px-5 py-4 text-sm font-bold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(6,182,212,0.3)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale disabled:pointer-events-none disabled:shadow-none"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  disabled = false,
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white/80 transition-all duration-300 hover:border-cyan-300/35 hover:bg-white/10 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/42">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function SceneCard({
  editingKey,
  scene,
  onDialogueChange,
  onEditingChange,
  onSceneFieldChange
}: {
  editingKey: string | null;
  scene: MovieScene;
  onDialogueChange: (sceneNumber: number, dialogueId: string, value: string) => void;
  onEditingChange: (key: string | null) => void;
  onSceneFieldChange: (sceneNumber: number, field: EditableSceneField, value: string) => void;
}) {
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
          <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
            {scene.sceneGenre}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
            {scene.sceneTone}
          </span>
        </div>
        <h3 className="font-[var(--font-heading)] text-2xl text-white">{scene.title}</h3>
        <p className="mt-2 text-sm text-white/55">{scene.location}</p>
      </div>

      <div className="grid gap-5 p-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4">
          <EditableBlock
            editKey={`scene-${scene.sceneNumber}-narration`}
            editingKey={editingKey}
            label="Narration"
            text={scene.narration}
            onChange={(value) => onSceneFieldChange(scene.sceneNumber, "narration", value)}
            onEditingChange={onEditingChange}
          />
          <EditableBlock
            editKey={`scene-${scene.sceneNumber}-director`}
            editingKey={editingKey}
            label="Director Notes"
            text={scene.directorNotes}
            onChange={(value) => onSceneFieldChange(scene.sceneNumber, "directorNotes", value)}
            onEditingChange={onEditingChange}
          />
          <EditableBlock
            editKey={`scene-${scene.sceneNumber}-visual`}
            editingKey={editingKey}
            label="Visual Prompt"
            text={scene.visualPrompt}
            onChange={(value) => onSceneFieldChange(scene.sceneNumber, "visualPrompt", value)}
            onEditingChange={onEditingChange}
          />
          <EditableBlock
            editKey={`scene-${scene.sceneNumber}-image`}
            editingKey={editingKey}
            label="Image Prompt"
            text={scene.imagePrompt}
            onChange={(value) => onSceneFieldChange(scene.sceneNumber, "imagePrompt", value)}
            onEditingChange={onEditingChange}
          />
          <EditableBlock
            editKey={`scene-${scene.sceneNumber}-sound`}
            editingKey={editingKey}
            label="Sound Design"
            text={scene.soundDesign}
            onChange={(value) => onSceneFieldChange(scene.sceneNumber, "soundDesign", value)}
            onEditingChange={onEditingChange}
          />
        </div>

        <DialogueReview
          dialogues={scene.dialogues}
          editingKey={editingKey}
          sceneNumber={scene.sceneNumber}
          onDialogueChange={onDialogueChange}
          onEditingChange={onEditingChange}
        />
      </div>
    </article>
  );
}

function DialogueReview({
  dialogues,
  editingKey,
  sceneNumber,
  onDialogueChange,
  onEditingChange
}: {
  dialogues: MovieDialogueLine[];
  editingKey: string | null;
  sceneNumber: number;
  onDialogueChange: (sceneNumber: number, dialogueId: string, value: string) => void;
  onEditingChange: (key: string | null) => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
      <div className="mb-4 flex items-center gap-2">
        <Mic2 className="h-4 w-4 text-gold" />
        <p className="text-xs uppercase tracking-[0.26em] text-white/45">Dialogue Review</p>
      </div>

      <div className="space-y-3">
        {dialogues.map((dialogue) => (
          <div key={dialogue.id} className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-white">{dialogue.character}</p>
              <span className="rounded-full bg-starlight/10 px-2 py-0.5 text-xs text-starlight">
                {dialogue.delivery}
              </span>
              <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs text-gold">
                {dialogue.voiceProfile.voiceName}
              </span>
            </div>
            <EditableBlock
              editKey={`scene-${sceneNumber}-dialogue-${dialogue.id}`}
              editingKey={editingKey}
              label="Dialogue Line"
              text={dialogue.line}
              onChange={(value) => onDialogueChange(sceneNumber, dialogue.id, value)}
              onEditingChange={onEditingChange}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceSceneCard({ scene }: { scene: MovieScene }) {
  return (
    <article className="glass-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-white/10 bg-white/[0.03] p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
              Scene {scene.sceneNumber}
            </span>
            <span className="rounded-full border border-starlight/20 bg-starlight/10 px-3 py-1 text-xs text-starlight">
              {scene.mood}
            </span>
          </div>
          <h3 className="font-[var(--font-heading)] text-2xl text-white">{scene.title}</h3>
        </div>
        <PlaySceneAudioButton audioUrls={scene.dialogues.map(d => d.audioUrl || "")} />
      </div>
      <div className="grid gap-5 p-6 lg:grid-cols-2">
        {scene.dialogues.map((dialogue) => (
          <div key={dialogue.id} className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold text-white">{dialogue.character}</p>
            <p className="mt-3 text-sm leading-7 text-white/72">"{dialogue.line}"</p>
            {dialogue.audioUrl ? (
              <audio controls src={dialogue.audioUrl} className="mt-3 w-full" />
            ) : (
              <p className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/48">
                {dialogue.audioError ?? "Waiting for voice generation."}
              </p>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}

function EditableBlock({
  editKey,
  editingKey,
  label,
  singleLine = false,
  text,
  onChange,
  onEditingChange
}: {
  editKey: string;
  editingKey: string | null;
  label: string;
  singleLine?: boolean;
  text: string;
  onChange: (value: string) => void;
  onEditingChange: (key: string | null) => void;
}) {
  const isEditing = editingKey === editKey;

  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.24em] text-white/42">{label}</p>
        <button
          type="button"
          onClick={() => onEditingChange(isEditing ? null : editKey)}
          className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 px-2 text-white/70 transition hover:border-gold/25 hover:text-white"
          aria-label={isEditing ? `Close ${label} editor` : `Edit ${label}`}
        >
          {isEditing ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
        </button>
      </div>

      {isEditing ? (
        <div>
          {singleLine ? (
            <input
              value={text}
              onChange={(event) => onChange(event.target.value)}
              className="w-full rounded-[1rem] border border-cyan-400/25 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-gold/35"
            />
          ) : (
            <textarea
              value={text}
              onChange={(event) => onChange(event.target.value)}
              className="min-h-32 w-full resize-y rounded-[1rem] border border-cyan-400/25 bg-black/30 px-4 py-3 text-sm leading-7 text-white outline-none focus:border-gold/35"
            />
          )}
          <button
            type="button"
            onClick={() => onEditingChange(null)}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200"
          >
            <Check className="h-4 w-4" />
            Done
          </button>
        </div>
      ) : (
        <p className={`text-sm text-white/72 ${singleLine ? "text-lg font-semibold" : "leading-7"}`}>
          {text}
        </p>
      )}
    </div>
  );
}
