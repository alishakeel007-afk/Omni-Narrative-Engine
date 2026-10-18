// ============================================================
// lib/video-studio-db.ts
// Client-side sync helpers between VideoStudioFlowState and the
// Postgres-backed persistence routes. localStorage stays the
// per-viewer cache; the database is the source of truth once a
// projectId/draftId exist.
// ============================================================

import { VIDEO_STAGE_LABELS, type VideoStudioFlowState } from "./video-storage";
import type { MovieCharacterVoice, MovieDialogueLine, MovieScene, VideoGenerationResponse, VideoLanguage } from "@/types/video";
import { resolveDialogueEmotion, type DialogueEmotion } from "@/lib/audio/emotion-informed-delivery";
import { applyVideoMediaFreshness, collectVideoMediaFreshness } from "@/lib/video-media-freshness";

const DEFAULT_VOICE_PROFILE: MovieCharacterVoice = {
  archetype: "neutral_female",
  character: "",
  deepgramModel: "aura-2-andromeda-en",
  description: "casual expressive voice",
  gender: "feminine",
  tone: "natural",
  voiceName: "Andromeda"
};

export async function createVideoStudioProject(flow: VideoStudioFlowState): Promise<{ projectId: string; draftId: string } | null> {
  try {
    const response = await fetch("/api/story/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: flow.script?.title || "Untitled Film",
        mode: "CUSTOM",
        draft: {
          title: flow.script?.title || "Video Studio Draft",
          genres: flow.genres,
          tones: flow.tones,
          numberOfScenes: Math.max(1, flow.script?.scenes.length || flow.sceneCount || 1)
        }
      })
    });

    if (!response.ok) return null;

    const data = await response.json() as { project?: { id: string; drafts?: { id: string }[] } };
    const projectId = data.project?.id;
    const draftId = data.project?.drafts?.[0]?.id;
    if (!projectId || !draftId) return null;

    return { projectId, draftId };
  } catch (err) {
    console.error("[video-studio-db] createVideoStudioProject failed:", err);
    return null;
  }
}
export type VideoStudioSaveResult = { success: boolean; sceneIds: Record<number, string> };

