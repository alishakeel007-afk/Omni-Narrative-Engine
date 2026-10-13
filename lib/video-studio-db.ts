// ============================================================
// lib/video-studio-db.ts
// Client-side sync helpers between VideoStudioFlowState and the
// Postgres-backed persistence routes. localStorage stays the
// per-viewer cache; the database is the source of truth once a
// projectId/draftId exist.
// ============================================================

import type { VideoStudioFlowState } from "./video-storage";
import type { MovieCharacterVoice, MovieDialogueLine, MovieScene, VideoGenerationResponse } from "@/types/video";

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

export async function saveVideoStudioToDatabase(flow: VideoStudioFlowState): Promise<boolean> {
  if (!flow.projectId || !flow.draftId) return false;
  const script = flow.voiceResult ?? flow.script;
  if (!script) return false;

  try {
    const response = await fetch(`/api/story/${flow.projectId}/video/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftId: flow.draftId,
        flowState: {
          stage: flow.stage,
          roughIdea: flow.roughIdea,
          acceptedStory: flow.acceptedStory,
          generatedStory: flow.generatedStory,
          logline: script.logline,
          estimatedRuntime: script.estimatedRuntime,
          scenesNeedRegeneration: flow.scenesNeedRegeneration,
          voiceNeedsRegeneration: flow.voiceNeedsRegeneration,
          videoOutdated: flow.videoOutdated
        },
        scenes: script.scenes.map((scene) => ({
          sceneNumber: scene.sceneNumber,
          title: scene.title,
          narration: scene.narration,
          location: scene.location,
          mood: scene.mood,
          directorNotes: scene.directorNotes,
          sceneGenre: scene.sceneGenre,
          sceneTone: scene.sceneTone,
          soundDesign: scene.soundDesign,
          visualPrompt: scene.visualPrompt,
          estimatedDuration: scene.estimatedDuration,
          dialogues: scene.dialogues.map((d) => ({
            character: d.character,
            line: d.line,
            delivery: d.delivery,
            audioUrl: d.audioUrl,
            voiceProfile: d.voiceProfile
          })),
          generatedImageUrl: scene.generatedImageUrl,
          generatedImagePrompt: scene.generatedImagePrompt,
          backgroundMusicUrl: scene.backgroundMusicUrl,
          backgroundMusicPrompt: scene.backgroundMusicPrompt
        }))
      })
    });

    return response.ok;
  } catch (err) {
    console.error("[video-studio-db] saveVideoStudioToDatabase failed:", err);
    return false;
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
          stage: string; roughIdea: string; acceptedStory: string; generatedStory: string;
          logline: string; estimatedRuntime: string;
          scenesNeedRegeneration: boolean; voiceNeedsRegeneration: boolean; videoOutdated: boolean;
        } | null;
        genres: string[];
        tones: string[];
        scenes: Array<{
          sceneNumber: number; title: string; narration: string;
          location: string | null; mood: string | null; directorNotes: string | null;
          sceneGenre: string | null; sceneTone: string | null; soundDesign: string | null;
          visualPrompt: string | null; estimatedDuration: string | null;
          dialogues: Array<{ character: string; line: string; delivery: string | null; audioUrl: string | null }>;
          imageUrl: string | null; imagePrompt: string | null;
          musicUrl: string | null; musicPrompt: string | null;
        }>;
        characterVoices: Array<{ name: string; voiceProfile: unknown }>;
      };
    };

    if (!videoStudioState || videoStudioState.scenes.length === 0) return null;

    const voiceByName = new Map<string, MovieCharacterVoice>();
    for (const cv of videoStudioState.characterVoices) {
      if (cv.voiceProfile && typeof cv.voiceProfile === "object") {
        voiceByName.set(cv.name.toLowerCase(), cv.voiceProfile as MovieCharacterVoice);
      }
    }

    const scenes: MovieScene[] = videoStudioState.scenes.map((s, sceneIndex) => {
      const dialogues: MovieDialogueLine[] = s.dialogues.map((d, dialogueIndex) => ({
        id: `scene-${s.sceneNumber}-dialogue-${dialogueIndex + 1}`,
        character: d.character,
        line: d.line,
        delivery: d.delivery ?? "natural",
        audioUrl: d.audioUrl ?? undefined,
        voiceProfile: voiceByName.get(d.character.toLowerCase()) ?? { ...DEFAULT_VOICE_PROFILE, character: d.character }
      }));

      return {
        sceneNumber: s.sceneNumber,
        title: s.title,
        narration: s.narration,
        location: s.location ?? "",
        mood: s.mood ?? "",
        directorNotes: s.directorNotes ?? "",
        sceneGenre: s.sceneGenre ?? "",
        sceneTone: s.sceneTone ?? "",
        soundDesign: s.soundDesign ?? "",
        visualPrompt: s.visualPrompt ?? "",
        estimatedDuration: s.estimatedDuration ?? "",
        imagePrompt: s.imagePrompt ?? "",
        dialogues,
        generatedImageUrl: s.imageUrl ?? undefined,
        generatedImagePrompt: s.imagePrompt ?? undefined,
        generatedImageStatus: s.imageUrl ? "completed" : "idle",
        backgroundMusicUrl: s.musicUrl ?? undefined,
        backgroundMusicPrompt: s.musicPrompt ?? undefined,
        backgroundMusicStatus: s.musicUrl ? "completed" : "idle"
      };
    });

    const meta = videoStudioState.videoStudioState;
    const script: VideoGenerationResponse = {
      audio: { errors: [], generatedCount: 0, provider: "Deepgram TTS", requested: false },
      estimatedRuntime: meta?.estimatedRuntime || "",
      generatedAt: new Date().toISOString(),
      genre: videoStudioState.genres.join(" + "),
      id: `video-${videoStudioState.draftId}`,
      characterVoices: Array.from(voiceByName.values()),
      logline: meta?.logline || "",
      scenes,
      title: scenes[0]?.title || "Untitled Film",
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
      music: {
        message: scenes.some((s) => s.backgroundMusicUrl) ? "Background music restored from your saved project." : "Background music has not been generated yet.",
        mood: "",
        provider: "",
        status: scenes.some((s) => s.backgroundMusicUrl) ? "ready" : "idle",
        title: "",
        trackUrl: scenes.find((s) => s.backgroundMusicUrl)?.backgroundMusicUrl || ""
      },
      roughIdea: meta?.roughIdea || "",
      sceneCount: scenes.length,
      scenesNeedRegeneration: meta?.scenesNeedRegeneration ?? false,
      script,
      stage: (meta?.stage as VideoStudioFlowState["stage"]) || "scenes",
      tones: videoStudioState.tones.length > 0 ? videoStudioState.tones : ["Immersive and emotional"],
      updatedAt: new Date().toISOString(),
      videoOutdated: meta?.videoOutdated ?? false,
      voiceNeedsRegeneration: meta?.voiceNeedsRegeneration ?? false,
      voiceResult: dialoguesHaveAudio(scenes) ? script : null,
      projectId: videoStudioState.projectId,
      draftId: videoStudioState.draftId
    };
  } catch (err) {
    console.error("[video-studio-db] loadVideoStudioFromDatabase failed:", err);
    return null;
  }
}

function dialoguesHaveAudio(scenes: MovieScene[]): boolean {
  return scenes.some((scene) => scene.dialogues.some((d) => Boolean(d.audioUrl)));
}
