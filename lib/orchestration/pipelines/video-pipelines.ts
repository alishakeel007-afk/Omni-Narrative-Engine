/**
 * Module 7.8 – Asynchronous Processing & System Orchestration
 * Video Pipelines: Concrete pipeline definitions for Video Studio flows.
 */

import type { PipelineDefinition, PipelineContext } from "../pipeline";
import type { VideoGenerationRequest, VideoGenerationResponse } from "@/types/video";
import { AI_GENERATION_RETRY, AUDIO_GENERATION_RETRY, computeDelay } from "../retry-strategy";

// ─── Step Payload Types ───────────────────────────────────────────────────────

export type VideoScriptInput = VideoGenerationRequest;

export type VideoTTSInput = {
  script: VideoGenerationResponse;
};

export type VideoMusicInput = {
  script: VideoGenerationResponse;
};

export type VideoStudioResult = {
  script: VideoGenerationResponse;
};

// ─── Step Executors ───────────────────────────────────────────────────────────

async function executeGenerateScript(
  input: VideoScriptInput,
  context: PipelineContext
): Promise<VideoGenerationResponse> {
  const strategy = AI_GENERATION_RETRY;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = computeDelay(strategy, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          includeAudio: false, // Orchestrator handles audio in a separate step
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Video script generation failed (${response.status}): ${errorText.slice(0, 200)}`);
      }

      const script = (await response.json()) as VideoGenerationResponse;
      
      if (!script.scenes || script.scenes.length === 0) {
        throw new Error("Video script generation returned no scenes.");
      }

      return script;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const willRetry = attempt < strategy.maxRetries && strategy.shouldRetry(lastError, attempt);
      if (!willRetry) break;
    }
  }

  throw lastError ?? new Error("Video script generation failed after all retries.");
}

async function executeGenerateTTS(
  input: VideoTTSInput | VideoGenerationResponse, // Can take previous step's output directly
  context: PipelineContext
): Promise<VideoGenerationResponse> {
  const scriptToProcess = "script" in input && input.script ? input.script : (input as VideoGenerationResponse);
  const strategy = AUDIO_GENERATION_RETRY;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = computeDelay(strategy, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await fetch("/api/video/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scriptToProcess),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Voice generation failed (${response.status}): ${errorText.slice(0, 200)}`);
      }

      return (await response.json()) as VideoGenerationResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const willRetry = attempt < strategy.maxRetries && strategy.shouldRetry(lastError, attempt);
      if (!willRetry) break;
    }
  }

  throw lastError ?? new Error("Voice generation failed after all retries.");
}

async function executeGenerateMusic(
  input: VideoMusicInput | VideoGenerationResponse,
  context: PipelineContext
): Promise<VideoGenerationResponse> {
  const scriptToProcess = "script" in input && input.script ? input.script : (input as VideoGenerationResponse);
  const strategy = AUDIO_GENERATION_RETRY;
  let lastError: Error | null = null;
  
  // Clone the script to avoid mutating the input
  const updatedScript = JSON.parse(JSON.stringify(scriptToProcess)) as VideoGenerationResponse;

  for (let i = 0; i < updatedScript.scenes.length; i++) {
    const scene = updatedScript.scenes[i];
    
    let attemptError: Error | null = null;
    for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = computeDelay(strategy, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const response = await fetch("/api/background-music", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sceneMood: scene.mood,
            sceneTitle: scene.title,
            audioPrompt: scene.soundDesign
          }),
        });

        if (!response.ok) {
           throw new Error(`Music generation failed (${response.status}) for scene ${i + 1}`);
        }

        const data = await response.json();
        
        scene.backgroundMusicUrl = data.trackUrl;
        scene.backgroundMusicTitle = data.title;
        scene.backgroundMusicMood = data.mood;
        
        attemptError = null;
        break; // Success, break retry loop for this scene
      } catch (error) {
        attemptError = error instanceof Error ? error : new Error(String(error));
        const willRetry = attempt < strategy.maxRetries && strategy.shouldRetry(attemptError, attempt);
        if (!willRetry) break;
      }
    }
    
    if (attemptError) {
      console.warn(`[Pipeline] Failed to generate music for scene ${i + 1}:`, attemptError.message);
      // Don't throw, let the rest of the scenes process
    }
  }

  return updatedScript;
}

// ─── Pipeline Definitions ─────────────────────────────────────────────────────

/**
 * Full Video Studio Pipeline: Script -> Voice -> Music
 */
export const VIDEO_STUDIO_FULL_PIPELINE: PipelineDefinition = {
  name: "video-studio-full",
  steps: [
    {
      name: "generate-script",
      execute: executeGenerateScript as (input: unknown, ctx: PipelineContext) => Promise<unknown>,
      critical: true,
    },
    {
      name: "generate-voice",
      execute: executeGenerateTTS as (input: unknown, ctx: PipelineContext) => Promise<unknown>,
      critical: true,
    },
    {
      name: "generate-music",
      execute: executeGenerateMusic as (input: unknown, ctx: PipelineContext) => Promise<unknown>,
      // Background music is not critical; if it fails, the user still gets their video
      critical: false, 
    }
  ],
};

/**
 * Single-step Voice Generation Pipeline
 * Used when the user accepts a script and just needs voices.
 */
export const VIDEO_VOICE_ONLY_PIPELINE: PipelineDefinition = {
  name: "video-voice-only",
  steps: [
    {
      name: "generate-voice",
      execute: executeGenerateTTS as (input: unknown, ctx: PipelineContext) => Promise<unknown>,
      critical: true,
    },
  ],
};

/**
 * Single-step Music Generation Pipeline
 * Used to add music to an existing script with/without voices.
 */
export const VIDEO_MUSIC_ONLY_PIPELINE: PipelineDefinition = {
  name: "video-music-only",
  steps: [
    {
      name: "generate-music",
      execute: executeGenerateMusic as (input: unknown, ctx: PipelineContext) => Promise<unknown>,
      critical: true, // It is critical here because it's the only step requested
    },
  ],
};
