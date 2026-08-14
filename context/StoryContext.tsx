"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { createMemoryItem } from "@/services/memoryService";
import {
  createInitialStoryState,
  generateNextSceneFromAI,
  generateAlternativeOptionsFromAI,
  generateInitialSceneFromAI
} from "@/services/storyService";
import {
  DEFAULT_STORY_SETUP,
  STORY_PROGRESS_STORAGE_KEY,
  STORY_SETUP_STORAGE_KEY,
  type PersistedStoryState,
  type StorySetupData
} from "@/lib/story-storage";
import type { ChoiceType } from "@/types/story";

type StoryContextValue = {
  beginStoryFromSetup: () => void;
  continueStory: () => void;
  generateAlternativeOptions: () => void;
  isReady: boolean;
  restartStory: () => void;
  startFreshStorySetup: (mode: StorySetupData["mode"]) => StorySetupData;
  saveSetupOnly: (override?: Partial<StorySetupData>) => void;
  selectSuggestedChoice: (choice: string) => void;
  selectCustomChoice: () => boolean;
  setCustomChoiceInput: (value: string) => void;
  setup: StorySetupData;
  state: PersistedStoryState;
  updateSetup: (partial: Partial<StorySetupData>) => void;
};

const StoryContext = createContext<StoryContextValue | null>(null);

function toStringArray(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return fallback;
}

function toCleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeSetup(savedSetup: Partial<StorySetupData>): StorySetupData {
  const merged = {
    ...DEFAULT_STORY_SETUP,
    ...savedSetup
  };
  const fallbackTraits = toStringArray(
    (merged as { characterTraits?: unknown }).characterTraits,
    DEFAULT_STORY_SETUP.characterTraits
  );
  const savedGenres = toStringArray((merged as { genres?: unknown }).genres);
  const savedMoods = toStringArray((merged as { moods?: unknown }).moods);
  const characters =
    Array.isArray(merged.characters) && merged.characters.length > 0
      ? merged.characters.map((character, index) => {
          const traits = toStringArray(
            (character as { traits?: unknown }).traits,
            index === 0 ? fallbackTraits : []
          );

          return {
            ...character,
            name:
              typeof character.name === "string" && character.name.trim()
                ? character.name
                : `Character ${index + 1}`,
            personalityTone: toCleanString(
              (character as { personalityTone?: unknown }).personalityTone,
              traits.join(", ") || "Balanced cinematic tone"
            ),
            role: toCleanString(
              (character as { role?: unknown }).role,
              index === 0 ? toCleanString(merged.characterRole, "Lead Character") : "Supporting Character"
            ),
            traits,
            voiceStyle: toCleanString(
              (character as { voiceStyle?: unknown }).voiceStyle,
              "Voice style placeholder"
            )
          };
        })
      : [
          {
            name: toCleanString(merged.characterName, DEFAULT_STORY_SETUP.characterName),
            role: toCleanString(merged.characterRole, DEFAULT_STORY_SETUP.characterRole),
            personalityTone: fallbackTraits.join(", ") || "Balanced cinematic tone",
            traits: fallbackTraits,
            voiceStyle: "Voice style placeholder"
          }
        ];
  const primaryCharacter = characters[0];
  const genres =
    savedGenres.length > 0
      ? savedGenres
      : [toCleanString(merged.genre, DEFAULT_STORY_SETUP.genre)];
  const moods =
    savedMoods.length > 0
      ? savedMoods
      : [toCleanString(merged.mood, DEFAULT_STORY_SETUP.mood)];

  return {
    ...merged,
    characterName: primaryCharacter.name,
    characterRole: primaryCharacter.role,
    characterTraits: primaryCharacter.traits,
    characters,
    genre: genres[0],
    genres,
    mood: moods[0],
    moods
  };
}

