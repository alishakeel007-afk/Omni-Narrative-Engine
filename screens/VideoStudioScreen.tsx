"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Clapperboard,
  Loader2,
  Mic2,
  Sparkles,
  Wand2
} from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import type { MovieScene, VideoGenerationResponse } from "@/types/video";

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

export default function VideoStudioScreen() {
  const [scenario, setScenario] = useState(sampleScenario);
  const [genres, setGenres] = useState<string[]>([genreOptions[0]]);
  const [tones, setTones] = useState<string[]>([toneOptions[0]]);
  const [sceneCount, setSceneCount] = useState(3);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [result, setResult] = useState<VideoGenerationResponse | null>(null);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const canGenerate = scenario.trim().length >= 12 && !isGenerating;
  const totalDialogueLines = useMemo(
    () => result?.scenes.reduce((total, scene) => total + scene.dialogues.length, 0) ?? 0,
    [result]
  );

  const handleGenerate = async () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setError("");

    try {
      const response = await fetch("/api/video/generate", {
        body: JSON.stringify({
          genre: genres,
          includeAudio,
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

      setResult(payload as VideoGenerationResponse);
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

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="relative">
          {/* Background Effects */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent"></div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-purple-900/10 via-transparent to-transparent"></div>

          <section className="relative px-4 py-10 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              {/* Header */}
              <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 backdrop-blur-sm">
                    <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"></div>
                    AI Video Production Studio
                  </div>
                  <div>
                    <h1 className="font-[var(--font-heading)] text-5xl font-bold text-white sm:text-6xl lg:text-7xl">
                      Cinematic
                      <span className="bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
                        {" "}Story Engine
                      </span>
                    </h1>
                    <p className="mt-4 text-xl text-slate-300 max-w-2xl">
                      Transform your narrative vision into professional video content with AI-powered scene generation and voice synthesis.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-6 py-4 backdrop-blur-sm">
                    <div className="text-xs font-medium text-emerald-300 uppercase tracking-wider">Powered By</div>
                    <div className="text-sm font-semibold text-emerald-200">Gemini Script Engine</div>
                    <div className="text-sm font-semibold text-emerald-200">Deepgram Voice Pipeline</div>
                  </div>
                  <div className="text-xs text-slate-400 text-center">
                    Professional Grade • Real-time Processing
                  </div>
                </div>
              </div>

              <div className="grid gap-8 xl:grid-cols-[0.85fr_1.15fr]">
                {/* Input Panel */}
                <section className="space-y-6">
                  <div className="rounded-3xl border border-slate-700/50 bg-slate-900/50 p-8 backdrop-blur-xl shadow-2xl">
                    <div className="mb-8 flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg">
                        <Clapperboard className="h-7 w-7 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-cyan-300 uppercase tracking-wider">
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
                          className="min-h-48 w-full resize-none rounded-2xl border border-slate-600/50 bg-slate-800/50 px-6 py-5 text-sm leading-7 text-white placeholder-slate-400 outline-none transition-all duration-300 focus:border-cyan-400/50 focus:bg-slate-800/70 focus:ring-2 focus:ring-cyan-400/20 backdrop-blur-sm"
                        />
                      </div>

                      <div className="grid gap-6 sm:grid-cols-2">
                        <div>
                          <label className="mb-4 block text-sm font-semibold text-slate-200">
                            Genre Palette
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {genreOptions.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => toggleGenre(option)}
                                className={`group rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all duration-300 ${
                                  genres.includes(option)
                                    ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-200 shadow-lg shadow-cyan-500/20"
                                    : "border-slate-600/50 bg-slate-800/30 text-slate-300 hover:border-slate-500/50 hover:bg-slate-700/50 hover:shadow-md"
                                }`}
                              >
                                <span className="group-hover:scale-105 transition-transform duration-200 inline-block">
                                  {option}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="mb-4 block text-sm font-semibold text-slate-200">
                            Emotional Tone
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {toneOptions.map((option) => (
                              <button
                                key={option}
                                type="button"
                                onClick={() => toggleTone(option)}
                                className={`group rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all duration-300 ${
                                  tones.includes(option)
                                    ? "border-purple-400/50 bg-purple-500/20 text-purple-200 shadow-lg shadow-purple-500/20"
                                    : "border-slate-600/50 bg-slate-800/30 text-slate-300 hover:border-slate-500/50 hover:bg-slate-700/50 hover:shadow-md"
                                }`}
                              >
                                <span className="group-hover:scale-105 transition-transform duration-200 inline-block">
                                  {option}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
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
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                          />
                          <p className="mt-3 text-sm text-slate-400">{sceneCount} scene sequence</p>
                        </div>

                        <label className="flex min-h-14 items-center gap-4 rounded-2xl border border-slate-600/50 bg-slate-800/50 px-6 py-4 text-sm text-slate-200 backdrop-blur-sm cursor-pointer hover:border-slate-500/50 transition-colors">
                          <input
                            type="checkbox"
                            checked={includeAudio}
                            onChange={(event) => setIncludeAudio(event.target.checked)}
                            className="h-5 w-5 accent-cyan-400 rounded"
                          />
                          <div className="flex items-center gap-2">
                            <Mic2 className="h-4 w-4 text-cyan-400" />
                            Voice Dialogue
                          </div>
                        </label>
                      </div>

                      {error && (
                        <div className="flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm leading-6 text-red-200 backdrop-blur-sm">
                          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                          <span>{error}</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={!canGenerate}
                        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 px-8 py-5 text-sm font-bold text-white transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
                        <div className="relative flex items-center justify-center gap-3">
                          {isGenerating ? (
                            <>
                              <Loader2 className="h-5 w-5 animate-spin" />
                              Generating Cinematic Content...
                            </>
                          ) : (
                            <>
                              <Wand2 className="h-5 w-5" />
                              Create Film Sequence
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
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">
                              Generated Film Blueprint
                            </p>
                            <h2 className="mt-3 font-[var(--font-heading)] text-3xl text-white">
                              {result.title}
                            </h2>
                            <p className="mt-4 text-sm leading-7 text-white/70">{result.logline}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <Stat label="Scenes" value={String(result.scenes.length)} />
                            <Stat label="Runtime" value={result.estimatedRuntime} />
                            <Stat label="Dialogue" value={String(totalDialogueLines)} />
                            <Stat label="Cast Voices" value={String(result.characterVoices.length)} />
                            <Stat label="Voices" value={String(result.audio.generatedCount)} />
                          </div>
                        </div>

                        {result.characterVoices.length > 0 && (
                          <div className="mt-5 rounded-[1.4rem] border border-white/10 bg-black/20 p-4">
                            <p className="text-xs uppercase tracking-[0.24em] text-white/42">
                              Assigned Voice Cast
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {result.characterVoices.map((voice) => (
                                <span
                                  key={`${voice.character}-${voice.deepgramModel}`}
                                  className="rounded-full border border-starlight/15 bg-starlight/8 px-3 py-1 text-xs text-white/70"
                                >
                                  {voice.character}: {voice.voiceName} / {voice.gender}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {result.audio.errors.length > 0 && (
                          <div className="mt-5 rounded-[1.3rem] border border-gold/20 bg-gold/8 p-4 text-sm leading-6 text-white/70">
                            {result.audio.errors[0]}
                          </div>
                        )}
                      </div>

                      <div className="space-y-5">
                        {result.scenes.map((scene) => (
                          <SceneCard key={`${result.id}-${scene.sceneNumber}`} scene={scene} />
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
                          Ready for a scene-by-scene film plan
                        </h2>
                        <p className="mt-4 text-sm leading-7 text-white/64">
                          Gemini will structure the story, characters, narration, image prompts, sound
                          direction, and dialogue. The backend will attach voice audio to the dialogue
                          lines with Deepgram when the TTS key is available.
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

function Field({
  children,
  label
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div>
      <label className="mb-3 block text-sm font-semibold text-white">{label}</label>
      {children}
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

function SceneCard({ scene }: { scene: MovieScene }) {
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
          <Block label="Narration" text={scene.narration} />
          <Block label="Director Notes" text={scene.directorNotes} />
          <Block label="Visual Prompt" text={scene.visualPrompt} />
          <Block label="Image Prompt" text={scene.imagePrompt} />
          <Block label="Sound Design" text={scene.soundDesign} />
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
          <div className="mb-4 flex items-center gap-2">
            <Mic2 className="h-4 w-4 text-gold" />
            <p className="text-xs uppercase tracking-[0.26em] text-white/45">Dialogue Voice Clips</p>
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
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/42">
                  {dialogue.voiceProfile.archetype.replaceAll("_", " ")} - {dialogue.voiceProfile.deepgramModel}
                </p>
                <p className="mt-3 text-sm leading-7 text-white/72">"{dialogue.line}"</p>
                {dialogue.audioUrl ? (
                  <audio controls src={dialogue.audioUrl} className="mt-3 w-full" />
                ) : (
                  <p className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/48">
                    {dialogue.audioError ?? "Audio is waiting for the configured Deepgram TTS key."}
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

function Block({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.24em] text-white/42">{label}</p>
      <p className="mt-3 text-sm leading-7 text-white/72">{text}</p>
    </div>
  );
}
