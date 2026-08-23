import {
  DEFAULT_HEALTH_STATUS,
  DEFAULT_INVENTORY,
  DEFAULT_STORY_SETUP
} from "@/lib/story-storage";
import type {
  ChoiceType,
  HealthStatus,
  MemoryItem,
  PersistedStoryState,
  StoryScene,
  StorySetupData
} from "@/types/story";

function getEmptyScene(setup: StorySetupData = DEFAULT_STORY_SETUP): StoryScene {
  return {
    cast: [],
    chapter: "Loading...",
    location: "Unknown",
    media: {
      audioMoodPrompt: "",
      backgroundMusicMood: "",
      imageLabel: "",
      imagePrompt: "",
      narrationDuration: "",
      narrationLabel: "",
      playerState: "generating"
    },
    mood: "neutral",
    options: [],
    sceneNumber: 0,
    text: "Generating scene...",
    title: "Loading Scene"
  };
}

export function createInitialStoryState(setup: StorySetupData = DEFAULT_STORY_SETUP): PersistedStoryState {
  const initialScene = getEmptyScene(setup);

  return {
    currentScene: initialScene,
    currentSceneIndex: 0,
    customChoiceInput: setup.mode === "custom" ? setup.startingIdea : "",
    generatedMedia: initialScene.media,
    healthStatus: DEFAULT_HEALTH_STATUS,
    inventory: DEFAULT_INVENTORY,
    isLoading: false,
    lastSavedAt: null,
    memoryTimeline: [],
    pastScenes: [],
    selectedChoice: "",
    selectedChoiceType: null,
    setup,
    dynamicCast: []
  };
}

export async function generateInitialSceneFromAI(setup: StorySetupData): Promise<StoryScene> {
  const response = await fetch("/api/story/generate-scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setup,
      choice: "Start the story.",
      memoryTimeline: [],
      currentScene: null,
      sceneNumber: 1,
      draftId: setup.draftId
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate initial scene from AI.");
  }

  const { scene } = await response.json();
  return scene as StoryScene;
}

export async function generateNextSceneFromAI(params: {
  choice: string;
  choiceType: ChoiceType;
  currentSceneIndex: number;
  healthStatus: HealthStatus;
  inventory: string[];
  setup: StorySetupData;
  memoryTimeline: MemoryItem[];
  currentScene: StoryScene;
  pastScenes: StoryScene[];
}) {
  const nextIndex = params.currentSceneIndex + 1;

  const response = await fetch("/api/story/generate-scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      setup: params.setup,
      choice: params.choice,
      memoryTimeline: params.memoryTimeline,
      currentScene: params.currentScene,
      sceneNumber: nextIndex + 1,
      draftId: params.setup.draftId
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to generate next scene from AI.");
  }

  const { scene } = await response.json();
  const nextScene = scene as StoryScene;

  const resultSummary = nextScene.resultSummary || `${params.choice} changes the tension of the scene and pushes the story toward ${nextScene.location}.`;
  
  return {
    currentScene: nextScene,
    currentSceneIndex: nextIndex,
    generatedMedia: nextScene.media,
    resultSummary,
    updateSummary: `Choice type: ${params.choiceType}. Mood shifts to ${nextScene.mood}, location updates to ${nextScene.location}.`
  };
}

export async function generateAlternativeOptionsFromAI(scene: StoryScene, setup: StorySetupData): Promise<string[]> {
  const response = await fetch("/api/story/suggest-scene", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      characters: setup.characters,
      currentSceneDescription: scene.text,
      genres: setup.genres,
      previousScenes: [], 
      sceneGenre: setup.genre,
      sceneNumber: scene.sceneNumber,
      sceneTitle: scene.title,
      sceneTone: scene.mood,
      storyTitle: setup.storyTitle,
      tones: setup.moods
    }),
  });

  if (response.ok) {
    const { suggestions } = await response.json();
    if (suggestions && suggestions.length > 0) {
      return suggestions;
    }
  }

  return ["Wait for a moment to see what happens", "Examine your surroundings carefully", "Proceed cautiously forward"];
}
