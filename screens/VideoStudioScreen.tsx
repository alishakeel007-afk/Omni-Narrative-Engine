"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Clapperboard,
  Edit3,
  Loader2,
  Mic2,
  Sparkles,
  Wand2,
  X
} from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import { VIDEO_DRAFT_STORAGE_KEY } from "@/lib/video-storage";
import type { MovieDialogueLine, MovieScene, VideoGenerationResponse } from "@/types/video";

const genreOptions = [
  "Cinematic Drama",
  "Fantasy",
  "Sci-Fi",
  "Mystery",
  "Adventure",
  "Horror",
  "Romance"
];

const toneOptions = [
  "Immersive and emotional",
  "Suspenseful",
  "Epic and heroic",
  "Dark and tense",
  "Warm and hopeful",
  "Funny and fast-paced"
];

const sampleScenario =
  "A young inventor in a flooded future city builds a machine that can replay memories from rainwater, but one memory reveals the mayor erased an entire district from history.";

type EditableSceneField =
  | "directorNotes"
  | "imagePrompt"
  | "narration"
  | "soundDesign"
  | "visualPrompt";

export default function VideoStudioScreen() {
  const router = useRouter();
  const [scenario, setScenario] = useState(sampleScenario);
  const [genres, setGenres] = useState<string[]>([genreOptions[0]]);
  const [tones, setTones] = useState<string[]>([toneOptions[0]]);
  const [sceneCount, setSceneCount] = useState(3);
  const [result, setResult] = useState<VideoGenerationResponse | null>(null);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const canGenerate = scenario.trim().length >= 12 && !isGenerating;
  const totalDialogueLines = useMemo(
    () => result?.scenes.reduce((total, scene) => total + scene.dialogues.length, 0) ?? 0,
    [result]
  );

  useEffect(() => {
    try {
      const savedDraft = window.localStorage.getItem(VIDEO_DRAFT_STORAGE_KEY);

      if (savedDraft) {
        setResult(JSON.parse(savedDraft) as VideoGenerationResponse);
      }
    } catch {
      window.localStorage.removeItem(VIDEO_DRAFT_STORAGE_KEY);
    }
  }, []);

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setError("");
    setEditingKey(null);

    try {
      const response = await fetch("/api/video/generate", {
        body: JSON.stringify({
          genre: genres,
          includeAudio: false,
          sceneCount,
          scenario,
          tone: tones
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Video generation failed.");
      }

      const nextResult = payload as VideoGenerationResponse;
      setResult(nextResult);
      window.localStorage.setItem(VIDEO_DRAFT_STORAGE_KEY, JSON.stringify(nextResult));
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Video generation failed."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmAndContinue = () => {
    if (!result) return;

    window.localStorage.setItem(VIDEO_DRAFT_STORAGE_KEY, JSON.stringify(result));
    router.push("/video/voice");
  };

  const toggleGenre = (genre: string) => {
    setGenres((current) => {
      if (current.includes(genre)) {
        return current.length === 1 ? current : current.filter((item) => item !== genre);
      }

      return [...current, genre];
    });
  };

  const toggleTone = (tone: string) => {
    setTones((current) => {
      if (current.includes(tone)) {
        return current.length === 1 ? current : current.filter((item) => item !== tone);
      }

      return [...current, tone];
    });
  };

  const updateFilmField = (field: "logline" | "title", value: string) => {
    setResult((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      window.localStorage.setItem(VIDEO_DRAFT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const updateSceneField = (
    sceneNumber: number,
    field: EditableSceneField,
    value: string
  ) => {
    setResult((current) => {
      if (!current) return current;
      const next = {
        ...current,
        scenes: current.scenes.map((scene) =>
          scene.sceneNumber === sceneNumber ? { ...scene, [field]: value } : scene
        )
      };
      window.localStorage.setItem(VIDEO_DRAFT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const updateDialogueLine = (sceneNumber: number, dialogueId: string, value: string) => {
    setResult((current) => {
      if (!current) return current;
      const next = {
        ...current,
        scenes: current.scenes.map((scene) =>
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
      window.localStorage.setItem(VIDEO_DRAFT_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="relative">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent" />

          <section className="relative px-4 py-10 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 backdrop-blur-sm">
                    <div className="h-2 w-2 rounded-full bg-cyan-400" />
                    Step 1: AI Film Sequence
                  </div>
                  <div>
                    <h1 className="font-[var(--font-heading)] text-5xl font-bold text-white sm:text-6xl lg:text-7xl">
                      Cinematic
                      <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                        {" "}Story Engine
                      </span>
                    </h1>
                    <p className="mt-4 max-w-2xl text-xl text-slate-300">
                      Generate the film plan first, review and edit the AI text, then continue to Deepgram voice generation.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-4 backdrop-blur-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-emerald-300">Current Step</div>
                  <div className="text-sm font-semibold text-emerald-200">Script + Dialogue Review</div>
                  <div className="text-sm font-semibold text-emerald-200">Voice comes after confirmation</div>
                </div>
              </div>

              <div className="grid gap-8 xl:grid-cols-[0.85fr_1.15fr]">
                <section className="space-y-6">
                  <div className="rounded-3xl border border-slate-700/50 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl">
                    <div className="mb-8 flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
                        <Clapperboard className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">
                          Creative Input
                        </p>
                        <h2 className="text-2xl font-bold text-white">Story Blueprint</h2>
                      </div>
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="mb-3 block text-sm font-semibold text-slate-200">
                          Narrative Concept
                        </label>
                        <textarea
                          value={scenario}
                          onChange={(event) => setScenario(event.target.value)}
                          placeholder="Describe your story concept, characters, setting, and desired outcome..."
                          className="min-h-48 w-full resize-none rounded-2xl border border-slate-600/50 bg-slate-800/50 px-6 py-5 text-sm leading-7 text-white outline-none backdrop-blur-sm transition-all duration-300 placeholder:text-slate-400 focus:border-cyan-400/50 focus:bg-slate-800/70 focus:ring-2 focus:ring-cyan-400/20"
                        />
                      </div>

                      <div className="grid gap-6 sm:grid-cols-2">
                        <PaletteGroup
                          activeItems={genres}
                          color="cyan"
                          label="Genre Palette"
                          options={genreOptions}
                          onToggle={toggleGenre}
                        />
                        <PaletteGroup
                          activeItems={tones}
                          color="purple"
                          label="Emotional Palette"
                          options={toneOptions}
                          onToggle={toggleTone}
                        />
                      </div>

                      <div>
                        <label className="mb-4 block text-sm font-semibold text-slate-200">
                          Scene Count
                        </label>
                        <input
                          type="range"
                          min={1}
                          max={5}
                          value={sceneCount}
                          onChange={(event) => setSceneCount(Number(event.target.value))}
                          className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-cyan-400"
                        />
                        <p className="mt-3 text-sm text-slate-400">{sceneCount} scene sequence</p>
                      </div>

                      {error ? (
                        <div className="flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm leading-6 text-red-200 backdrop-blur-sm">
                          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                          <span>{error}</span>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={!canGenerate}
                        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 px-8 py-5 text-sm font-bold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                        <div className="relative flex items-center justify-center gap-3">
                          {isGenerating ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin" />
                              Generating Film Sequence...
                            </>
                          ) : (
                            <>
                              <Wand2 className="h-5 w-5" />
                              Generate Film Sequence
                            </>
                          )}
                        </div>
                      </button>
                    </div>
                  </div>
                </section>

                <section className="space-y-5">
                  {result ? (
                    <>
                      <div className="glass-panel rounded-[2rem] p-6">
                        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1 space-y-4">
                            <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">
                              Generated Film Blueprint
                            </p>
                            <EditableBlock
                              editKey="film-title"
                              editingKey={editingKey}
                              label="Movie Title"
                              singleLine
                              text={result.title}
                              onChange={(value) => updateFilmField("title", value)}
                              onEditingChange={setEditingKey}
                            />
                            <EditableBlock
                              editKey="film-logline"
                              editingKey={editingKey}
                              label="Logline"
                              text={result.logline}
                              onChange={(value) => updateFilmField("logline", value)}
                              onEditingChange={setEditingKey}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <Stat label="Scenes" value={String(result.scenes.length)} />
                            <Stat label="Runtime" value={result.estimatedRuntime} />
                            <Stat label="Dialogue" value={String(totalDialogueLines)} />
                            <Stat label="Cast" value={String(result.characterVoices.length)} />
                          </div>
                        </div>

                        {result.characterVoices.length > 0 ? (
                          <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-white/42">
                              Fixed Voice Cast For Step 2
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {result.characterVoices.map((voice) => (
                                <span
                                  key={`${voice.character}-${voice.deepgramModel}`}
                                  className="rounded-full border border-starlight/15 bg-starlight/10 px-3 py-1 text-xs text-white/70"
                                >
                                  {voice.character}: {voice.voiceName} / {voice.gender}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={handleConfirmAndContinue}
                          className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 px-7 py-4 text-sm font-bold text-slate-950 transition hover:scale-[1.01]"
                        >
                          <Check className="h-5 w-5" />
                          Confirm and Continue to Voice Generation
                        </button>
                      </div>

                      <div className="space-y-5">
                        {result.scenes.map((scene) => (
                          <SceneCard
                            key={`${result.id}-${scene.sceneNumber}`}
                            editingKey={editingKey}
                            scene={scene}
                            onDialogueChange={updateDialogueLine}
                            onEditingChange={setEditingKey}
                            onSceneFieldChange={updateSceneField}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="glass-panel flex min-h-[32rem] items-center justify-center rounded-[2rem] p-8">
                      <div className="max-w-lg text-center">
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[1.5rem] border border-white/10 bg-white/10 text-gold shadow-glow">
                          <Sparkles className="h-7 w-7" />
                        </div>
                        <h2 className="mt-6 font-[var(--font-heading)] text-3xl text-white">
                          Step 1 creates the editable film plan
                        </h2>
                        <p className="mt-4 text-sm leading-7 text-white/64">
                          Gemini will generate the story, scenes, narration, prompts, and dialogue. You can edit the text here before Deepgram creates voices on the next page.
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
}

function PaletteGroup({
  activeItems,
  color,
  label,
  options,
  onToggle
}: {
  activeItems: string[];
  color: "cyan" | "purple";
  label: string;
  options: string[];
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
    </div>
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
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/65">
            {scene.estimatedDuration}
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
                {dialogue.voiceProfile.voiceName} / fixed voice
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
        <p className={`text-sm text-white/72 ${singleLine ? "font-semibold text-lg" : "leading-7"}`}>
          {text}
        </p>
      )}
    </div>
  );
}
