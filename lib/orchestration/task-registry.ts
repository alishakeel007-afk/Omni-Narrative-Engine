/**
 * Module 7.8 – Asynchronous Processing & System Orchestration
 * Task Registry: Maps task queue names to execution pipelines and custom background tasks.
 */

import { taskQueue } from "./task-queue";
import { runPipeline } from "./pipeline";
import { GUIDED_STORY_SCENE_PIPELINE, GENERATE_OPTIONS_PIPELINE } from "./pipelines/story-pipelines";
import { VIDEO_STUDIO_FULL_PIPELINE, VIDEO_VOICE_ONLY_PIPELINE, VIDEO_MUSIC_ONLY_PIPELINE } from "./pipelines/video-pipelines";

let registered = false;

export function registerAllTasks(): void {
  if (registered) return;
  registered = true;

  // Active Story Loop tasks
  taskQueue.register("guided-story-scene", async (payload: any) => {
    const result = await runPipeline(GUIDED_STORY_SCENE_PIPELINE, payload);
    if (!result.success) throw new Error(result.error);
    return result.finalResult;
  });

  taskQueue.register("guided-story-options", async (payload: any) => {
    const result = await runPipeline(GENERATE_OPTIONS_PIPELINE, payload);
    if (!result.success) throw new Error(result.error);
    return result.finalResult;
  });

  // Guided Video Studio tasks
  taskQueue.register("video-studio-full", async (payload: any) => {
    const result = await runPipeline(VIDEO_STUDIO_FULL_PIPELINE, payload);
    if (!result.success) throw new Error(result.error);
    return result.finalResult;
  });

  taskQueue.register("video-voice-only", async (payload: any) => {
    const result = await runPipeline(VIDEO_VOICE_ONLY_PIPELINE, payload);
    if (!result.success) throw new Error(result.error);
    return result.finalResult;
  });

  taskQueue.register("video-music-only", async (payload: any) => {
    const result = await runPipeline(VIDEO_MUSIC_ONLY_PIPELINE, payload);
    if (!result.success) throw new Error(result.error);
    return result.finalResult;
  });

  // Custom Story Builder background tasks
  taskQueue.register("custom-voice-only", async (payload: { draft: any }) => {
    const { draft } = payload;

    const mappedScenes = draft.scenes.map((scene: any) => {
      const dialoguesToGenerate = scene.dialogues
        .filter((d: any) => d.text.trim())
        .map((d: any) => {
          const char = draft.characters.find((c: any) => c.id === d.characterId);
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

    const response = await fetch("/api/video/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenes: mappedScenes })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Voice generation failed: ${errText}`);
    }

    const data = await response.json();

    const updatedScenes = draft.scenes.map((scene: any, sceneIndex: number) => {
      const returnedScene = data.scenes?.[sceneIndex];
      if (!returnedScene) return scene;

      const narrationDialogue = draft.includeNarration ? returnedScene.dialogues?.[0] : null;
      const mappedDialogues = scene.dialogues.map((dialogue: any, dialogueIndex: number) => {
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

    return {
      ...draft,
      scenes: updatedScenes,
      audio: {
        ...draft.audio,
        voiceMessage: `Generated ${data.generatedCount} voice lines successfully.`,
        voiceStatus: "ready"
      }
    };
  });

  taskQueue.register("custom-music-only", async (payload: { draft: any }) => {
    const { draft } = payload;
    const response = await fetch("/api/background-music", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sceneMood: draft.tones[0] || "cinematic",
        sceneTitle: draft.storyTitle,
        audioPrompt: `A ${draft.genres.join(" ")} soundtrack`
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Music generation failed: ${errText}`);
    }

    const data = await response.json();

    return {
      ...draft,
      audio: {
        ...draft.audio,
        backgroundMusicMessage: "Background music generated successfully.",
        backgroundMusicStatus: "ready",
        backgroundMusicUrl: data.trackUrl
      }
    };
  });
}
