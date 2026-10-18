"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
import type { ChoiceType, PersistedMemoryFact } from "@/types/story";
import { useSaveQueue } from "@/hooks/useSaveQueue";
import type { FullDraftState } from "@/lib/story-database";
import { syncPendingSavesForDraft } from "@/lib/save-queue";
import { checkGameOverCondition, validateStateIntegrity, type GameOverState } from "@/lib/game-over";
import { analyzeChoiceStyle, calculateChoiceImpact, applyStatModifiers, assessChoiceRisk } from "@/lib/choice-impact";
import { validateChoiceInput } from "@/lib/validation";
import { InventoryManager } from "@/lib/inventory";
import { useAuth } from "@/context/AuthContext";

type StoryContextValue = {
  beginStoryFromSetup: (override?: Partial<StorySetupData>) => Promise<boolean>;
  continueStory: () => void;
  generateAlternativeOptions: () => void;
  isReady: boolean;
  loadFromDatabase: (projectId: string) => Promise<{ success: boolean; error?: string }>;
  restartStory: () => void;
  startFreshStorySetup: (mode: StorySetupData["mode"]) => StorySetupData;
  saveSetupOnly: (override?: Partial<StorySetupData>) => void;
  selectSuggestedChoice: (choice: string) => void;
  selectCustomChoice: () => boolean;
  setCustomChoiceInput: (value: string) => void;
  setup: StorySetupData;
  state: PersistedStoryState;
  updateSetup: (partial: Partial<StorySetupData>) => void;
  gameOverState: GameOverState | null;
  isGameOver: boolean;
  validationErrors: string[];
  generationError: string | null;
  pendingSaveCount: () => number;
  updateCurrentSceneMedia: (patch: Partial<PersistedStoryState["generatedMedia"]>) => void;
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
): PersistedStoryState {
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
    setup: resolvedSetup,
    persistedMemories: Array.isArray(savedProgress.persistedMemories)
      ? savedProgress.persistedMemories.filter((memory) =>
          memory && typeof memory.id === "string" && typeof memory.memoryType === "string" && typeof memory.content === "string"
        )
      : [],
    recoverySource: savedProgress.recoverySource === "database" ? "offline-cache" : (resolvedSetup.projectId ? "offline-cache" : "local"),
    recoveryError: typeof savedProgress.recoveryError === "string" ? savedProgress.recoveryError : undefined,
    draftVersion: typeof savedProgress.draftVersion === "number" ? savedProgress.draftVersion : undefined,
    projectTitle: typeof savedProgress.projectTitle === "string" ? savedProgress.projectTitle : undefined,
  };
}

