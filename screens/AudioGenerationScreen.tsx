"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { loadCustomStoryFromDatabase, saveCustomStoryToDatabase } from "@/lib/custom-story-db";
import { applyCustomVoiceResponse, buildCustomVoiceRequest, customDraftToMovieScenes, customSceneMusicDecision, isCurrentCustomDialogueAudio, isCurrentCustomNarrationAudio } from "@/lib/custom-story-multimedia";
import { buildSceneVisualContext } from "@/lib/image/scene-visual-context";
import { customAudioFingerprint, customDialogueVoiceConfiguration } from "@/lib/custom-story-audio-freshness";
import type { CreateStoryDraft } from "@/types/create-story";
import { logActivity } from "@/lib/log-activity";

export default function AudioGenerationScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [draft, setDraft] = useState<CreateStoryDraft | null>(null);
  const [generatingMusic, setGeneratingMusic] = useState(false);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const requestedProjectId = searchParams.get("project");

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      const restored = requestedProjectId ? await loadCustomStoryFromDatabase(requestedProjectId) : loadCreateStoryDraft();
      if (!cancelled) setDraft(restored);
    };
    void restore();
    return () => { cancelled = true; };
  }, [requestedProjectId]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !draft) return;
    for (const scene of draft.scenes) {
      for (const dialogue of scene.dialogues) {
        console.info("Custom dialogue player diagnostic", {
          sceneId: scene.id,
          dialogueId: dialogue.id,
          speaker: dialogue.characterName,
          ttsTextFingerprint: customAudioFingerprint(dialogue.text, customDialogueVoiceConfiguration(dialogue), draft.language),
          storedClipFingerprint: dialogue.audioFingerprint ?? "missing",
          storageObject: dialogue.audioStoragePath?.split("/").pop() ?? "unverified",
          playerSource: dialogue.audioStoragePath?.split("/").pop() ?? "none",
        });
      }
    }
  }, [draft]);

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
    if (nextDraft.projectId && nextDraft.draftId) {
      // Serialize updates so an older generation result cannot overwrite a
      // newer authored edit or regenerated media state.
      saveChain.current = saveChain.current.then(async () => { await saveCustomStoryToDatabase(nextDraft); });
    }
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
      const voiceRequest = buildCustomVoiceRequest(draft);
      if (!voiceRequest.scenes.some((scene) => scene.dialogues.length > 0)) {
        persistDraft({ ...draft, audio: { ...draft.audio, voiceStatus: "ready", voiceMessage: "Existing narration and dialogue clips are already available." } });
        return;
      }

      const res = await fetch("/api/video/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // This workflow is browser-local by design. It must never create
        // unassociated Supabase Storage media.
        body: JSON.stringify({
          script: voiceRequest,
          language: draft.language,
          scriptLanguage: draft.language,
          ...(draft.projectId && draft.draftId ? { projectId: draft.projectId, draftId: draft.draftId } : { transient: true }),
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate voices");
      }

      // Map the returned audioUrls back to our draft
      const generatedCount = data.audio?.generatedCount ?? 0;
      const providerErrors = Array.isArray(data.audio?.errors) ? data.audio.errors.filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim())) : [];

      persistDraft({
        ...draft,
        ...applyCustomVoiceResponse(draft, data),
        audio: {
          ...draft.audio,
          voiceMessage: providerErrors.length
            ? `${generatedCount} voice line(s) generated; ${providerErrors.length} clip(s) need retry.`
            : `Generated ${generatedCount} voice lines successfully.`,
          voiceStatus: providerErrors.length ? "error" : "ready"
        }
      });

      await logActivity("audio_generated", { type: "voice", storyTitle: draft.storyTitle, lines: generatedCount });

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

  const generateMissingMusic = async () => {
    if (!draft || generatingMusic) return;
    if (!draft.projectId || !draft.draftId) {
      persistDraft({ ...draft, audio: { ...draft.audio, backgroundMusicStatus: "idle", backgroundMusicMessage: "Save this Custom project to My Projects before generating a cinematic score." } });
      return;
    }
    setGeneratingMusic(true);
    let failures = 0; let generated = 0;
    const nextScenes = [...draft.scenes];
    for (const [index, scene] of nextScenes.entries()) {
      const decision = customSceneMusicDecision(scene);
      if (decision.outcome === "silence") { nextScenes[index] = { ...scene, backgroundMusicStatus: "silent", backgroundMusicUrl: undefined }; continue; }
      if (scene.backgroundMusicUrl && scene.backgroundMusicStatus === "ready") continue;
      try {
        nextScenes[index] = { ...scene, backgroundMusicStatus: "generating" };
        const { createSampleScoreRecipe, renderSampleBasedScore } = await import("@/lib/audio/sample-score");
        const rendered = await renderSampleBasedScore(createSampleScoreRecipe({ category: decision.category, sceneTitle: scene.title, mood: scene.sceneTone, genres: draft.genres, seed: Date.now() + index }));
        const form = new FormData();
        form.set("projectId", draft.projectId); form.set("draftId", draft.draftId); form.set("sceneId", scene.id); form.set("sceneNumber", String(scene.sceneNumber)); form.set("file", new File([rendered.wav], `scene-${scene.sceneNumber}.wav`, { type: "audio/wav" }));
        const response = await fetch("/api/story/custom/music", { method: "POST", body: form });
        const payload = await response.json() as { audioUrl?: string; provider?: string; error?: string };
        if (!response.ok || !payload.audioUrl) throw new Error(payload.error ?? "Could not save score.");
        nextScenes[index] = { ...scene, backgroundMusicUrl: payload.audioUrl, backgroundMusicStatus: "ready", backgroundMusicProvider: payload.provider, backgroundMusicPrompt: decision.reason };
        generated += 1;
      } catch {
        failures += 1;
        nextScenes[index] = { ...scene, backgroundMusicStatus: "error" };
      }
    }
    persistDraft({ ...draft, scenes: nextScenes, audio: { ...draft.audio, backgroundMusicStatus: failures ? "error" : "ready", backgroundMusicMessage: failures ? `${generated} score(s) saved; some scenes need retry.` : generated ? `${generated} cinematic score(s) saved.` : "Existing scores and intentional silence were kept." } });
    setGeneratingMusic(false);
  };

  const generateVisuals = async (forceRegenerateAll = false) => {
    if (!draft || draft.visuals.status === "generating") return;

    persistDraft({
      ...draft,
      visuals: {
        message: "Generating scene visuals...",
        status: "generating"
      }
    });

    let errorsOccurred = false;
    const updatedScenes = draft.scenes.map((scene) =>
      forceRegenerateAll
        // A regeneration is a replacement attempt. Keep the last good image
        // visible until the server has attached a successful replacement.
        ? { ...scene, generatedImageStatus: "idle" as const, generatedImageError: undefined }
        : { ...scene }
    );

    for (const scene of updatedScenes) {
      if (!forceRegenerateAll && (scene.generatedImageStatus === "ready" || scene.generatedImageUrl)) continue;

      scene.generatedImageStatus = "generating";
      const previous = draft.scenes
        .filter((candidate) => candidate.sceneNumber < scene.sceneNumber)
        .sort((left, right) => right.sceneNumber - left.sceneNumber)[0];
      const visualContext = buildSceneVisualContext({
        scene: {
          title: scene.title,
          storyDescription: scene.storyDescription,
          selectedSuggestion: scene.selectedSuggestion,
          mood: scene.sceneTone,
          dialogueCharacterNames: scene.dialogues.map((dialogue) => dialogue.characterName),
          activeCharacterIds: scene.activeCharacterIds,
          visualDirection: scene.visualDirection,
        },
        characters: draft.characters.map((character) => ({
          id: character.id,
          name: character.name,
          role: character.role,
          personalityTone: character.personalityTone,
        })),
        priorScene: previous ? {
          title: previous.title,
          imagePrompt: previous.generatedImagePrompt,
          visualPrompt: previous.storyDescription || previous.selectedSuggestion,
        } : undefined,
      });

      try {
        const res = await fetch("/api/video/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneId: scene.id,
            imagePrompt: visualContext.imagePrompt,
            sceneTitle: scene.title,
            ...(visualContext.visualPrompt ? { visualPrompt: visualContext.visualPrompt } : {}),
            location: visualContext.location,
            mood: visualContext.mood,
            genres: draft.genres,
            existingHash: undefined,
            characterNames: visualContext.characterNames,
            characterAppearances: visualContext.characterAppearances,
            continuityNotes: visualContext.continuityNotes,
            ...(draft.projectId && draft.draftId ? { projectId: draft.projectId, draftId: draft.draftId, customSceneId: scene.id } : { transient: true })
          })
        });
        const data = await res.json();
        if (!res.ok || !data.imageUrl) {
          throw new Error(data.error ?? `Failed to generate visual for "${scene.title}".`);
        }
        scene.generatedImageUrl = data.imageUrl;
        scene.generatedImagePrompt = data.prompt;
        scene.generatedImageStatus = "ready";
        scene.generatedImageError = undefined;
      } catch (err) {
        errorsOccurred = true;
        scene.generatedImageStatus = scene.generatedImageUrl ? "ready" : "error";
        scene.generatedImageError = err instanceof Error ? err.message : "Visual generation failed";
      }
    }

    persistDraft({
      ...draft,
      scenes: updatedScenes,
      visuals: {
        message: errorsOccurred
          ? "Scene visuals generated, but some scenes failed."
          : "All scene visuals are ready.",
        status: updatedScenes.some((s) => s.generatedImageUrl) ? "ready" : "error"
      }
    });

    await logActivity("visuals_generated", { storyTitle: draft.storyTitle });
  };

  const generateVideo = async () => {
    if (!draft) return;

    const nextDraft = {
      ...draft,
      video: {
        message: "Browser story preview is ready. Final MP4 export is not included.",
        status: "ready" as const
      }
    };

    persistDraft(nextDraft);
    await logActivity("video_previewed", { storyTitle: draft.storyTitle });
    router.push(`/video-preview?mode=custom${draft.projectId ? `&project=${encodeURIComponent(draft.projectId)}` : ""}`);
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
  const visualsReady = draft.scenes.length > 0 && draft.scenes.every((s) => Boolean(s.generatedImageUrl));
  const canGenerateVideo = draft.scenes.length > 0 && voiceReady && visualsReady;

  const currentStep: AiStoryStudioStep = visualsReady
      ? 5
      : voiceReady
        ? 4
        : 3;

  return (
    <ProtectedRoute>
      <ScreenLayout
        eyebrow="AI Story Studio"
        title="Audio Generation"
        description="Review the final story, assign voice placeholders, generate character voices, preview scene visuals, and background music, then continue to video preview."
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
              <Stat label="Visuals" value={draft.visuals.status} />
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
                onClick={() => generateVisuals(false)}
                disabled={draft.visuals.status === "generating"}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-5 py-3 text-sm font-semibold text-gold transition-all duration-300 hover:bg-gold/15 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
              >
                {draft.visuals.status === "generating" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {visualsReady ? "Regenerate Visuals" : "Preview Visuals"}
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => void generateMissingMusic()}
                disabled={generatingMusic}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-starlight/20 bg-starlight/10 px-5 py-3 text-sm font-semibold text-starlight transition-all duration-300 hover:bg-starlight/15 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
              >
                {generatingMusic ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4" />}
                Generate Missing Music
              </button>
              <p className="mt-1 text-center text-[10px] text-white/75 uppercase tracking-tighter italic">Optional; intentional silence is preserved</p>
            </div>

            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => router.push(`/story-builder${draft.projectId ? `?project=${encodeURIComponent(draft.projectId)}` : ""}`)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white/80 transition-all duration-300 hover:border-gold/25 hover:text-white hover:scale-[1.02] active:scale-[0.98]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <PreviewFinalAudioButton
                scenes={draft.scenes.map(scene => ({
                  sceneNumber: scene.sceneNumber,
                  backgroundMusicUrl: scene.backgroundMusicStatus === "silent" ? undefined : scene.backgroundMusicUrl,
                  dialogues: [
                    ...(isCurrentCustomNarrationAudio(draft, scene) ? [{ audioUrl: scene.narrationAudioUrl! }] : []),
                    ...scene.dialogues.filter((dialogue) => isCurrentCustomDialogueAudio(draft, dialogue))
                  ]
                }))}
              />
              <p className="mt-1 text-center text-[10px] text-white/75 uppercase tracking-tighter italic">Music is optional</p>
            </div>

            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={generateVideo}
                disabled={!canGenerateVideo}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-gold/25 bg-gold/10 px-5 py-3 text-sm font-semibold text-gold transition-all duration-300 hover:bg-gold/15 hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
              >
                <Clapperboard className="h-4 w-4" />
                Open Story Preview
              </button>
              {!canGenerateVideo && (
                <p className="mt-1 text-center text-[10px] text-white/75 uppercase tracking-tighter italic">Complete all audio and visuals</p>
              )}
            </div>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            <StatusPanel
              icon={<Mic2 className="h-4 w-4" />}
              label="Voice Status"
              message={draft.audio.voiceMessage}
              status={draft.audio.voiceStatus}
            />
            <StatusPanel
              icon={<Sparkles className="h-4 w-4" />}
              label="Visuals Status"
              message={draft.visuals.message}
              status={draft.visuals.status}
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
              {scene.generatedImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={scene.generatedImageUrl}
                  alt={scene.title}
                  className="h-56 w-full object-cover"
                />
              ) : scene.generatedImageStatus === "generating" ? (
                <div className="flex h-40 items-center justify-center bg-black/20 text-sm text-white/60">
                  Generating scene visual...
                </div>
              ) : scene.generatedImageStatus === "error" ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 bg-black/20 px-4 text-center text-sm text-red-300">
                  <span>{scene.generatedImageError || "Visual generation failed."}</span>
                </div>
              ) : null}
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
                  <CustomVisualBriefSummary scene={scene} characters={draft.characters} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => persistDraft({ ...draft, scenes: draft.scenes.map((item) => item.id === scene.id ? { ...item, backgroundMusicStatus: item.backgroundMusicStatus === "silent" ? "idle" : "silent" } : item) })}
                    className="rounded-full border border-starlight/20 bg-starlight/10 px-3 py-2 text-xs font-semibold text-starlight"
                  >
                    {scene.backgroundMusicStatus === "silent" ? "Use Scene Music" : "Intentional Silence"}
                  </button>
                  <PlaySceneAudioButton audioUrls={[
                    ...(isCurrentCustomNarrationAudio(draft, scene) ? [scene.narrationAudioUrl!] : []),
                    ...scene.dialogues.filter((dialogue) => isCurrentCustomDialogueAudio(draft, dialogue)).flatMap((dialogue) => dialogue.audioUrl ? [dialogue.audioUrl] : []),
                  ]} />
                </div>
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
                    {isCurrentCustomDialogueAudio(draft, dialogue) ? (
                      <audio controls src={dialogue.audioUrl} className="mt-3 w-full" />
                    ) : (
                      <p className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/75">
                        {dialogue.audioUrl ? "Outdated — regenerate this dialogue to match the displayed text." : "Waiting for voice generation."}
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

function CustomVisualBriefSummary({ scene, characters }: { scene: CreateStoryDraft["scenes"][number]; characters: CreateStoryDraft["characters"] }) {
  const { brief } = buildSceneVisualContext({
    scene: {
      id: scene.id,
      title: scene.title,
      storyDescription: scene.storyDescription,
      selectedSuggestion: scene.selectedSuggestion,
      mood: scene.sceneTone,
      dialogueCharacterNames: scene.dialogues.map((dialogue) => dialogue.characterName),
      activeCharacterIds: scene.activeCharacterIds,
      visualDirection: scene.visualDirection,
    },
    characters: characters.map((character) => ({ id: character.id, name: character.name, role: character.role, personalityTone: character.personalityTone })),
  });
  return (
    <details className="mt-3 max-w-xl rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/80">
      <summary className="cursor-pointer font-medium text-starlight">Review visual brief before generating</summary>
      <p className="mt-2"><span className="font-semibold text-white">Required:</span> {brief.requiredVisualEvents.join(" ") || "No visual event authored."}</p>
      <p className="mt-1"><span className="font-semibold text-white">Characters:</span> {brief.presentCharacterNames.join(", ") || "None identified"}</p>
      {brief.warnings.map((warning) => <p key={warning} role="alert" className="mt-2 rounded border border-amber-300/50 bg-amber-100/10 p-2 font-medium text-amber-100">{warning}</p>)}
    </details>
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