function normalizeProgress(
  savedProgress: Partial<PersistedStoryState>,
  resolvedSetup: StorySetupData
) {
  const fallback = createInitialStoryState(resolvedSetup);
  const selectedChoiceType =
    savedProgress.selectedChoiceType === "AI Suggested" || savedProgress.selectedChoiceType === "Custom"
      ? savedProgress.selectedChoiceType
      : null;

  return {
    ...fallback,
    ...savedProgress,
    currentScene: savedProgress.currentScene ?? fallback.currentScene,
    customChoiceInput:
      typeof savedProgress.customChoiceInput === "string"
        ? savedProgress.customChoiceInput
        : fallback.customChoiceInput,
    generatedMedia: savedProgress.generatedMedia ?? fallback.generatedMedia,
    healthStatus: savedProgress.healthStatus ?? fallback.healthStatus,
    inventory: Array.isArray(savedProgress.inventory)
      ? savedProgress.inventory
      : fallback.inventory,
    isLoading: false,
    memoryTimeline: Array.isArray(savedProgress.memoryTimeline)
      ? savedProgress.memoryTimeline
      : fallback.memoryTimeline,
    pastScenes: Array.isArray(savedProgress.pastScenes)
      ? savedProgress.pastScenes
      : fallback.pastScenes,
    selectedChoice:
      typeof savedProgress.selectedChoice === "string" ? savedProgress.selectedChoice : "",
    selectedChoiceType,
    setup: resolvedSetup
  };
}

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const [setup, setSetup] = useState<StorySetupData>(DEFAULT_STORY_SETUP);
  const [state, setState] = useState<PersistedStoryState>(() => createInitialStoryState(DEFAULT_STORY_SETUP));
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const savedSetup = window.localStorage.getItem(STORY_SETUP_STORAGE_KEY);
    const savedProgress = window.localStorage.getItem(STORY_PROGRESS_STORAGE_KEY);
    let resolvedSetup = DEFAULT_STORY_SETUP;

    if (savedSetup) {
      try {
        resolvedSetup = normalizeSetup(JSON.parse(savedSetup) as Partial<StorySetupData>);
      } catch {
        window.localStorage.removeItem(STORY_SETUP_STORAGE_KEY);
      }
    }

    setSetup(resolvedSetup);

    if (savedProgress) {
      try {
        const parsedProgress = JSON.parse(savedProgress) as PersistedStoryState;
        setState(normalizeProgress(parsedProgress, resolvedSetup));
      } catch {
        window.localStorage.removeItem(STORY_PROGRESS_STORAGE_KEY);
        setState(createInitialStoryState(resolvedSetup));
      }
    } else {
      setState(createInitialStoryState(resolvedSetup));
    }

    setIsReady(true);
  }, []);

  useEffect(() => {
    if (!isReady) return;

    window.localStorage.setItem(
      STORY_SETUP_STORAGE_KEY,
      JSON.stringify({
        ...setup,
        lastUpdatedAt: new Date().toISOString()
      })
    );
  }, [isReady, setup]);

  useEffect(() => {
    if (!isReady) return;

    const payload: PersistedStoryState = {
      ...state,
      lastSavedAt: new Date().toISOString(),
      setup
    };

    setState((current) =>
      current.lastSavedAt === payload.lastSavedAt ? current : { ...current, lastSavedAt: payload.lastSavedAt }
    );
    window.localStorage.setItem(STORY_PROGRESS_STORAGE_KEY, JSON.stringify(payload));
  }, [
    isReady,
    setup,
    state.currentScene,
    state.currentSceneIndex,
    state.customChoiceInput,
    state.generatedMedia,
    state.healthStatus,
    state.inventory,
    state.memoryTimeline,
    state.pastScenes,
    state.selectedChoice,
    state.selectedChoiceType
  ]);

  const updateSetup = (partial: Partial<StorySetupData>) => {
    setSetup((current) => ({ ...current, ...partial }));
  };

  const saveSetupOnly = (override: Partial<StorySetupData> = {}) => {
    window.localStorage.setItem(
      STORY_SETUP_STORAGE_KEY,
      JSON.stringify({
        ...setup,
        ...override,
        lastUpdatedAt: new Date().toISOString()
      })
    );
  };

  const beginStoryFromSetup = async () => {
    setState((current) => ({
      ...current,
      isLoading: true
    }));

    try {
      const initialScene = await generateInitialSceneFromAI(setup);
      const nextState = createInitialStoryState(setup);
      nextState.currentScene = initialScene;
      nextState.generatedMedia = initialScene.media;
      
      setState(nextState);
      saveSetupOnly();
    } catch (error) {
      console.error(error);
      // Fallback
      const nextState = createInitialStoryState(setup);
      setState(nextState);
      saveSetupOnly();
    }
  };

  const selectSuggestedChoice = (choice: string) => {
    setState((current) => ({
      ...current,
      selectedChoice: choice,
      selectedChoiceType: "AI Suggested"
    }));
  };

  const setCustomChoiceInput = (value: string) => {
    setState((current) => ({
      ...current,
      customChoiceInput: value
    }));
  };

  const selectCustomChoice = () => {
    const trimmedChoice = state.customChoiceInput.trim();

    if (!trimmedChoice) {
      return false;
    }

    setState((current) => ({
      ...current,
      selectedChoice: trimmedChoice,
      selectedChoiceType: "Custom"
    }));
    return true;
  };

  const generateAlternativeOptions = async () => {
    setState((current) => ({
      ...current,
      isLoading: true
    }));
    try {
      const newOptions = await generateAlternativeOptionsFromAI(state.currentScene, setup);
      setState((current) => ({
        ...current,
        currentScene: {
          ...current.currentScene,
          options: newOptions
        },
        isLoading: false,
        selectedChoice: "",
        selectedChoiceType: null
      }));
    } catch (e) {
      setState((current) => ({
        ...current,
        isLoading: false,
      }));
    }
  };

  const continueStory = async () => {
    if (!state.selectedChoice || !state.selectedChoiceType) return;

    setState((current) => ({
      ...current,
      isLoading: true
    }));

    try {
      const nextSceneResult = await generateNextSceneFromAI({
        choice: state.selectedChoice,
        choiceType: state.selectedChoiceType as ChoiceType,
        currentSceneIndex: state.currentSceneIndex,
        healthStatus: state.healthStatus,
        inventory: state.inventory,
        setup,
        memoryTimeline: state.memoryTimeline,
        currentScene: state.currentScene,
        pastScenes: state.pastScenes,
        playerPerformance: state.playerPerformance
      });

      let newPerformance = { ...state.playerPerformance };
      const outcome = nextSceneResult.currentScene.choiceOutcome;
      if (outcome === "Success") {
        newPerformance.consecutiveSuccesses += 1;
        newPerformance.consecutiveFailures = 0;
      } else if (outcome === "Failure") {
        newPerformance.consecutiveFailures += 1;
        newPerformance.consecutiveSuccesses = 0;
      }

      // Reset streaks if threshold is met (curveball/lucky break was injected and played out in this scene)
      if (
        (setup.difficulty === "Adaptive" || setup.difficulty === "Hard") &&
        (state.playerPerformance.consecutiveSuccesses >= 3 || state.playerPerformance.consecutiveFailures >= 2)
      ) {
        newPerformance = { consecutiveSuccesses: 0, consecutiveFailures: 0 };
      }

      const memoryItem = createMemoryItem({
        choiceType: state.selectedChoiceType as ChoiceType,
        result: nextSceneResult.resultSummary,
        scene: state.currentScene,
        update: nextSceneResult.updateSummary,
        userChoice: state.selectedChoice
      });

      setState((current) => ({
        ...current,
        playerPerformance: newPerformance,
        currentScene: nextSceneResult.currentScene,
        currentSceneIndex: nextSceneResult.currentSceneIndex,
        customChoiceInput: setup.mode === "custom" ? setup.startingIdea : "",
        generatedMedia: nextSceneResult.generatedMedia,
        healthStatus: nextSceneResult.healthStatus,
        inventory: nextSceneResult.inventory,
        isLoading: false,
        memoryTimeline: [...current.memoryTimeline, memoryItem],
        pastScenes: [...current.pastScenes, current.currentScene],
        selectedChoice: "",
        selectedChoiceType: null
      }));
    } catch (error) {
      console.error(error);
      setState((current) => ({
        ...current,
        isLoading: false
      }));
    }
  };

  const restartStory = () => {
    const nextState = createInitialStoryState(setup);
    setState(nextState);
    window.localStorage.removeItem(STORY_PROGRESS_STORAGE_KEY);
  };

  const startFreshStorySetup = (mode: StorySetupData["mode"]) => {
    const nextSetup = normalizeSetup({
      ...DEFAULT_STORY_SETUP,
      mode
    });
    const nextState = createInitialStoryState(nextSetup);

    setSetup(nextSetup);
    setState(nextState);
    window.localStorage.setItem(
      STORY_SETUP_STORAGE_KEY,
      JSON.stringify({
        ...nextSetup,
        lastUpdatedAt: new Date().toISOString()
      })
    );
    window.localStorage.removeItem(STORY_PROGRESS_STORAGE_KEY);

    return nextSetup;
  };

  const value = useMemo<StoryContextValue>(
    () => ({
      beginStoryFromSetup,
      continueStory,
      generateAlternativeOptions,
      isReady,
      restartStory,
      startFreshStorySetup,
      saveSetupOnly,
      selectCustomChoice,
      selectSuggestedChoice,
      setCustomChoiceInput,
      setup,
      state,
      updateSetup
    }),
    [isReady, setup, state]
  );

  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

export function useStory() {
  const context = useContext(StoryContext);

  if (!context) {
    throw new Error("useStory must be used within StoryProvider");
  }

  return context;
}