function readCachedProgressForProject(projectId: string, expectedDraftId?: string): PersistedStoryState | null {
  const cached = window.localStorage.getItem(STORY_PROGRESS_STORAGE_KEY);
  if (!cached) return null;

  try {
    const parsed = JSON.parse(cached) as PersistedStoryState;
    const cachedSetup = parsed.setup;
    if (cachedSetup?.projectId !== projectId) return null;
    if (expectedDraftId && cachedSetup.draftId !== expectedDraftId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function mergePersistedMemories(
  existing: PersistedMemoryFact[],
  saved: PersistedMemoryFact[]
): PersistedMemoryFact[] {
  const byId = new Map(existing.map((memory) => [memory.id, memory]));
  for (const memory of saved) byId.set(memory.id, memory);
  return [...byId.values()];
}

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, loading: authLoading } = useAuth();
  const [setup, setSetup] = useState<StorySetupData>(DEFAULT_STORY_SETUP);
  const [state, setState] = useState<PersistedStoryState>(() => createInitialStoryState(DEFAULT_STORY_SETUP));
  const [isReady, setIsReady] = useState(false);
  const [gameOverState, setGameOverState] = useState<GameOverState | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const { enqueue: enqueueSave, getPendingCount } = useSaveQueue();
  const attemptedRestoreRef = useRef(false);

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

  // Browser storage is an offline cache, not a cross-account data store.
  // Discard legacy/unscoped cache when a different authenticated user arrives.
  useEffect(() => {
    if (!isReady || authLoading || !currentUser || setup.ownerId === currentUser.id) return;

    const userSetup = normalizeSetup({ ...DEFAULT_STORY_SETUP, ownerId: currentUser.id });
    setSetup(userSetup);
    setState(createInitialStoryState(userSetup));
    window.localStorage.setItem(STORY_SETUP_STORAGE_KEY, JSON.stringify({ ...userSetup, lastUpdatedAt: new Date().toISOString() }));
    window.localStorage.removeItem(STORY_PROGRESS_STORAGE_KEY);
  }, [authLoading, currentUser, isReady, setup.ownerId]);

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

  // Check for game over conditions
  useEffect(() => {
    if (!isReady || gameOverState) return;

    const gameOverCheck = checkGameOverCondition(
      state.healthStatus,
      state.currentSceneIndex,
      Date.now()
    );

    if (gameOverCheck.isGameOver && gameOverCheck.gameOverState) {
      setGameOverState(gameOverCheck.gameOverState);
    }
  }, [isReady, state.healthStatus, state.currentSceneIndex, gameOverState]);

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

  const beginStoryFromSetup = async (override: Partial<StorySetupData> = {}) => {
    const effectiveSetup = normalizeSetup({ ...setup, ...override, ownerId: currentUser?.id ?? setup.ownerId });
    setSetup(effectiveSetup);
    setGenerationError(null);
    setState((current) => ({
      ...current,
      isLoading: true
    }));

    try {
      const initialScene = await generateInitialSceneFromAI(effectiveSetup);
      const nextState = createInitialStoryState(effectiveSetup);
      nextState.currentScene = initialScene;
      nextState.generatedMedia = initialScene.media;
      nextState.dynamicCast = initialScene.cast || [];
      
      setState(nextState);
      saveSetupOnly(effectiveSetup);

      if (effectiveSetup.projectId && effectiveSetup.draftId) {
        enqueueSave({
          projectId: effectiveSetup.projectId,
          draftId: effectiveSetup.draftId,
          sceneNumber: 1,
          scene: initialScene,
          currentState: {
            sceneNumber: 0,
            healthStatus: nextState.healthStatus,
            inventory: nextState.inventory,
          },
          setup: effectiveSetup,
        });
      }
      return true;
    } catch (error) {
      console.error(error);
      setGenerationError(error instanceof Error ? error.message : "Unable to generate the opening scene. Please retry.");
      setState((current) => ({ ...current, isLoading: false }));
      return false;
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
    const validation = validateChoiceInput(trimmedChoice);

    if (!validation.isValid) {
      setValidationErrors(validation.errors.map(e => e.message));
      return false;
    }

    setValidationErrors([]);

    setState((current) => ({
      ...current,
      selectedChoice: trimmedChoice,
      selectedChoiceType: "Custom"
    }));
    return true;
  };

  const generateAlternativeOptions = async () => {
    setGenerationError(null);
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
      setGenerationError(e instanceof Error ? e.message : "Unable to generate more choices. Please try again.");
      setState((current) => ({
        ...current,
        isLoading: false,
      }));
    }
  };

  const continueStory = async () => {
    if (!state.selectedChoice || !state.selectedChoiceType) return;
    if (gameOverState) return; // Can't continue if game is over
    setGenerationError(null);

    setState((current) => ({
      ...current,
      isLoading: true
    }));

    const choiceSnapshot = state.selectedChoice;
    const choiceTypeSnapshot = state.selectedChoiceType as ChoiceType;

    try {
      const nextSceneResult = await generateNextSceneFromAI({
        choice: choiceSnapshot,
        choiceType: choiceTypeSnapshot,
        currentSceneIndex: state.currentSceneIndex,
        healthStatus: state.healthStatus,
        inventory: state.inventory,
        setup,
        memoryTimeline: state.memoryTimeline,
        currentScene: state.currentScene,
        pastScenes: state.pastScenes
      });

      // Analyze choice style and calculate impacts
      const choiceStyle = analyzeChoiceStyle(choiceSnapshot);
      const choiceImpact = calculateChoiceImpact(choiceStyle, state.healthStatus);
      const { updatedHealth, appliedModifiers } = applyStatModifiers(
        state.healthStatus,
        setup.characterAttributes,
        choiceImpact.modifiers
      );

      // Add inventory reward if applicable based on LLM narrative consequence
      let updatedInventory = [...state.inventory];
      const inventoryUpdate = nextSceneResult.currentScene.inventoryUpdate;
      if (inventoryUpdate) {
        if (inventoryUpdate.action === "add" && !updatedInventory.includes(inventoryUpdate.item)) {
          updatedInventory.push(inventoryUpdate.item);
        } else if (inventoryUpdate.action === "remove") {
          // Validate: Only remove if they actually have it
          const index = updatedInventory.indexOf(inventoryUpdate.item);
          if (index > -1) {
            updatedInventory.splice(index, 1);
          } else {
            console.warn(`LLM tried to remove ${inventoryUpdate.item} but it is not in inventory.`);
          }
        }
      }

      const memoryItem = createMemoryItem({
        choiceType: choiceTypeSnapshot,
        result: nextSceneResult.resultSummary,
        scene: state.currentScene,
        update: nextSceneResult.updateSummary,
        userChoice: choiceSnapshot
      });

      // Check if health is critically low
      if (updatedHealth.health < 30 && updatedHealth.health > 0) {
        console.warn("Player health is critically low!");
      }

      // Capture state needed for save before setState
      const nextSceneNumber = nextSceneResult.currentSceneIndex + 1;

      // Merge dynamic cast
      const nextCast = nextSceneResult.currentScene.cast || [];
      const updatedDynamicCast = [...state.dynamicCast];
      for (const char of nextCast) {
        const idx = updatedDynamicCast.findIndex((c) => c.name.toLowerCase() === char.name.toLowerCase());
        if (idx >= 0) {
          updatedDynamicCast[idx] = { ...updatedDynamicCast[idx], ...char };
        } else {
          updatedDynamicCast.push(char);
        }
      }

      setState((current) => ({
        ...current,
        currentScene: nextSceneResult.currentScene,
        currentSceneIndex: nextSceneResult.currentSceneIndex,
        customChoiceInput: setup.mode === "custom" ? setup.startingIdea : "",
        generatedMedia: nextSceneResult.generatedMedia,
        healthStatus: updatedHealth,
        inventory: updatedInventory,
        isLoading: false,
        memoryTimeline: [...current.memoryTimeline, memoryItem],
        pastScenes: [...current.pastScenes, current.currentScene],
        selectedChoice: "",
        selectedChoiceType: null,
        dynamicCast: updatedDynamicCast
      }));

      // Fire-and-forget: persist to DB without blocking gameplay
      const projectId = setup.projectId;
      const draftId = setup.draftId;
      if (projectId && draftId) {
        enqueueSave({
          projectId,
          draftId,
          sceneNumber: nextSceneNumber,
          scene: nextSceneResult.currentScene,
          choice: { text: choiceSnapshot, choiceType: choiceTypeSnapshot },
          choiceSceneNumber: state.currentScene.sceneNumber,
          currentState: {
            sceneNumber: nextSceneResult.currentSceneIndex,
            healthStatus: updatedHealth,
            inventory: updatedInventory,
          },
          setup,
        }, (savedMemories) => {
          // Save callbacks can complete after navigation. Only merge facts if
          // the active state still represents the exact draft that was saved.
          setState((current) => {
            if (current.setup.projectId !== projectId || current.setup.draftId !== draftId) return current;
            return {
              ...current,
              persistedMemories: mergePersistedMemories(current.persistedMemories, savedMemories),
            };
          });
        });
      }
    } catch (error) {
      console.error(error);
      setGenerationError(error instanceof Error ? error.message : "Unable to generate the next scene. Please retry.");
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

  const updateCurrentSceneMedia = (patch: Partial<PersistedStoryState["generatedMedia"]>) => {
    setState((current) => ({
      ...current,
      generatedMedia: { ...current.generatedMedia, ...patch },
      currentScene: { ...current.currentScene, media: { ...current.currentScene.media, ...patch } }
    }));
  };

  /**
   * Restores a full story session from PostgreSQL.
   * DB data always wins. Falls back to localStorage only if the DB request fails.
   * Returns { success: true } on success, or { success: false, error } on failure.
   */
  const loadFromDatabase = async (projectId: string): Promise<{ success: boolean; error?: string }> => {
    if (!projectId) return { success: false, error: "No project ID provided." };
    const failLoad = (error: string) => {
      setState((current) => ({ ...current, isLoading: false, recoverySource: "none", recoveryError: error }));
      return { success: false, error };
    };
      
    // Never synchronize a draft remembered from a different project.
    const targetDraftId = setup.projectId === projectId ? setup.draftId : undefined;
    // Do not let facts or media from the previously selected project remain
    // visible while the authenticated replacement is loading.
    if (setup.projectId && setup.projectId !== projectId) {
      const loadingSetup = normalizeSetup({ ...DEFAULT_STORY_SETUP, projectId, ownerId: currentUser?.id });
      setSetup(loadingSetup);
      setState({ ...createInitialStoryState(loadingSetup), isLoading: true, recoverySource: "none" });
    } else {
      setState((current) => ({ ...current, isLoading: true, recoveryError: undefined }));
    }

    try {
      // Step 1: Attempt to synchronize any pending offline saves for this draft
      if (targetDraftId) {
        const syncSuccess = await syncPendingSavesForDraft(targetDraftId);
        if (!syncSuccess) {
          console.warn("[StoryContext] Offline synchronization failed, falling back to local storage if available.");
          // If we have offline saves that failed to sync, we MUST use local storage to avoid data loss.
          const cachedProgress = readCachedProgressForProject(projectId, targetDraftId);
          if (cachedProgress) {
            setState({ ...normalizeProgress(cachedProgress, cachedProgress.setup), recoverySource: "offline-cache" });
            return { success: true };
          }
        }
      }

      // Step 2: Fetch the authoritative state from PostgreSQL
      const response = await fetch(`/api/story/${projectId}/load`);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return failLoad("You do not have permission to access this story.");
        }
        // DB unavailable or forbidden — try localStorage fallback
        const cachedProgress = readCachedProgressForProject(projectId, targetDraftId);
        if (cachedProgress) {
          setState({ ...normalizeProgress(cachedProgress, cachedProgress.setup), recoverySource: "offline-cache" });
          return { success: true };
        }
        return failLoad("Story not found. Please start a new story.");
      }

      const { storyState } = await response.json() as { storyState: FullDraftState };

      if (targetDraftId && storyState?.draftId !== targetDraftId) {
        return failLoad("The saved draft has changed. Please reopen the project from the Dashboard.");
      }

      if (!storyState || storyState.scenes.length === 0) {
        return failLoad("No scenes saved yet for this story.");
      }

      // Reconstruct StoryScene objects from DB records
      const lastDbScene = storyState.scenes[storyState.scenes.length - 1];
      const selectedChoice = lastDbScene.choices.find((c) => c.selected);

      const restoredScene = {
        sceneNumber: lastDbScene.sceneNumber,
        title: lastDbScene.title,
        text: lastDbScene.description,
        location: lastDbScene.location ?? "",
        mood: lastDbScene.mood ?? "",
        chapter: "",
        options: lastDbScene.choices.map((choice) => choice.choiceText),
        cast: storyState.characters.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          emotionalState: c.currentEmotionalState ?? "",
          visualAppearance: c.appearancePrompt ?? "",
          traits: c.traits,
          relationships: [],
          imageLabel: c.name,
          voiceStyle: c.voiceStyle ?? undefined,
        })),
        media: {
          audioMoodPrompt: "",
          backgroundMusicMood: "",
          imageLabel: "",
          imagePrompt: "",
          narrationDuration: "",
          narrationLabel: "",
          playerState: "ready" as const,
          imageUrl: lastDbScene.imageUrl ?? undefined,
          narrationAudioUrl: lastDbScene.narrationAudioUrl ?? undefined,
          musicUrl: lastDbScene.musicUrl ?? undefined,
        },
        inventoryUpdate: null,
        resultSummary: selectedChoice?.resultText ?? "",
      };

      // Choices are attached to the scene that offered them. Rebuild the
      // timeline from those records rather than treating extracted facts as UI state.
      const restoredMemoryTimeline = storyState.scenes.flatMap((savedScene) =>
        savedScene.choices.filter((choice) => choice.selected).map((choice) => ({
          choiceType: choice.choiceType === "CUSTOM" ? "Custom" as const : "AI Suggested" as const,
          location: savedScene.location ?? "",
          mood: savedScene.mood ?? "",
          result: choice.resultText ?? "",
          sceneNumber: savedScene.sceneNumber,
          timestamp: new Date().toISOString(),
          update: "",
          userChoice: choice.choiceText,
        }))
      );

      // Reconstruct pastScenes (all except the last, which is current)
      const pastScenes = storyState.scenes.slice(0, -1).map((s) => ({
        sceneNumber: s.sceneNumber,
        title: s.title,
        text: s.description,
        location: s.location ?? "",
        mood: s.mood ?? "",
        chapter: "",
        options: [],
        cast: [],
        media: {
          audioMoodPrompt: "", backgroundMusicMood: "",
          imageLabel: "", imagePrompt: "",
          narrationDuration: "", narrationLabel: "",
          playerState: "ready" as const,
        },
        inventoryUpdate: null,
      }));

      const progress = storyState.progressState;
      const restoredHealth = {
        health: progress?.health ?? 100,
        mana: progress?.mana ?? 100,
        resolve: progress?.resolve ?? 100,
      };

      const persistedSetup = progress?.setup && typeof progress.setup === "object"
        ? normalizeSetup({ ...setup, ...(progress.setup as Partial<StorySetupData>), projectId: storyState.projectId, draftId: storyState.draftId })
        : normalizeSetup({ ...setup, projectId: storyState.projectId, draftId: storyState.draftId, storyTitle: storyState.title, genres: storyState.genres, moods: storyState.tones, genre: storyState.genres[0] ?? setup.genre, mood: storyState.tones[0] ?? setup.mood, numberOfScenes: storyState.numberOfScenes });

      const restoredState: PersistedStoryState = {
        ...createInitialStoryState(persistedSetup),
        currentScene: restoredScene,
        currentSceneIndex: lastDbScene.sceneNumber - 1,
        generatedMedia: restoredScene.media,
        healthStatus: restoredHealth,
        inventory: progress?.inventory ?? [],
        memoryTimeline: restoredMemoryTimeline,
        pastScenes,
        dynamicCast: restoredScene.cast,
        lastSavedAt: new Date().toISOString(),
        isLoading: false,
        persistedMemories: storyState.memories,
        recoverySource: "database",
        recoveryError: undefined,
        draftVersion: storyState.draftVersion,
        projectTitle: storyState.title,
      };

      setState(restoredState);
      setSetup(persistedSetup);

      // Also update localStorage so offline fallback stays current
      window.localStorage.setItem(STORY_PROGRESS_STORAGE_KEY, JSON.stringify(restoredState));

      return { success: true };
    } catch (err) {
      console.error("[loadFromDatabase] Failed:", err);
      // Last-resort: try localStorage
      const cachedProgress = readCachedProgressForProject(projectId, targetDraftId);
      if (cachedProgress) {
        try {
          setState({ ...normalizeProgress(cachedProgress, cachedProgress.setup), recoverySource: "offline-cache" });
          return { success: true };
        } catch {
          // localStorage also corrupt
        }
      }
      return failLoad("Failed to load story. Please try again.");
    }
  };

  // A refresh may restore a browser cache before React mounts. Revalidate only
  // the explicitly selected project/draft through the ownership-checked route;
  // never substitute another active project silently.
  useEffect(() => {
    if (!isReady || authLoading || !currentUser || attemptedRestoreRef.current) return;
    if (!setup.projectId || !setup.draftId) return;
    attemptedRestoreRef.current = true;
    void loadFromDatabase(setup.projectId).then((result) => {
      if (!result.success) {
        setState((current) => ({ ...current, recoverySource: "none", recoveryError: result.error }));
      }
    });
  // loadFromDatabase intentionally reads the current setup and is invoked once per browser restoration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, authLoading, currentUser, setup.projectId, setup.draftId]);

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
      loadFromDatabase,
      restartStory,
      startFreshStorySetup,
      saveSetupOnly,
      selectCustomChoice,
      selectSuggestedChoice,
      setCustomChoiceInput,
      setup,
      state,
      updateSetup,
      gameOverState,
      isGameOver: !!gameOverState,
      validationErrors,
      generationError,
      pendingSaveCount: getPendingCount,
      updateCurrentSceneMedia,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isReady, setup, state, gameOverState, validationErrors, generationError, getPendingCount]
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