export async function saveVideoStudioToDatabase(flow: VideoStudioFlowState): Promise<VideoStudioSaveResult> {
  if (!flow.projectId || !flow.draftId) return { success: false, sceneIds: {} };
  // `script` is the editable canonical document. `voiceResult` is a prior
  // generation snapshot and must never overwrite newer scene edits on save.
  const script = flow.script ?? flow.voiceResult;
  if (!script) return { success: false, sceneIds: {} };
  const dialogueEmotions: Record<string, DialogueEmotion> = {};
  for (const scene of script.scenes) {
    for (const [dialogueIndex, dialogue] of scene.dialogues.entries()) {
      // Scene/order is what the existing relational persistence restores; client
      // dialogue IDs may be regenerated after a database reload.
      dialogueEmotions[`${scene.sceneNumber}:${dialogueIndex}`] = resolveDialogueEmotion({ line: dialogue, scene }).emotion;
    }
  }

  try {
    const response = await fetch(`/api/story/${flow.projectId}/video/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftId: flow.draftId,
        flowState: {
          stage: flow.stage,
          returnStage: flow.returnStage,
          roughIdea: flow.roughIdea,
          acceptedStory: flow.acceptedStory,
          generatedStory: flow.generatedStory,
          language: flow.language,
          scriptLanguage: flow.scriptLanguage,
          title: script.title,
          logline: script.logline,
          estimatedRuntime: script.estimatedRuntime,
          scenesNeedRegeneration: flow.scenesNeedRegeneration,
          voiceNeedsRegeneration: flow.voiceNeedsRegeneration,
          videoOutdated: flow.videoOutdated,
          dialogueEmotions,
          musicDecisions: flow.musicDecisions,
          mediaFreshness: collectVideoMediaFreshness(script.scenes),
          visualDirections: Object.fromEntries(script.scenes.flatMap((scene) => scene.persistenceSceneId && scene.visualDirection ? [[scene.persistenceSceneId, scene.visualDirection]] : [])),
        },
        scenes: script.scenes.map((scene) => ({
          sceneNumber: scene.sceneNumber,
          persistenceSceneId: scene.persistenceSceneId,
          title: scene.title,
          narration: scene.narration,
          narrationAudioUrl: scene.narrationAudioUrl,
          location: scene.location,
          mood: scene.mood,
          directorNotes: scene.directorNotes,
          sceneGenre: scene.sceneGenre,
          sceneTone: scene.sceneTone,
          soundDesign: scene.soundDesign,
          visualPrompt: scene.visualPrompt,
          imagePrompt: scene.imagePrompt,
          estimatedDuration: scene.estimatedDuration,
          dialogues: scene.dialogues.map((d, position) => ({
            position,
            character: d.character,
            line: d.line,
            delivery: d.delivery,
            audioUrl: d.audioUrl,
            voiceProfile: d.voiceProfile
          })),
          generatedImageUrl: scene.generatedImageUrl,
          generatedImagePrompt: scene.generatedImagePrompt,
          backgroundMusicUrl: scene.backgroundMusicUrl,
          backgroundMusicPrompt: scene.backgroundMusicPrompt,
          backgroundMusicProvider: scene.backgroundMusicProvider,
        }))
      })
    });

    if (!response.ok) return { success: false, sceneIds: {} };
    const payload = await response.json() as { sceneIds?: Record<string, string> };
    const sceneIds = Object.fromEntries(Object.entries(payload.sceneIds ?? {}).flatMap(([sceneNumber, id]) => {
      const parsed = Number(sceneNumber);
      return Number.isSafeInteger(parsed) && parsed > 0 && typeof id === "string" ? [[parsed, id]] : [];
    }));
    return { success: true, sceneIds };
  } catch (err) {
    console.error("[video-studio-db] saveVideoStudioToDatabase failed:", err);
    return { success: false, sceneIds: {} };
  }
}
export async function loadVideoStudioFromDatabase(projectId: string): Promise<VideoStudioFlowState | null> {
  try {
    const response = await fetch(`/api/story/${projectId}/video/load`);
    if (!response.ok) return null;

    const { videoStudioState } = await response.json() as {
      videoStudioState: {
        projectId: string;
        draftId: string;
        videoStudioState: {
          stage: string; returnStage?: string; roughIdea: string; acceptedStory: string; generatedStory: string; language?: VideoLanguage; scriptLanguage?: VideoLanguage; title?: string;
          logline: string; estimatedRuntime: string;
          scenesNeedRegeneration: boolean; voiceNeedsRegeneration: boolean; videoOutdated: boolean;
          musicDecisions?: Record<string, { outcome: "silence" | "music"; category?: "ambient" | "suspense" | "emotional" | "action" | "hopeful"; reason: string }>;
          dialogueEmotions?: Record<string, DialogueEmotion>;
          mediaFreshness?: import("@/lib/video-media-freshness").VideoMediaFreshness;
          visualDirections?: Record<string, import("@/lib/image/scene-visual-context").SceneVisualDirection>;
        } | null;
        genres: string[];
        tones: string[];
        scenes: Array<{
          id: string;
          sceneNumber: number; title: string; narration: string;
          location: string | null; mood: string | null; directorNotes: string | null;
          sceneGenre: string | null; sceneTone: string | null; soundDesign: string | null;
          visualPrompt: string | null; authoredImagePrompt: string | null; estimatedDuration: string | null;
          dialogues: Array<{ id: string; position: number; character: string; line: string; delivery: string | null; audioUrl: string | null }>;
          imageUrl: string | null; imagePrompt: string | null; narrationAudioUrl: string | null;
          musicUrl: string | null; musicPrompt: string | null; musicProvider: string | null;
        }>;
        characterVoices: Array<{ name: string; voiceProfile: unknown; currentEmotionalState?: string | null }>;
      };
    };

    if (!videoStudioState || videoStudioState.scenes.length === 0) return null;

    const voiceByName = new Map<string, MovieCharacterVoice>();
    for (const cv of videoStudioState.characterVoices) {
      if (cv.voiceProfile && typeof cv.voiceProfile === "object") {
        voiceByName.set(cv.name.toLowerCase(), {
          ...(cv.voiceProfile as MovieCharacterVoice),
          ...(typeof cv.currentEmotionalState === "string" && cv.currentEmotionalState.trim()
            ? { currentEmotionalState: cv.currentEmotionalState }
            : {}),
        });
      }
    }

    // The persistence query orders scenes, but retain a defensive sort here so
    // an intermediary/cache response cannot scramble playback or editing.
    const orderedScenes = [...videoStudioState.scenes].sort((left, right) => left.sceneNumber - right.sceneNumber);
    const scenes: MovieScene[] = orderedScenes.map((s, sceneIndex) => {
      const persistedDecision = videoStudioState.videoStudioState?.musicDecisions?.[String(s.sceneNumber)];
      const dialogues: MovieDialogueLine[] = [...s.dialogues]
        .sort((left, right) => left.position - right.position)
        .map((d, dialogueIndex) => ({
        // Use the persisted Dialogue identity rather than mutable scene/order
        // labels so a restored clip remains tied to its authored line.
        id: d.id,
        character: d.character,
        line: d.line,
        delivery: d.delivery ?? "natural",
        audioUrl: d.audioUrl ?? undefined,
        emotion: videoStudioState.videoStudioState?.dialogueEmotions?.[`${s.sceneNumber}:${dialogueIndex}`]
          ?? resolveDialogueEmotion({ line: { ...d, delivery: d.delivery ?? "natural", voiceProfile: voiceByName.get(d.character.toLowerCase()) ?? { ...DEFAULT_VOICE_PROFILE, character: d.character } }, scene: { mood: s.mood ?? "", sceneTone: s.sceneTone ?? "" } }).emotion,
        voiceProfile: voiceByName.get(d.character.toLowerCase()) ?? { ...DEFAULT_VOICE_PROFILE, character: d.character }
      }));

      return applyVideoMediaFreshness({
        persistenceSceneId: s.id,
        sceneNumber: s.sceneNumber,
        title: s.title,
        narration: s.narration,
        narrationAudioUrl: s.narrationAudioUrl ?? undefined,
        location: s.location ?? "",
        mood: s.mood ?? "",
        directorNotes: s.directorNotes ?? "",
        sceneGenre: s.sceneGenre ?? "",
        sceneTone: s.sceneTone ?? "",
        soundDesign: s.soundDesign ?? "",
        visualPrompt: s.visualPrompt ?? "",
        estimatedDuration: s.estimatedDuration ?? "",
        imagePrompt: s.authoredImagePrompt ?? "",
        visualDirection: videoStudioState.videoStudioState?.visualDirections?.[s.id],
        dialogues,
        generatedImageUrl: s.imageUrl ?? undefined,
        generatedImagePrompt: s.imagePrompt ?? undefined,
        generatedImageStatus: s.imageUrl ? "completed" : "idle",
        backgroundMusicUrl: s.musicUrl ?? undefined,
        backgroundMusicPrompt: s.musicPrompt ?? undefined,
        backgroundMusicProvider: s.musicProvider ?? undefined,
        backgroundMusicReason: persistedDecision?.reason ?? s.musicPrompt ?? undefined,
        backgroundMusicCategory: persistedDecision?.outcome === "music" ? persistedDecision.category : undefined,
        backgroundMusicStatus: s.musicUrl ? "completed" : persistedDecision?.outcome === "silence" ? "silent" : "idle"
      }, videoStudioState.videoStudioState?.mediaFreshness?.[s.id]);
    });

    const meta = videoStudioState.videoStudioState;
    const restoredStage = VIDEO_STAGE_LABELS.some((item) => item.id === meta?.stage)
      ? meta!.stage as VideoStudioFlowState["stage"]
      : "scenes";
    const restoredReturnStage = VIDEO_STAGE_LABELS.some((item) => item.id === meta?.returnStage && item.id !== "preview")
      ? meta!.returnStage as VideoStudioFlowState["returnStage"]
      : undefined;
    const restoredLanguage: VideoLanguage = meta?.language === "ur" ? "ur" : "en";
    const script: VideoGenerationResponse = {
      audio: {
        errors: [],
        generatedCount: 0,
        provider: restoredLanguage === "ur" ? "ElevenLabs Eleven v3" : "Deepgram TTS",
        requested: false
      },
      estimatedRuntime: meta?.estimatedRuntime || "",
      generatedAt: new Date().toISOString(),
      genre: videoStudioState.genres.join(" + "),
      id: `video-${videoStudioState.draftId}`,
      characterVoices: Array.from(voiceByName.values()),
      logline: meta?.logline || "",
      scenes,
      title: meta?.title || scenes[0]?.title || "Untitled Film",
      tone: videoStudioState.tones.join(" + ")
    };

    return {
      acceptedStory: meta?.acceptedStory || "",
      generatedStory: meta?.generatedStory || "",
      genres: videoStudioState.genres.length > 0 ? videoStudioState.genres : ["Cinematic Drama"],
      images: {
        message: scenes.some((s) => s.generatedImageUrl) ? "Visual images restored from your saved project." : "Visual images have not been generated yet.",
        provider: "",
        status: scenes.some((s) => s.generatedImageUrl) ? "ready" : "idle"
      },
      language: restoredLanguage,
      scriptLanguage: meta?.scriptLanguage === "ur" ? "ur" : meta?.scriptLanguage === "en" ? "en" : (scenes.length ? restoredLanguage : undefined),
      music: {
        message: scenes.some((s) => s.backgroundMusicUrl) ? "Background music restored from your saved project." : "Background music has not been generated yet.",
        mood: "",
        provider: "",
        status: scenes.some((s) => s.backgroundMusicUrl) ? "ready" : "idle",
        title: "",
        trackUrl: scenes.find((s) => s.backgroundMusicUrl)?.backgroundMusicUrl || ""
      },
      musicDecisions: videoStudioState.videoStudioState?.musicDecisions ?? {},
      dialogueEmotions: videoStudioState.videoStudioState?.dialogueEmotions ?? {},
      roughIdea: meta?.roughIdea || "",
      sceneCount: scenes.length,
      scenesNeedRegeneration: meta?.scenesNeedRegeneration ?? false,
      script,
      stage: restoredStage,
      returnStage: restoredReturnStage,
      tones: videoStudioState.tones.length > 0 ? videoStudioState.tones : ["Immersive and emotional"],
      updatedAt: new Date().toISOString(),
      videoOutdated: meta?.videoOutdated ?? false,
      voiceNeedsRegeneration: meta?.voiceNeedsRegeneration ?? false,
      voiceResult: scenes.some((scene) => scene.narrationAudioUrl || scene.dialogues.some((dialogue) => Boolean(dialogue.audioUrl))) ? script : null,
      projectId: videoStudioState.projectId,
      draftId: videoStudioState.draftId
    };
  } catch (err) {
    console.error("[video-studio-db] loadVideoStudioFromDatabase failed:", err);
    return null;
  }
}
