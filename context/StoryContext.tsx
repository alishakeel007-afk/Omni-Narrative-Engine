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
  generateMoreOptions,
  generateNextScene
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
  saveSetupOnly: (override?: Partial<StorySetupData>) => void;
  selectSuggestedChoice: (choice: string) => void;
  selectCustomChoice: () => boolean;
  setCustomChoiceInput: (value: string) => void;
  setup: StorySetupData;
  state: PersistedStoryState;
  updateSetup: (partial: Partial<StorySetupData>) => void;
};

const StoryContext = createContext<StoryContextValue | null>(null);

function normalizeSetup(savedSetup: Partial<StorySetupData>): StorySetupData {
  const merged = {
    ...DEFAULT_STORY_SETUP,
    ...savedSetup
  };
  const characters =
    Array.isArray(merged.characters) && merged.characters.length > 0
      ? merged.characters
      : [
          {
            name: merged.characterName,
            role: merged.characterRole,
            traits: merged.characterTraits
          }
        ];
  const primaryCharacter = characters[0];
  const genres =
    Array.isArray(merged.genres) && merged.genres.length > 0
      ? merged.genres
      : [merged.genre || DEFAULT_STORY_SETUP.genre];
  const moods =
    Array.isArray(merged.moods) && merged.moods.length > 0
      ? merged.moods
      : [merged.mood || DEFAULT_STORY_SETUP.mood];

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
        setState({
          ...parsedProgress,
          currentScene: parsedProgress.currentScene,
          generatedMedia: parsedProgress.generatedMedia,
          pastScenes: parsedProgress.pastScenes ?? [],
          setup: resolvedSetup
        });
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

  const beginStoryFromSetup = () => {
    const nextState = createInitialStoryState(setup);
    setState(nextState);
    window.localStorage.setItem(STORY_PROGRESS_STORAGE_KEY, JSON.stringify(nextState));
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

  const generateAlternativeOptions = () => {
    setState((current) => ({
      ...current,
      currentScene: {
        ...current.currentScene,
        options: generateMoreOptions(current.currentScene, setup)
      },
      selectedChoice: "",
      selectedChoiceType: null
    }));
  };

  const continueStory = () => {
    if (!state.selectedChoice || !state.selectedChoiceType) return;

    setState((current) => ({
      ...current,
      isLoading: true
    }));

    window.setTimeout(() => {
      setState((current) => {
        const nextSceneResult = generateNextScene({
          choice: current.selectedChoice,
          choiceType: current.selectedChoiceType as ChoiceType,
          currentSceneIndex: current.currentSceneIndex,
          healthStatus: current.healthStatus,
          inventory: current.inventory,
          setup
        });

        const memoryItem = createMemoryItem({
          choiceType: current.selectedChoiceType as ChoiceType,
          result: nextSceneResult.resultSummary,
          scene: current.currentScene,
          update: nextSceneResult.updateSummary,
          userChoice: current.selectedChoice
        });

        return {
          ...current,
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
        };
      });
    }, 1400);
  };

  const restartStory = () => {
    const nextState = createInitialStoryState(setup);
    setState(nextState);
    window.localStorage.removeItem(STORY_PROGRESS_STORAGE_KEY);
  };

  const value = useMemo<StoryContextValue>(
    () => ({
      beginStoryFromSetup,
      continueStory,
      generateAlternativeOptions,
      isReady,
      restartStory,
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
