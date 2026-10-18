/**
 * Module 7.8 – Asynchronous Processing & System Orchestration
 * Story Pipelines: Concrete pipeline definitions for the Guided Story mode.
 */

import type { PipelineDefinition, PipelineContext } from "../pipeline";
import type { StoryScene, StorySetupData, MemoryItem } from "@/types/story";
import { AI_GENERATION_RETRY } from "../retry-strategy";
import { computeDelay } from "../retry-strategy";

// ─── Step Payload Types ───────────────────────────────────────────────────────

export type GenerateSceneInput = {
  setup: StorySetupData;
  choice: string;
  memoryTimeline: MemoryItem[];
  currentScene: StoryScene | null;
  sceneNumber: number;
  playerPerformance?: any;
};

export type GenerateAlternativeOptionsInput = {
  scene: StoryScene;
  setup: StorySetupData;
};

// ─── Step Executors ───────────────────────────────────────────────────────────

async function executeGenerateScene(
  input: GenerateSceneInput,
  _context: PipelineContext
): Promise<StoryScene> {
  const strategy = AI_GENERATION_RETRY;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = computeDelay(strategy, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const response = await fetch("/api/story/generate-scene", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setup: input.setup,
          choice: input.choice,
          memoryTimeline: input.memoryTimeline,
          currentScene: input.currentScene,
          sceneNumber: input.sceneNumber,
          playerPerformance: input.playerPerformance,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(`Scene generation failed (${response.status}): ${errorText.slice(0, 200)}`);
      }

      const data = await response.json();

      if (!data.scene) {
        throw new Error("Scene generation returned an empty result.");
      }

      return data.scene as StoryScene;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const willRetry = attempt < strategy.maxRetries && strategy.shouldRetry(lastError, attempt);
      if (!willRetry) break;
    }
  }

  throw lastError ?? new Error("Scene generation failed after all retries.");
}

async function executeGenerateAlternativeOptions(
  input: GenerateAlternativeOptionsInput,
  _context: PipelineContext
): Promise<string[]> {
  const response = await fetch("/api/story/suggest-scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      characters: input.setup.characters,
      currentSceneDescription: input.scene.text,
      genres: input.setup.genres,
      previousScenes: [],
      sceneGenre: input.setup.genre,
      sceneNumber: input.scene.sceneNumber,
      sceneTitle: input.scene.title,
      sceneTone: input.scene.mood,
      storyTitle: input.setup.storyTitle,
      tones: input.setup.moods,
    }),
  });

  if (response.ok) {
    const data = await response.json();
    if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
      return data.suggestions as string[];
    }
  }

  // Fallback: generate options locally
  return input.scene.options.map((option, index) => {
    if (index === 0) return `Probe a hidden route near ${input.scene.location}`;
    if (index === 1) return `${option} with a quieter approach`;
    return `${option} while coordinating with the full scene cast`;
  });
}

// ─── Pipeline Definitions ─────────────────────────────────────────────────────

/**
 * Guided Story Scene Generation Pipeline
 * Used in StoryContext.continueStory() and StoryContext.beginStoryFromSetup()
 */
export const GUIDED_STORY_SCENE_PIPELINE: PipelineDefinition = {
  name: "guided-story-scene",
  steps: [
    {
      name: "generate-scene",
      execute: executeGenerateScene as (input: unknown, ctx: PipelineContext) => Promise<unknown>,
      critical: true,
    },
  ],
};

/**
 * Alternative Options Generation Pipeline
 * Used when the player asks for different choices
 */
export const GENERATE_OPTIONS_PIPELINE: PipelineDefinition = {
  name: "guided-story-options",
  steps: [
    {
      name: "generate-options",
      execute: executeGenerateAlternativeOptions as (input: unknown, ctx: PipelineContext) => Promise<unknown>,
      critical: true,
    },
  ],
};
