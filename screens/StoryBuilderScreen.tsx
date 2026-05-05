"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Check, Eye, Loader2, MessageSquareText,
  Plus, RefreshCw, Sparkles, Trash2, Wand2, X
} from "lucide-react";
import { ProtectedRoute } from "@/components/protected-route";
import ScreenLayout from "@/screens/ScreenLayout";
import { AiStoryStudioStepper } from "@/components/ai-story-studio-stepper";
import {
  createEmptyScene, createMockDialogue, loadCreateStoryDraft, saveCreateStoryDraft
} from "@/lib/create-story-storage";
import type { CreateStoryDraft, CreateStoryScene } from "@/types/create-story";
import { logActivity } from "@/lib/log-activity";

const MAX_SCENES = 10;

export default function StoryBuilderScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<CreateStoryDraft | null>(null);
  const [activeSceneId, setActiveSceneId] = useState("");
  const [error, setError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadingDialogue, setLoadingDialogue] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    const loadedDraft = loadCreateStoryDraft();
    const nextDraft =
      loadedDraft.scenes.length > 0
        ? loadedDraft
        : {
            ...loadedDraft,
            scenes: [
              createEmptyScene({
                characters: loadedDraft.characters,
                genres: loadedDraft.genres,
                sceneNumber: 1,
                storyTitle: loadedDraft.storyTitle,
                tones: loadedDraft.tones
              })
            ]
          };
    setDraft(nextDraft);
    setActiveSceneId(nextDraft.scenes[0]?.id ?? "");
    saveCreateStoryDraft(nextDraft);
  }, []);

  const activeScene = useMemo(
    () => draft?.scenes.find((s) => s.id === activeSceneId) ?? draft?.scenes[0] ?? null,
    [activeSceneId, draft]
  );

  const persistDraft = (nextDraft: CreateStoryDraft) => {
    const withAudio = {
      ...nextDraft,
      audio: {
        ...nextDraft.audio,
        backgroundMusicMessage:
          nextDraft.audio.backgroundMusicStatus === "ready"
            ? "Content changed. Regenerate audio."
            : nextDraft.audio.backgroundMusicMessage,
        backgroundMusicStatus:
          nextDraft.audio.backgroundMusicStatus === "ready"
            ? "idle"
            : nextDraft.audio.backgroundMusicStatus,
        voiceMessage:
          nextDraft.audio.voiceStatus === "ready"
            ? "Dialogues changed. Please regenerate voice audio."
            : nextDraft.audio.voiceMessage,
        voiceStatus:
          nextDraft.audio.voiceStatus === "ready" ? "idle" : nextDraft.audio.voiceStatus
      }
    } satisfies CreateStoryDraft;
    setDraft(withAudio);
    saveCreateStoryDraft(withAudio);
  };

  const updateScene = (
    sceneId: string,
    partial: Partial<Pick<CreateStoryScene, "selectedSuggestion" | "storyDescription" | "title">>
  ) => {
    if (!draft) return;
    persistDraft({
      ...draft,
      scenes: draft.scenes.map((s) => (s.id === sceneId ? { ...s, ...partial } : s))
    });
    setError("");
  };

  const updateDialogue = (sceneId: string, characterId: string, text: string) => {
    if (!draft) return;
    persistDraft({
      ...draft,
      scenes: draft.scenes.map((s) =>
        s.id === sceneId
          ? {
              ...s,
              dialogues: s.dialogues.map((d) =>
                d.characterId === characterId ? { ...d, text } : d
              )
            }
          : s
      )
    });
  };

  const selectSuggestion = (scene: CreateStoryScene, suggestion: string) => {
    updateScene(scene.id, { selectedSuggestion: suggestion, storyDescription: suggestion });
  };

  // --- AI Scene Suggestions ---
  const regenerateSuggestions = async (scene: CreateStoryScene) => {
    if (!draft || loadingSuggestions) return;
    setLoadingSuggestions(true);
    setError("");
    try {
      const previousScenes = draft.scenes
        .filter((s) => s.sceneNumber < scene.sceneNumber)
        .map((s) => ({
          sceneNumber: s.sceneNumber,
          title: s.title,
          description: s.storyDescription || s.selectedSuggestion
        }));

      const res = await fetch("/api/story/suggest-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyTitle: draft.storyTitle,
          genres: draft.genres,
          tones: draft.tones,
          characters: draft.characters.map((c) => ({
            name: c.name, role: c.role, personalityTone: c.personalityTone
          })),
          sceneNumber: scene.sceneNumber,
          previousScenes
        })
      });

      const data = await res.json();
      if (!res.ok || !data.suggestions) {
        setError(data.error || "AI suggestions failed. Showing local suggestions.");
        return;
      }

      persistDraft({
        ...draft,
        scenes: draft.scenes.map((s) =>
          s.id === scene.id ? { ...s, suggestions: data.suggestions } : s
        )
      });
    } catch {
      setError("Failed to reach the AI service. Check your connection.");
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // --- AI Dialogue Generation ---
  const generateDialogue = async (scene: CreateStoryScene) => {
    if (!draft || loadingDialogue) return;
    const sceneText = scene.storyDescription.trim() || scene.selectedSuggestion.trim();
    if (!sceneText) {
      setError("Write the scene description or select an AI suggestion before generating dialogue.");
      return;
    }
    setLoadingDialogue(true);
    setError("");
    try {
      const previousScenes = draft.scenes
        .filter((s) => s.sceneNumber < scene.sceneNumber)
        .map((s) => ({
          sceneNumber: s.sceneNumber,
          title: s.title,
          description: s.storyDescription || s.selectedSuggestion,
          dialogues: s.dialogues.map((d) => ({ characterName: d.characterName, text: d.text }))
        }));

      const res = await fetch("/api/story/generate-dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyTitle: draft.storyTitle,
          genres: draft.genres,
          tones: draft.tones,
          characters: draft.characters,
          sceneDescription: sceneText,
          sceneNumber: scene.sceneNumber,
          previousScenes
        })
      });

      const data = await res.json();
      if (!res.ok || !data.dialogues) {
        // Fallback to mock
        persistDraft({
          ...draft,
          scenes: draft.scenes.map((s) =>
            s.id === scene.id
              ? { ...s, dialogues: createMockDialogue({ characters: draft.characters, scene: s, tones: draft.tones }) }
              : s
          )
        });
        setError((data.error || "AI dialogue failed") + " — used local fallback.");
        return;
      }

      persistDraft({
        ...draft,
        scenes: draft.scenes.map((s) =>
          s.id === scene.id
            ? {
                ...s,
                dialogues: s.dialogues.map((d) => {
                  const aiLine = data.dialogues.find(
                    (ai: { characterId: string; text: string }) => ai.characterId === d.characterId
                  );
                  return aiLine ? { ...d, text: aiLine.text } : d;
                })
              }
            : s
        )
      });

      await logActivity("dialogue_generated", { sceneNumber: scene.sceneNumber, storyTitle: draft.storyTitle });
    } catch {
      // Fallback silently
      if (draft) {
        persistDraft({
          ...draft,
          scenes: draft.scenes.map((s) =>
            s.id === scene.id
              ? { ...s, dialogues: createMockDialogue({ characters: draft.characters, scene: s, tones: draft.tones }) }
              : s
          )
        });
      }
      setError("AI unavailable — used local dialogue fallback.");
    } finally {
      setLoadingDialogue(false);
    }
  };

  // --- Add Scene ---
  const addNextScene = async () => {
    if (!draft) return;
    if (draft.scenes.length >= MAX_SCENES) {
      setError(`Maximum ${MAX_SCENES} scenes allowed.`);
      return;
    }
    const sceneNumber = draft.scenes.length + 1;
    const nextScene = createEmptyScene({
      characters: draft.characters,
      genres: draft.genres,
      sceneNumber,
      storyTitle: draft.storyTitle,
      tones: draft.tones
    });
    const nextDraft = {
      ...draft,
      numberOfScenes: Math.max(draft.numberOfScenes, sceneNumber),
      scenes: [...draft.scenes, nextScene]
    };
    persistDraft(nextDraft);
    setActiveSceneId(nextScene.id);
    setError("");
    await logActivity("scene_added", { sceneNumber, storyTitle: draft.storyTitle });
  };

  // --- Delete Scene ---
  const deleteScene = async (sceneId: string) => {
    if (!draft) return;
    if (draft.scenes.length <= 1) {
      setError("At least one scene is required.");
      setDeleteConfirmId(null);
      return;
    }
    const deletedIndex = draft.scenes.findIndex((s) => s.id === sceneId);
    const nextScenes = draft.scenes
      .filter((s) => s.id !== sceneId)
      .map((s, i) => ({ ...s, sceneNumber: i + 1 }));
    const nextActiveId =
      activeSceneId === sceneId
        ? (nextScenes[Math.max(0, deletedIndex - 1)]?.id ?? nextScenes[0]?.id ?? "")
        : activeSceneId;
    persistDraft({ ...draft, scenes: nextScenes });
    setActiveSceneId(nextActiveId);
    setDeleteConfirmId(null);
    setError("");
    await logActivity("scene_deleted", { storyTitle: draft.storyTitle });
  };

  // --- End Story ---
  const endStory = () => {
    if (!draft) return;
    if (draft.scenes.length < 2) {
      setError("Please complete at least 2 scenes before ending the story.");
      return;
    }
    const firstIncomplete = draft.scenes.find(
      (s) => !s.storyDescription.trim() && !s.selectedSuggestion.trim()
    );
    if (firstIncomplete) {
      setActiveSceneId(firstIncomplete.id);
      setError(`Scene ${firstIncomplete.sceneNumber} needs story text before audio generation.`);
      return;
    }
    if (draft.scenes.length < draft.numberOfScenes) {
      const proceed = window.confirm(
        `You selected ${draft.numberOfScenes} scenes but only completed ${draft.scenes.length}. Proceed?`
      );
      if (!proceed) return;
    }
    const hasEmptyDialogues = draft.scenes.some((s) => s.dialogues.some((d) => !d.text.trim()));
    if (hasEmptyDialogues) {
      const proceed = window.confirm(
        "Some dialogues are empty. Voice generation may be incomplete. Proceed?"
      );
      if (!proceed) return;
    }
    saveCreateStoryDraft(draft);
    router.push("/audio-generation");
  };

  if (!draft || !activeScene) {
    return (
      <ProtectedRoute>
        <ScreenLayout eyebrow="AI Story Studio" title="Loading Story Builder" description="Restoring your custom scene draft.">
          <div className="glass-panel rounded-[1.5rem] p-6 text-sm text-white/70">Opening the builder...</div>
        </ScreenLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <ScreenLayout
        eyebrow="AI Story Studio"
        title="AI Story Studio Builder"
        description="Write the story and character dialogue scene by scene. AI suggestions and dialogue are powered by Gemini."
        maxWidth="max-w-7xl"
      >
        <AiStoryStudioStepper currentStep={2} />

        <div className="mb-6 rounded-[1rem] border border-starlight/20 bg-starlight/10 px-5 py-4 text-sm leading-7 text-starlight">
          Build your story scene by scene. Use AI suggestions and Gemini-powered dialogue generation.
        </div>

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="glass-panel rounded-[1.4rem] p-5">
            <p className="text-xs uppercase tracking-[0.26em] text-starlight/70">Current Film</p>
            <h2 className="mt-2 font-[var(--font-heading)] text-2xl text-white">{draft.storyTitle}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {[...draft.genres, ...draft.tones, `${draft.scenes.length}/${MAX_SCENES} scenes`].map((item) => (
                <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/72">
                  {item}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/setup")}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition hover:border-gold/25 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Setup
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.28fr_1fr]">
          {/* Scene List Sidebar */}
          <aside className="glass-panel h-fit rounded-[1.5rem] p-5">
            <p className="text-xs uppercase tracking-[0.28em] text-white/45">Scenes</p>
            <div className="mt-4 space-y-2">
              {draft.scenes.map((scene) => (
                <div key={scene.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => { setActiveSceneId(scene.id); setDeleteConfirmId(null); }}
                    className={`w-full rounded-[1rem] border px-4 py-3 text-left transition ${
                      activeScene.id === scene.id
                        ? "border-gold/35 bg-gold/10 text-white"
                        : "border-white/10 bg-black/20 text-white/65 hover:border-starlight/25"
                    }`}
                  >
                    <span className="block text-xs uppercase tracking-[0.2em] text-starlight/70">
                      Scene {scene.sceneNumber}
                    </span>
                    <span className="mt-1 block text-sm font-semibold">{scene.title}</span>
                  </button>

                  {/* Delete button */}
                  {draft.scenes.length > 1 && (
                    <div className="absolute right-2 top-2">
                      {deleteConfirmId === scene.id ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => deleteScene(scene.id)}
                            className="rounded-full bg-red-500/80 px-2 py-1 text-[10px] font-bold text-white"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(null)}
                            className="rounded-full bg-white/10 p-1"
                          >
                            <X className="h-3 w-3 text-white/60" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(scene.id); }}
                          className="rounded-full p-1.5 text-white/0 group-hover:text-red-400/70 transition-colors hover:bg-red-500/10"
                          title="Delete scene"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {draft.scenes.length < MAX_SCENES ? (
              <button
                type="button"
                onClick={addNextScene}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-starlight/20 bg-starlight/10 px-4 py-3 text-sm font-semibold text-starlight transition hover:bg-starlight/15"
              >
                <Plus className="h-4 w-4" />
                Add Next Scene
              </button>
            ) : (
              <p className="mt-4 rounded-[1rem] border border-white/10 bg-white/5 px-4 py-3 text-center text-xs text-white/50">
                Max {MAX_SCENES} scenes reached
              </p>
            )}
          </aside>

          {/* Main Editor */}
          <section className="space-y-6">
            {/* Scene Planning */}
            <article className="glass-panel rounded-[1.8rem] p-5 sm:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-gold">Step 1: Define Scene</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Scene Planning</h2>
                </div>
                <button
                  type="button"
                  onClick={() => generateDialogue(activeScene)}
                  disabled={loadingDialogue}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-5 py-3 text-sm font-semibold text-slate-950 disabled:opacity-60"
                >
                  {loadingDialogue ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  Generate Dialogue with AI
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="mb-3 block text-sm font-semibold text-white">Scene title</label>
                  <input
                    value={activeScene.title}
                    onChange={(e) => updateScene(activeScene.id, { title: e.target.value })}
                    className="input"
                  />
                </div>

                <div>
                  <label className="mb-3 block text-sm font-semibold text-white">Story / Narration</label>
                  <textarea
                    value={activeScene.storyDescription}
                    onChange={(e) => updateScene(activeScene.id, { storyDescription: e.target.value })}
                    placeholder="Describe what happens in this scene..."
                    className="textarea min-h-40"
                  />
                </div>

                {/* AI Suggestions */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-gold" />
                      <p className="text-sm font-semibold text-white">AI Scene Suggestions</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => regenerateSuggestions(activeScene)}
                      disabled={loadingSuggestions}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gold/20 bg-gold/5 px-3 py-1.5 text-xs font-semibold text-gold transition hover:bg-gold/10 disabled:opacity-50"
                    >
                      {loadingSuggestions
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <RefreshCw className="h-3 w-3" />}
                      {loadingSuggestions ? "Generating..." : "Regenerate with AI"}
                    </button>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    {activeScene.suggestions.map((suggestion, index) => (
                      <button
                        key={`${activeScene.id}-suggestion-${index}`}
                        type="button"
                        onClick={() => selectSuggestion(activeScene, suggestion)}
                        className={`rounded-[1.2rem] border p-4 text-left text-sm leading-7 transition ${
                          activeScene.selectedSuggestion === suggestion
                            ? "border-gold/35 bg-gold/10 text-white"
                            : "border-white/10 bg-black/20 text-white/66 hover:border-starlight/25"
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs uppercase tracking-[0.22em] text-starlight/70">Option {index + 1}</span>
                          {activeScene.selectedSuggestion === suggestion && (
                            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">Selected</span>
                          )}
                        </div>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            {/* Character Dialogues */}
            <article className="glass-panel rounded-[1.8rem] p-5 sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-gold">Step 2: Add Character Dialogues</p>
                  <div className="mt-2 flex items-center gap-2">
                    <MessageSquareText className="h-5 w-5 text-white" />
                    <h2 className="text-xl font-semibold text-white">Character-wise Dialogues</h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:border-gold/25 hover:text-white"
                >
                  <Eye className="h-4 w-4" />
                  Preview Scene
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {activeScene.dialogues.map((dialogue) => {
                  const character = draft.characters.find((c) => c.id === dialogue.characterId);
                  return (
                    <div key={dialogue.characterId} className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-white">{dialogue.characterName}</p>
                        {character && (
                          <>
                            <span className="rounded-full bg-starlight/10 px-2 py-0.5 text-xs text-starlight">{character.role}</span>
                            <span className="rounded-full bg-gold/10 px-2 py-0.5 text-xs text-gold">{character.voiceStyle}</span>
                          </>
                        )}
                      </div>
                      <textarea
                        value={dialogue.text}
                        onChange={(e) => updateDialogue(activeScene.id, dialogue.characterId, e.target.value)}
                        placeholder={`Write ${dialogue.characterName}'s dialogue for this scene`}
                        className="textarea min-h-28"
                      />
                    </div>
                  );
                })}
              </div>
            </article>

            {error && (
              <div className="rounded-[1rem] border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-7 text-red-100">
                {error}
              </div>
            )}

            {/* Continue / End */}
            <div>
              <p className="mb-3 text-xs uppercase tracking-[0.28em] text-gold">Step 3: Continue or End Story</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                {draft.scenes.length < MAX_SCENES && (
                  <button
                    type="button"
                    onClick={addNextScene}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-starlight/20 bg-starlight/10 px-6 py-4 text-sm font-semibold text-starlight transition hover:bg-starlight/15"
                  >
                    <Plus className="h-4 w-4" />
                    Add Next Scene
                  </button>
                )}
                <button
                  type="button"
                  onClick={endStory}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-aurora via-starlight to-gold px-6 py-4 text-sm font-semibold text-slate-950 transition hover:scale-[1.01]"
                >
                  <Check className="h-4 w-4" />
                  End Story
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Preview Modal */}
        {showPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-[1.8rem] border border-white/10 bg-slate-950 p-6 shadow-2xl">
              <h2 className="text-2xl font-bold text-white">{activeScene.title || `Scene ${activeScene.sceneNumber}`}</h2>
              <p className="mt-4 text-sm leading-7 text-white/70">
                {activeScene.storyDescription || activeScene.selectedSuggestion || "No scene description."}
              </p>
              <div className="mt-6 space-y-3">
                {activeScene.dialogues.map((d) => (
                  <div key={d.characterId} className="rounded-xl border border-white/5 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">{d.characterName}</p>
                    <p className="mt-2 text-sm leading-6 text-white/70">{d.text || "No dialogue written."}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="mt-8 w-full rounded-full border border-gold/20 bg-gold/10 px-5 py-3 text-sm font-semibold text-gold transition hover:bg-gold/20"
              >
                Close Preview
              </button>
            </div>
          </div>
        )}
      </ScreenLayout>
    </ProtectedRoute>
  );
}
