"use client";

import { useEffect } from "react";
import { eventBus, registerAllTasks } from "@/lib/orchestration";
import { loadVideoStudioFlow, saveVideoStudioFlow } from "@/lib/video-storage";
import { loadCreateStoryDraft, saveCreateStoryDraft } from "@/lib/create-story-storage";

export function TaskQueueManager() {
  useEffect(() => {
    // 1. Register all task executors in the task queue
    registerAllTasks();

    // 2. Handle task completions and write-back to persistent storage
    const handleTaskCompleted = (payload: { taskType: string; result: any }) => {
      const { taskType, result } = payload;

      if (taskType.startsWith("video-")) {
        const currentFlow = loadVideoStudioFlow();
        if (!currentFlow) return;

        if (taskType === "video-voice-only" && result) {
          saveVideoStudioFlow({
            ...currentFlow,
            script: result,
            voiceResult: result,
            videoOutdated: true,
            voiceNeedsRegeneration: false,
          });
        } else if (taskType === "video-music-only" && result) {
          const primaryScene = result.scenes?.[0];
          saveVideoStudioFlow({
            ...currentFlow,
            music: {
              message: "Background music is ready.",
              mood: primaryScene?.mood ?? currentFlow.tones.join(", "),
              status: "ready",
              title: "Generated Background Score",
              trackUrl: result.scenes.find((s: any) => s.backgroundMusicUrl)?.backgroundMusicUrl || ""
            },
            script: result,
            videoOutdated: true
          });
        } else if (taskType === "video-studio-full" && result) {
          const primaryScene = result.scenes?.[0];
          saveVideoStudioFlow({
            ...currentFlow,
            script: result,
            voiceResult: result,
            music: {
              message: "Background music is ready.",
              mood: primaryScene?.mood ?? currentFlow.tones.join(", "),
              status: "ready",
              title: "Generated Background Score",
              trackUrl: result.scenes.find((s: any) => s.backgroundMusicUrl)?.backgroundMusicUrl || ""
            },
            videoOutdated: true,
            voiceNeedsRegeneration: false,
          });
        }

        // Dispatch a custom event to notify any active screen elements
        window.dispatchEvent(new Event("video-flow-updated"));

      } else if (taskType.startsWith("custom-")) {
        const draft = loadCreateStoryDraft();
        if (!draft) return;

        if (taskType === "custom-voice-only" && result) {
          saveCreateStoryDraft(result);
        } else if (taskType === "custom-music-only" && result) {
          saveCreateStoryDraft(result);
        }

        // Dispatch custom event to notify story builder screens
        window.dispatchEvent(new Event("custom-draft-updated"));
      }
    };

    // 3. Handle task failures and save messages/errors
    const handleTaskFailed = (payload: { taskType: string; error: string }) => {
      const { taskType, error } = payload;

      if (taskType.startsWith("video-")) {
        const currentFlow = loadVideoStudioFlow();
        if (!currentFlow) return;

        if (taskType === "video-voice-only") {
          saveVideoStudioFlow({
            ...currentFlow,
            voiceNeedsRegeneration: true,
            voiceResult: null
          });
        } else if (taskType === "video-music-only") {
          saveVideoStudioFlow({
            ...currentFlow,
            music: {
              ...currentFlow.music,
              message: `Failed: ${error}`,
              status: "idle"
            }
          });
        }

        window.dispatchEvent(new Event("video-flow-updated"));

      } else if (taskType.startsWith("custom-")) {
        const draft = loadCreateStoryDraft();
        if (!draft) return;

        if (taskType === "custom-voice-only") {
          saveCreateStoryDraft({
            ...draft,
            audio: {
              ...draft.audio,
              voiceMessage: `Failed: ${error}`,
              voiceStatus: "idle"
            }
          });
        } else if (taskType === "custom-music-only") {
          saveCreateStoryDraft({
            ...draft,
            audio: {
              ...draft.audio,
              backgroundMusicMessage: `Failed: ${error}`,
              backgroundMusicStatus: "idle"
            }
          });
        }

        window.dispatchEvent(new Event("custom-draft-updated"));
      }
    };

    const unsubCompleted = eventBus.on("task:completed", handleTaskCompleted);
    const unsubFailed = eventBus.on("task:failed", handleTaskFailed);

    return () => {
      unsubCompleted();
      unsubFailed();
    };
  }, []);

  return null; // Invisible manager
}
