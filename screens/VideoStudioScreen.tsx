"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clapperboard,
  Edit3,
  Image as ImageIcon,
  Loader2,
  Mic2,
  Music2,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Wand2,
  X
} from "lucide-react";
import { PlaySceneAudioButton } from "@/components/play-scene-audio-button";
import { PreviewFinalAudioButton } from "@/components/preview-final-audio-button";
import { ProtectedRoute } from "@/components/protected-route";
import {
  DEFAULT_VIDEO_GENRES,
  DEFAULT_VIDEO_TONES,
  VIDEO_STAGE_LABELS,
  createStoryTextFromScript,
  loadVideoStudioFlow,
  previousVideoStudioStage,
  saveVideoStudioFlow,
  type VideoStudioFlowState,
  type VideoStudioStage
} from "@/lib/video-storage";
import {
  createVideoStudioProject,
  loadVideoStudioFromDatabase,
  saveVideoStudioToDatabase,
  type VideoStudioSaveResult
} from "@/lib/video-studio-db";
import { createSampleScoreRecipe, renderSampleBasedScore, type SampleScoreRecipe } from "@/lib/audio/sample-score";
import { SAMPLE_CREDITS } from "@/lib/audio/sample-catalog";
import { decideSceneMusic } from "@/lib/audio/music-policy";
import { resolveDialogueEmotion } from "@/lib/audio/emotion-informed-delivery";
import { hasUsableMediaReference, validateSceneMedia, type MediaValidationStatus } from "@/lib/video-studio-readiness";
import { summarizeVideoAudio, summarizeVideoMusic, videoAudioStatus, videoMusicStatus } from "@/lib/video-studio-media-summary";
import type { MovieDialogueLine, MovieScene, VideoGenerationResponse, VideoLanguage } from "@/types/video";
import { isCurrentVideoScriptLanguage, textDirectionForVideoLanguage } from "@/lib/video-language";
import { buildSceneVisualContext } from "@/lib/image/scene-visual-context";

type EditableSceneField =
  | "directorNotes"
  | "estimatedDuration"
  | "imagePrompt"
  | "location"
  | "mood"
  | "narration"
  | "sceneGenre"
  | "sceneTone"
  | "soundDesign"
  | "visualPrompt";

type SampleScorePreview = {
  blob: Blob;
  url: string;
  durationSeconds: number;
  recipe: SampleScoreRecipe;
  description: string;
};

type MusicBatchProgress = {
  current: number;
  total: number;
  currentSceneNumber?: number;
  results: Record<number, "saved" | "skipped" | "silent" | "failed">;
};

const VIDEO_VOICE_OPTIONS = [
  { deepgramModel: "aura-2-orion-en", gender: "male", voiceName: "Orion - warm male" },
  { deepgramModel: "aura-2-asteria-en", gender: "female", voiceName: "Asteria - clear female" },
  { deepgramModel: "aura-2-athena-en", gender: "female", voiceName: "Athena - confident female" },
  { deepgramModel: "aura-2-arcas-en", gender: "male", voiceName: "Arcas - expressive male" },
  { deepgramModel: "aura-2-orpheus-en", gender: "male", voiceName: "Orpheus - narrator male" }
];

function createDialogueId() {
  return `dialogue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function VideoStudioScreen() {
  const router = useRouter();
  const [flow, setFlow] = useState<VideoStudioFlowState | null>(null);
  const [error, setError] = useState("");
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [regeneratingDialogueAudioId, setRegeneratingDialogueAudioId] = useState<string | null>(null);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [musicBatchProgress, setMusicBatchProgress] = useState<MusicBatchProgress | null>(null);
  const [sampleScores, setSampleScores] = useState<Record<number, SampleScorePreview>>({});
  const [sampleErrors, setSampleErrors] = useState<Record<number, string>>({});
  const [generatingSampleScene, setGeneratingSampleScene] = useState<number | null>(null);
  const [savingSampleScene, setSavingSampleScene] = useState<number | null>(null);
  const samplePreviewRefs = useRef<Record<number, HTMLAudioElement | null>>({});
  const sampleUrlsRef = useRef(new Set<string>());
  const sampleGenerationRevisionRef = useRef(0);
  const musicBatchRunningRef = useRef(false);
  const isMountedRef = useRef(true);
  const [generatingDialogueScene, setGeneratingDialogueScene] = useState<number | null>(null);
  const [generatingDialogueLineId, setGeneratingDialogueLineId] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [customGenreInput, setCustomGenreInput] = useState("");
  const [customToneInput, setCustomToneInput] = useState("");
  const [saveState, setSaveState] = useState<"local" | "saving" | "saved" | "failed">("local");
  const [finalSaveFeedback, setFinalSaveFeedback] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [hydrationState, setHydrationState] = useState<"loading" | "ready" | "failed">("loading");
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const saveRevisionRef = useRef(0);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const lastQueuedSignatureRef = useRef<string | null>(null);
  const failedSaveRef = useRef<VideoStudioFlowState | null>(null);
  const finalSaveRunningRef = useRef(false);
  const hydrationStateRef = useRef<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    const localFlow = loadVideoStudioFlow();
    const requestedProjectId = new URLSearchParams(window.location.search).get("project")?.trim();
    const hasProjectParameter = requestedProjectId !== undefined;
    const hasRequestedProject = Boolean(requestedProjectId && /^[0-9a-f-]{36}$/i.test(requestedProjectId));
    // An explicit project URL is database-authoritative. Do not display a
    // matching cache or queue a save until its authenticated hydration ends.
    hydrationStateRef.current = "loading";
    setHydrationState("loading");
    setFlow(null);
    const initialRevision = saveRevisionRef.current;
    let cancelled = false;

    if (hasRequestedProject && requestedProjectId) {
      void loadVideoStudioFromDatabase(requestedProjectId).then((dbFlow) => {
        // Never replace edits made while database hydration was in flight.
        if (dbFlow && !cancelled && saveRevisionRef.current === initialRevision) {
          hydrationStateRef.current = "ready";
          setFlow(dbFlow);
          saveVideoStudioFlow(dbFlow);
          setSaveState("saved");
          setHydrationState("ready");
        } else if (!cancelled) {
          // Never replace an owned project with the default Stage 1 document.
          // A failed restore remains recoverable and cannot trigger autosave.
          hydrationStateRef.current = "failed";
          setFlow(null);
          setSaveState("local");
          setHydrationState("failed");
        }
      });
    } else if (hasProjectParameter) {
      hydrationStateRef.current = "failed";
      setHydrationState("failed");
    } else {
      // A new/local Guided flow has no remote project to hydrate.
      hydrationStateRef.current = "ready";
      setFlow(localFlow);
      setHydrationState("ready");
    }
    return () => { cancelled = true; };
  }, [hydrationAttempt]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      sampleGenerationRevisionRef.current += 1;
      for (const url of sampleUrlsRef.current) URL.revokeObjectURL(url);
      sampleUrlsRef.current.clear();
    };
  }, []);

  const visibleScript = flow?.script ?? flow?.voiceResult ?? null;
  const totalDialogueLines = useMemo(
    () => visibleScript?.scenes.reduce((total, scene) => total + scene.dialogues.length, 0) ?? 0,
    [visibleScript]
  );

  const queueDatabaseSave = (snapshot: VideoStudioFlowState, force = false): Promise<VideoStudioSaveResult> => {
    const failed: VideoStudioSaveResult = { success: false, sceneIds: {} };
    // No snapshot from a cached/default flow may write over an explicit
    // project's database document while hydration is pending or failed.
    if (hydrationStateRef.current !== "ready") return Promise.resolve(failed);
    if (!snapshot.projectId || !snapshot.draftId || (!snapshot.script && !snapshot.voiceResult)) return Promise.resolve(failed);
    const signature = JSON.stringify({
      // `script` is edited in the Studio. A prior voice snapshot must not make
      // an edited script look unchanged and suppress its save.
      projectId: snapshot.projectId, draftId: snapshot.draftId, script: snapshot.script ?? snapshot.voiceResult,
      stage: snapshot.stage, musicDecisions: snapshot.musicDecisions, flags: [snapshot.scenesNeedRegeneration, snapshot.voiceNeedsRegeneration, snapshot.videoOutdated],
    });
    if (!force && signature === lastQueuedSignatureRef.current) return Promise.resolve(failed);
    lastQueuedSignatureRef.current = signature;
    const revision = ++saveRevisionRef.current;
    setSaveState("saving");
    const queued = saveChainRef.current.catch(() => undefined).then(async () => {
      const saved = await saveVideoStudioToDatabase(snapshot);
      if (revision !== saveRevisionRef.current) return saved;
      if (saved.success) {
        // The database assigns the stable identity used to reconcile future
        // deletes and reorders. Persist it locally only after the transaction
        // succeeds, so an unsaved client edit can never masquerade as saved.
        const attachSceneIds = (result: typeof snapshot.script | null) => result ? {
          ...result,
          scenes: result.scenes.map((scene) => saved.sceneIds[scene.sceneNumber]
            ? { ...scene, persistenceSceneId: saved.sceneIds[scene.sceneNumber] }
            : scene)
        } : null;
        const reconciledSnapshot = {
          ...snapshot,
          script: attachSceneIds(snapshot.script),
          voiceResult: attachSceneIds(snapshot.voiceResult)
        };
        failedSaveRef.current = null;
        setFlow(reconciledSnapshot);
        saveVideoStudioFlow(reconciledSnapshot);
        setSaveState("saved");
      } else {
        failedSaveRef.current = snapshot;
        setSaveState("failed");
      }
      return saved;
    }).catch(() => {
      if (revision === saveRevisionRef.current) {
        failedSaveRef.current = snapshot;
        setSaveState("failed");
      }
      return failed;
    });
    saveChainRef.current = queued.then(() => undefined);
    return queued;
  };

  const persistFlow = (nextFlow: VideoStudioFlowState) => {
    setFlow(nextFlow);
    saveVideoStudioFlow(nextFlow);
    queueDatabaseSave(nextFlow);
  };

  const updateFlow = (partial: Partial<VideoStudioFlowState>) => {
    if (!flow) return;
    persistFlow({
      ...flow,
      ...partial
    });
  };

  const setStage = (stage: VideoStudioStage) => {
    if (!flow) return;
    persistFlow({
      ...flow,
      stage
    });
    setError("");
    setEditingKey(null);
  };

  const goToPreviousStage = () => {
    if (!flow) return;
    const previous = previousVideoStudioStage(flow.stage);
    if (previous) setStage(previous);
  };

  const savePreviewProject = async () => {
    if (!flow?.script || finalSaveRunningRef.current) return;
    finalSaveRunningRef.current = true;
    setFinalSaveFeedback("saving");
    try {
      let snapshot = flow;
      if (!snapshot.projectId || !snapshot.draftId) {
        const created = await createVideoStudioProject(snapshot);
        if (!created) throw new Error("Could not create the project.");
        snapshot = { ...snapshot, ...created };
        // Keep the server-assigned identity locally before queuing the first
        // scene save, so a retry updates this project instead of creating one.
        setFlow(snapshot);
        saveVideoStudioFlow(snapshot);
      }

      const saved = await queueDatabaseSave(snapshot, true);
      if (!saved.success) throw new Error("Could not save the project.");
      setFinalSaveFeedback("saved");
    } catch {
      setFinalSaveFeedback("failed");
    } finally {
      finalSaveRunningRef.current = false;
    }
  };

  const toggleGenre = (genre: string) => {
    if (!flow) return;
    const nextGenres = flow.genres.includes(genre)
      ? flow.genres.length === 1
        ? flow.genres
        : flow.genres.filter((item) => item !== genre)
      : [...flow.genres, genre];

    persistFlow({
      ...flow,
      genres: nextGenres,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script)
    });
  };

  const toggleTone = (tone: string) => {
    if (!flow) return;
    const nextTones = flow.tones.includes(tone)
      ? flow.tones.length === 1
        ? flow.tones
        : flow.tones.filter((item) => item !== tone)
      : [...flow.tones, tone];

    persistFlow({
      ...flow,
      tones: nextTones,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script)
    });
  };

  const addCustomGenre = () => {
    if (!flow) return;
    const customGenre = customGenreInput.trim();
    if (!customGenre) return;
    const nextGenres = flow.genres.includes(customGenre)
      ? flow.genres
      : [...flow.genres, customGenre];
    persistFlow({
      ...flow,
      genres: nextGenres,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script)
    });
    setCustomGenreInput("");
  };

  const addCustomTone = () => {
    if (!flow) return;
    const customTone = customToneInput.trim();
    if (!customTone) return;
    const nextTones = flow.tones.includes(customTone)
      ? flow.tones
      : [...flow.tones, customTone];
    persistFlow({
      ...flow,
      tones: nextTones,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script)
    });
    setCustomToneInput("");
  };

  const updateRoughIdea = (roughIdea: string) => {
    if (!flow) return;
    persistFlow({
      ...flow,
      roughIdea
    });
  };

  const updateAcceptedStory = (acceptedStory: string) => {
    if (!flow) return;
    persistFlow({
      ...flow,
      acceptedStory,
      scenesNeedRegeneration: Boolean(flow.script),
      videoOutdated: Boolean(flow.script),
      voiceNeedsRegeneration: Boolean(flow.voiceResult)
    });
  };

  const generateStory = async (scenarioOverride?: string) => {
    if (!flow || isGeneratingStory) return;
    const scenario = (scenarioOverride ?? flow.roughIdea).trim();

    if (scenario.length < 12) {
      setError("Write a clearer rough story idea before generating with Gemini.");
      return;
    }

    setIsGeneratingStory(true);
    setError("");
    setEditingKey(null);

    try {
      const response = await fetch("/api/video/generate", {
        body: JSON.stringify({
          genre: flow.genres,
          includeAudio: false,
          language: flow.language,
          scenario,
          tone: flow.tones
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Gemini story generation failed.");
      }

      const script = payload as VideoGenerationResponse;
      const storyText = createStoryTextFromScript(script);

      let projectId = flow.projectId;
      let draftId = flow.draftId;
      if (!projectId || !draftId) {
        const created = await createVideoStudioProject({ ...flow, script });
        if (created) {
          projectId = created.projectId;
          draftId = created.draftId;
        }
      }

      persistFlow({
        ...flow,
        acceptedStory: storyText,
        generatedStory: storyText,
        roughIdea: scenario,
        scenesNeedRegeneration: false,
        script,
        scriptLanguage: flow.language,
        stage: "storyReview",
        videoOutdated: true,
        voiceNeedsRegeneration: false,
        voiceResult: null,
        projectId,
        draftId
      });
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Gemini story generation failed."
      );
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const regenerateScenes = async () => {
    if (!flow || isGeneratingStory) return;
    const scenario = (flow.acceptedStory || flow.generatedStory || flow.roughIdea).trim();

    if (scenario.length < 12) {
      setError("The accepted story needs more text before regenerating scenes and dialogues.");
      return;
    }

    const currentSceneCount = flow.script?.scenes.length ?? flow.sceneCount;
    const hasGeneratedImages = Boolean(flow.script?.scenes.some((scene) => scene.generatedImageUrl));
    const hasGeneratedMusic = Boolean(flow.script?.scenes.some((scene) => scene.backgroundMusicUrl));
    const hasGeneratedVoice = Boolean(flow.voiceResult);
    const lost = [
      hasGeneratedVoice && "voice audio",
      hasGeneratedImages && "generated scene images",
      hasGeneratedMusic && "background music"
    ].filter(Boolean).join(", ");
    const confirmMessage = lost
      ? `Regenerating scenes and dialogues will replace all ${currentSceneCount} current scenes, along with any edits you made to them, and discard their ${lost}. This cannot be undone. Continue?`
      : `Regenerating scenes and dialogues will replace all ${currentSceneCount} current scenes, along with any edits you made to them. This cannot be undone. Continue?`;

    if (!window.confirm(confirmMessage)) return;

    setIsGeneratingStory(true);
    setError("");
    setEditingKey(null);

    try {
      const response = await fetch("/api/video/generate", {
        body: JSON.stringify({
          genre: flow.genres,
          includeAudio: false,
          language: flow.language,
          scenario,
          sceneCount: currentSceneCount,
          tone: flow.tones
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Scene and dialogue regeneration failed.");
      }

      const script = payload as VideoGenerationResponse;

      let projectId = flow.projectId;
      let draftId = flow.draftId;
      if (!projectId || !draftId) {
        const created = await createVideoStudioProject({ ...flow, script });
        if (created) {
          projectId = created.projectId;
          draftId = created.draftId;
        }
      }

      persistFlow({
        ...flow,
        generatedStory: flow.generatedStory || createStoryTextFromScript(script),
        scenesNeedRegeneration: false,
        script,
        scriptLanguage: flow.language,
        stage: "scenes",
        videoOutdated: true,
        voiceNeedsRegeneration: false,
        voiceResult: null,
        projectId,
        draftId
      });
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Scene and dialogue regeneration failed."
      );
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const acceptStory = () => {
    if (!flow?.script) {
      setError("Generate the story first before continuing to scenes.");
      return;
    }

    setStage("scenes");
  };

  const updateFilmField = (field: "logline" | "title", value: string) => {
    if (!flow?.script) return;

    const nextScript = {
      ...flow.script,
      [field]: value
    };

    persistFlow({
      ...flow,
      script: nextScript,
      videoOutdated: true
    });
  };

  const updateSceneField = (
    sceneNumber: number,
    field: EditableSceneField,
    value: string
  ) => {
    if (!flow?.script) return;

    const nextScript = {
      ...flow.script,
      scenes: flow.script.scenes.map((scene) =>
        scene.sceneNumber === sceneNumber ? {
          ...scene,
          [field]: value,
          ...(field === "narration" ? { narrationAudioOutdated: true } : {}),
          ...(field === "visualPrompt" || field === "imagePrompt" || field === "location" || field === "mood" || field === "directorNotes"
            ? { generatedImageOutdated: true } : {}),
          ...(field === "mood" || field === "sceneTone" || field === "soundDesign"
            ? { backgroundMusicOutdated: scene.backgroundMusicStatus === "silent" ? false : true } : {}),
        } : scene
      )
    };

    persistFlow({
      ...flow,
      script: nextScript,
      videoOutdated: true
    });
  };

  const updateDialogueLine = (sceneNumber: number, dialogueId: string, value: string) => {
    if (!flow?.script) return;

    const nextScript = {
      ...flow.script,
      scenes: flow.script.scenes.map((scene) =>
        scene.sceneNumber === sceneNumber
          ? {
              ...scene,
              dialogues: scene.dialogues.map((dialogue) =>
                dialogue.id === dialogueId ? { ...dialogue, line: value, audioOutdated: true } : dialogue
              )
            }
          : scene
      )
    };

    persistFlow({
      ...flow,
      script: nextScript,
      videoOutdated: true,
      voiceNeedsRegeneration: Boolean(flow.voiceResult)
    });
  };

  const updateDialogueMeta = (
    sceneNumber: number,
    dialogueId: string,
    partial: Partial<Pick<MovieDialogueLine, "character" | "delivery">> & {
      voiceProfile?: Partial<MovieDialogueLine["voiceProfile"]>;
    }
  ) => {
    if (!flow?.script) return;

    const nextScript = {
      ...flow.script,
      scenes: flow.script.scenes.map((scene) =>
        scene.sceneNumber === sceneNumber
          ? {
              ...scene,
              ...(partial.voiceProfile?.appearance !== undefined ? { generatedImageOutdated: true } : {}),
              dialogues: scene.dialogues.map((dialogue) =>
                dialogue.id === dialogueId
                  ? {
                      ...dialogue,
                      ...partial,
                      audioOutdated: true,
                      voiceProfile: {
                        ...dialogue.voiceProfile,
                        ...partial.voiceProfile,
                        character: partial.character || dialogue.character
                      }
                    }
                  : dialogue
              )
            }
          : scene
      )
    };

    persistFlow({
      ...flow,
      script: nextScript,
      videoOutdated: true,
      voiceNeedsRegeneration: Boolean(flow.voiceResult)
    });
  };

  const addScene = () => {
    if (!flow?.script) return;
    const previousScene = flow.script.scenes[flow.script.scenes.length - 1];
    const baseVoice = flow.script.characterVoices[0] ?? previousScene?.dialogues[0]?.voiceProfile;
    if (!previousScene || !baseVoice) return;

    const nextSceneNumber = flow.script.scenes.length + 1;
    const nextScene: MovieScene = {
      directorNotes: "Describe camera movement, pacing, and the key action for this new scene.",
      dialogues: [
        {
          character: baseVoice.character,
          delivery: "neutral",
          id: createDialogueId(),
          line: "",
          voiceProfile: baseVoice
        }
      ],
      estimatedDuration: "45 seconds",
      imagePrompt: "Detailed image prompt for the new scene.",
      location: previousScene.location,
      mood: previousScene.mood,
      narration: "",
      sceneGenre: previousScene.sceneGenre,
      sceneNumber: nextSceneNumber,
      sceneTone: previousScene.sceneTone,
      soundDesign: "Ambient sound and music direction for this new scene.",
      title: `Scene ${nextSceneNumber}`,
      visualPrompt: "Describe the visual look, character blocking, and atmosphere."
    };

    persistFlow({
      ...flow,
      sceneCount: nextSceneNumber,
      script: {
        ...flow.script,
        scenes: [...flow.script.scenes, nextScene]
      },
      videoOutdated: true,
      voiceNeedsRegeneration: Boolean(flow.voiceResult)
    });
  };

  const deleteScene = (sceneNumber: number) => {
    if (!flow?.script || flow.script.scenes.length <= 1) return;
    const nextMusicDecisions: typeof flow.musicDecisions = {};
    const nextScenes = flow.script.scenes
      .filter((scene) => scene.sceneNumber !== sceneNumber)
      .map((scene, index) => {
        const nextSceneNumber = index + 1;
        const decision = flow.musicDecisions[String(scene.sceneNumber)];
        if (decision) nextMusicDecisions[String(nextSceneNumber)] = decision;
        // persistenceSceneId is intentionally retained: it is the database
        // identity, whereas sceneNumber is only the mutable display order.
        return { ...scene, sceneNumber: nextSceneNumber };
      });

    persistFlow({
      ...flow,
      sceneCount: nextScenes.length,
      musicDecisions: nextMusicDecisions,
      script: {
        ...flow.script,
        scenes: nextScenes
      },
      videoOutdated: true,
      voiceNeedsRegeneration: Boolean(flow.voiceResult)
    });
  };

  const addDialogueLine = (sceneNumber: number, characterName?: string, line = "") => {
    if (!flow?.script) return;
    const targetScene = flow.script.scenes.find((scene) => scene.sceneNumber === sceneNumber);
    const baseDialogue =
      targetScene?.dialogues.find((dialogue) => dialogue.character === characterName) ??
      targetScene?.dialogues[0];

    if (!targetScene || !baseDialogue) return;

    const nextDialogue: MovieDialogueLine = {
      ...baseDialogue,
      audioError: undefined,
      audioMimeType: undefined,
      audioUrl: undefined,
      delivery: "Manual line",
      id: createDialogueId(),
      line
    };

    const nextScript = {
      ...flow.script,
      scenes: flow.script.scenes.map((scene) =>
        scene.sceneNumber === sceneNumber
          ? { ...scene, dialogues: [...scene.dialogues, nextDialogue] }
          : scene
      )
    };

    persistFlow({
      ...flow,
      script: nextScript,
      videoOutdated: true,
      voiceNeedsRegeneration: Boolean(flow.voiceResult)
    });
  };

  const addSceneCharacter = (sceneNumber: number, characterName: string) => {
    if (!flow?.script) return;
    const cleanName = characterName.trim();
    if (!cleanName) return;

    const targetScene = flow.script.scenes.find((scene) => scene.sceneNumber === sceneNumber);
    const baseDialogue = targetScene?.dialogues[0];
    const selectedVoice = VIDEO_VOICE_OPTIONS[0];

    if (!targetScene || !baseDialogue) return;

    const nextDialogue: MovieDialogueLine = {
      ...baseDialogue,
      audioError: undefined,
      audioMimeType: undefined,
      audioUrl: undefined,
      character: cleanName,
      delivery: "neutral",
      id: createDialogueId(),
      line: "",
      voiceProfile: {
        ...baseDialogue.voiceProfile,
        archetype: "neutral_male",
        character: cleanName,
        deepgramModel: selectedVoice.deepgramModel,
        description: selectedVoice.voiceName,
        gender: selectedVoice.gender,
        tone: "neutral",
        voiceName: selectedVoice.voiceName
      }
    };

    const nextScript = {
      ...flow.script,
      characterVoices: flow.script.characterVoices.some((voice) => voice.character === cleanName)
        ? flow.script.characterVoices
        : [...flow.script.characterVoices, nextDialogue.voiceProfile],
      scenes: flow.script.scenes.map((scene) =>
        scene.sceneNumber === sceneNumber
          ? { ...scene, generatedImageOutdated: true, dialogues: [...scene.dialogues, nextDialogue] }
          : scene
      )
    };

    persistFlow({
      ...flow,
      script: nextScript,
      videoOutdated: true,
      voiceNeedsRegeneration: Boolean(flow.voiceResult)
    });
  };

  const deleteDialogueLine = (sceneNumber: number, dialogueId: string) => {
    if (!flow?.script) return;

    const nextScript = {
      ...flow.script,
      scenes: flow.script.scenes.map((scene) => {
        if (scene.sceneNumber !== sceneNumber) return scene;

        if (scene.dialogues.length <= 1) {
          return {
            ...scene,
            dialogues: scene.dialogues.map((dialogue) =>
              dialogue.id === dialogueId ? { ...dialogue, line: "", audioUrl: undefined } : dialogue
            )
          };
        }

        return {
          ...scene,
          dialogues: scene.dialogues.filter((dialogue) => dialogue.id !== dialogueId)
        };
      })
    };

    persistFlow({
      ...flow,
      script: nextScript,
      videoOutdated: true,
      voiceNeedsRegeneration: Boolean(flow.voiceResult)
    });
  };

  const generateAdditionalDialogue = async (sceneNumber: number) => {
    if (!flow?.script || generatingDialogueScene) return;
    const scene = flow.script.scenes.find((item) => item.sceneNumber === sceneNumber);
    if (!scene) return;

    setGeneratingDialogueScene(sceneNumber);
    setError("");

    try {
      const uniqueDialogues = Array.from(
        new Map(scene.dialogues.map((dialogue) => [dialogue.character, dialogue])).values()
      );
      const response = await fetch("/api/story/generate-dialogue", {
        body: JSON.stringify({
          characters: uniqueDialogues.map((dialogue) => ({
            id: dialogue.character,
            name: dialogue.character,
            personalityTone: dialogue.voiceProfile.tone,
            role: dialogue.voiceProfile.archetype,
            voiceStyle: dialogue.voiceProfile.voiceName
          })),
          genres: [scene.sceneGenre],
          linesPerCharacter: 1,
          previousScenes: flow.script.scenes
            .filter((item) => item.sceneNumber < scene.sceneNumber)
            .map((item) => ({
              description: item.narration || item.directorNotes,
              dialogues: item.dialogues.map((dialogue) => ({
                characterName: dialogue.character,
                text: dialogue.line
              })),
              sceneNumber: item.sceneNumber,
              title: item.title
            })),
          sceneDescription: [scene.narration, scene.directorNotes, scene.visualPrompt].filter(Boolean).join("\n"),
          sceneNumber: scene.sceneNumber,
          draftId: flow.draftId,
          storyTitle: flow.script.title,
          tones: [scene.sceneTone]
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok || !Array.isArray(payload.dialogues)) {
        throw new Error(payload.error ?? "Dialogue generation failed.");
      }

      const generatedLines: MovieDialogueLine[] = payload.dialogues.map(
        (dialogue: { characterId: string; characterName?: string; text: string }) => {
          const baseDialogue =
            scene.dialogues.find((item) => item.character === dialogue.characterId) ?? scene.dialogues[0];

          return {
            ...baseDialogue,
            audioError: undefined,
            audioMimeType: undefined,
            audioUrl: undefined,
            character: baseDialogue?.character ?? dialogue.characterName ?? dialogue.characterId,
            delivery: "AI added line",
            id: createDialogueId(),
            line: dialogue.text,
            voiceProfile: baseDialogue.voiceProfile
          };
        }
      );

      const nextScript = {
        ...flow.script,
        scenes: flow.script.scenes.map((item) =>
          item.sceneNumber === sceneNumber
            ? { ...item, dialogues: [...item.dialogues, ...generatedLines] }
            : item
        )
      };

      persistFlow({
        ...flow,
        script: nextScript,
        videoOutdated: true,
        voiceNeedsRegeneration: Boolean(flow.voiceResult)
      });
    } catch (dialogueError) {
      setError(dialogueError instanceof Error ? dialogueError.message : "Dialogue generation failed.");
    } finally {
      setGeneratingDialogueScene(null);
    }
  };

  const generateDialogueForLine = async (sceneNumber: number, dialogueId: string) => {
    if (!flow?.script || generatingDialogueLineId) return;
    const scene = flow.script.scenes.find((item) => item.sceneNumber === sceneNumber);
    const dialogue = scene?.dialogues.find((item) => item.id === dialogueId);
    if (!scene || !dialogue) return;

    setGeneratingDialogueLineId(dialogueId);
    setError("");

    try {
      const response = await fetch("/api/story/generate-dialogue", {
        body: JSON.stringify({
          characters: [
            {
              id: dialogue.character,
              name: dialogue.character,
              personalityTone: dialogue.voiceProfile.tone || dialogue.delivery,
              role: dialogue.voiceProfile.archetype || "Supporting Character",
              voiceStyle: dialogue.voiceProfile.voiceName
            }
          ],
          genres: [scene.sceneGenre],
          linesPerCharacter: 1,
          previousScenes: flow.script.scenes
            .filter((item) => item.sceneNumber < scene.sceneNumber)
            .map((item) => ({
              description: item.narration || item.directorNotes,
              dialogues: item.dialogues.map((line) => ({
                characterName: line.character,
                text: line.line
              })),
              sceneNumber: item.sceneNumber,
              title: item.title
            })),
          sceneDescription: [
            scene.title,
            scene.narration,
            scene.directorNotes,
            scene.visualPrompt,
            dialogue.delivery ? `Requested delivery: ${dialogue.delivery}` : ""
          ].filter(Boolean).join("\n"),
          sceneNumber: scene.sceneNumber,
          draftId: flow.draftId,
          storyTitle: flow.script.title,
          tones: [scene.sceneTone]
        }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok || !Array.isArray(payload.dialogues) || !payload.dialogues[0]?.text) {
        throw new Error(payload.error ?? "Dialogue generation failed.");
      }

      updateDialogueLine(sceneNumber, dialogueId, String(payload.dialogues[0].text));
    } catch (dialogueError) {
      setError(dialogueError instanceof Error ? dialogueError.message : "Dialogue generation failed.");
    } finally {
      setGeneratingDialogueLineId(null);
    }
  };

  const generateVoice = async () => {
    if (!flow?.script || isGeneratingVoice) return;
    if (!isCurrentVideoScriptLanguage(flow.scriptLanguage, flow.language)) {
      setError("This script was generated for a different language. Regenerate scenes before generating voice audio.");
      return;
    }

    setIsGeneratingVoice(true);
    setError("");

    try {
      const narratorProfile = {
        archetype: "narrator", character: "Narrator", deepgramModel: "aura-2-athena-en",
        description: "Dedicated scene narrator voice", gender: "feminine", tone: "calm, cinematic", voiceName: "Athena"
      };
      const scriptForTts = {
        ...flow.script,
        scenes: flow.script.scenes.map((scene) => ({
          ...scene,
          dialogues: scene.narration.trim() ? [{
            id: `scene-${scene.sceneNumber}-narration`, character: "Narrator", delivery: "narration",
            line: scene.narration, voiceProfile: narratorProfile
          }, ...scene.dialogues] : scene.dialogues,
        })),
      };
      const response = await fetch("/api/video/tts", {
        body: JSON.stringify({ script: scriptForTts, projectId: flow.projectId, draftId: flow.draftId, language: flow.language, scriptLanguage: flow.scriptLanguage }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Voice generation failed.");
      }

      const voicePayload = payload as VideoGenerationResponse;
      const voiceResult: VideoGenerationResponse = {
        ...voicePayload,
        scenes: voicePayload.scenes.map((scene) => {
          const narrator = scene.dialogues.find((line) => line.id === `scene-${scene.sceneNumber}-narration`);
          return {
            ...scene,
            narrationAudioUrl: narrator?.audioUrl,
            narrationAudioOutdated: false,
            dialogues: scene.dialogues
              .filter((line) => line.id !== `scene-${scene.sceneNumber}-narration`)
              .map((line) => ({ ...line, audioOutdated: false })),
          };
        }),
      };
      persistFlow({
        ...flow,
        script: voiceResult,
        videoOutdated: true,
        voiceNeedsRegeneration: false,
        voiceResult
      });
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : "Voice generation failed.");
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  const regenerateDialogueAudio = async (sceneNumber: number, dialogueId: string) => {
    if (!flow?.script || regeneratingDialogueAudioId || isGeneratingVoice) return;
    const sourceScene = flow.script.scenes.find((scene) => scene.sceneNumber === sceneNumber);
    const sourceLine = sourceScene?.dialogues.find((line) => line.id === dialogueId);
    if (!sourceScene || !sourceLine) return;
    if (!isCurrentVideoScriptLanguage(flow.scriptLanguage, flow.language)) {
      setError("This script was generated for a different language. Regenerate scenes before regenerating dialogue audio.");
      return;
    }

    setRegeneratingDialogueAudioId(dialogueId);
    setError("");
    try {
      // This is deliberately scoped to one dialogue line; narration and other
      // saved character clips are not regenerated by this user action.
      const response = await fetch("/api/video/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: { ...flow.script, scenes: [{ ...sourceScene, dialogues: [sourceLine] }] },
          projectId: flow.projectId,
          draftId: flow.draftId,
          language: flow.language,
          scriptLanguage: flow.scriptLanguage,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Dialogue voice regeneration failed.");

      const replacement = (payload as VideoGenerationResponse).scenes[0]?.dialogues[0];
      if (!replacement) throw new Error("Dialogue voice regeneration returned no result.");
      const nextScript = {
        ...flow.script,
        scenes: flow.script.scenes.map((scene) => scene.sceneNumber !== sceneNumber ? scene : {
          ...scene,
          dialogues: scene.dialogues.map((line) => line.id === dialogueId ? { ...line, ...replacement, audioOutdated: false } : line),
        }),
      };
      persistFlow({
        ...flow,
        script: nextScript,
        voiceResult: nextScript,
        voiceNeedsRegeneration: false,
        videoOutdated: true,
      });
    } catch (voiceError) {
      setError(voiceError instanceof Error ? voiceError.message : "Dialogue voice regeneration failed.");
    } finally {
      setRegeneratingDialogueAudioId(null);
    }
  };

  const generateSceneImages = async (forceRegenerateAll = false, replacementSceneId?: string) => {
    if (!flow?.script || isGeneratingImages) return;

    setIsGeneratingImages(true);
    setError("");
    let mediaFlow = flow;

    try {
      // Image generation is ownership-scoped to a persisted Scene. Wait for
      // earlier serialized saves before establishing those targets so a Stage 6
      // request cannot race the API's ownership check.
      await saveChainRef.current;
      const savedTargets = await saveVideoStudioToDatabase(flow);
      if (!savedTargets.success) {
        throw new Error("Save the current scenes before generating visuals. No image request was sent.");
      }
      const attachSceneIds = (script: VideoGenerationResponse | null): VideoGenerationResponse | null => script ? ({
        ...script,
        scenes: script.scenes.map((scene) => ({
          ...scene,
          persistenceSceneId: savedTargets.sceneIds[scene.sceneNumber] ?? scene.persistenceSceneId,
        })),
      }) : null;
      mediaFlow = {
        ...flow,
        script: attachSceneIds(flow.script),
        voiceResult: attachSceneIds(flow.voiceResult),
      };
      const persistedScript = mediaFlow.script;
      if (!persistedScript || !persistedScript.scenes.every((scene) => Boolean(scene.persistenceSceneId))) {
        throw new Error("The saved scene identities could not be restored. No image request was sent.");
      }
      mediaFlow = {
        ...mediaFlow,
        images: {
          ...mediaFlow.images,
          message: "Generating AI visual artwork...",
          status: "generating"
        }
      };
      persistFlow(mediaFlow);

      const mapWithConcurrency = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) => {
        const results: R[] = [];
        const executing: Promise<void>[] = [];
        for (const item of items) {
          const p = Promise.resolve().then(() => fn(item)).then(res => {
            results.push(res);
          });
          const e = p.then(() => {
            executing.splice(executing.indexOf(e), 1);
          });
          executing.push(e);
          if (executing.length >= limit) {
            await Promise.race(executing);
          }
        }
        await Promise.all(executing);
        return results;
      };

      const updatedScenes = persistedScript.scenes.map(scene => {
        if (forceRegenerateAll) {
          return {
            ...scene,
            generatedImageStatus: "idle" as const,
            generatedImageError: undefined
          };
        }
        return { ...scene };
      });

      let errorsOccurred = false;

      // Keep one in-flight image request so a story's visual continuity is
      // generated in scene order and the provider is not needlessly saturated.
      await mapWithConcurrency(updatedScenes, 1, async (scene) => {
        if (replacementSceneId && scene.persistenceSceneId !== replacementSceneId) return;
        const isReplacement = forceRegenerateAll || Boolean(replacementSceneId) || Boolean(scene.generatedImageOutdated);
        if (!isReplacement && hasUsableMediaReference(scene.generatedImageUrl) && !scene.generatedImageOutdated) {
          return;
        }

        scene.generatedImageStatus = "generating";

        try {
          const previousScene = mediaFlow.script?.scenes.find((candidate) => candidate.sceneNumber === scene.sceneNumber - 1);
          const visualContext = buildSceneVisualContext({
            scene: {
              title: scene.title,
              narration: scene.narration,
              imagePrompt: scene.imagePrompt,
              visualPrompt: scene.visualPrompt,
              directorNotes: scene.directorNotes,
              location: scene.location,
              mood: scene.mood,
              dialogueCharacterNames: scene.dialogues.map((dialogue) => dialogue.character),
              visualDirection: scene.visualDirection,
            },
            characters: (mediaFlow.script?.characterVoices ?? []).map((voice) => ({
              id: voice.characterId,
              name: voice.character,
              appearance: voice.appearance,
              role: voice.archetype,
              personalityTone: voice.tone,
            })),
            priorScene: previousScene ? {
              title: previousScene.title,
              location: previousScene.location,
              imagePrompt: previousScene.imagePrompt,
              visualPrompt: previousScene.visualPrompt,
            } : undefined,
          });

          const response = await fetch("/api/video/image", {
            body: JSON.stringify({
              sceneId: `scene-${scene.sceneNumber}`,
              imagePrompt: visualContext.imagePrompt,
              visualPrompt: visualContext.visualPrompt,
              sceneTitle: scene.title,
              location: visualContext.location,
              mood: visualContext.mood,
              genres: mediaFlow.genres,
              // A requested regeneration is a replacement attempt; preserve
              // the old URL locally until the new provider/upload succeeds.
              existingHash: isReplacement ? undefined : scene.generatedImageHash,
              characterNames: visualContext.characterNames,
              characterAppearances: visualContext.characterAppearances,
              continuityNotes: visualContext.continuityNotes,
              draftId: flow.draftId,
              sceneNumber: scene.sceneNumber,
              persistenceSceneId: scene.persistenceSceneId,
            }),
            headers: {
              "Content-Type": "application/json"
            },
            method: "POST"
          });
          const payload = await response.json();

          if (payload.duplicate === true) {
            return;
          }

          if (!response.ok) {
            throw new Error(payload.error ?? `Failed to generate image for Scene ${scene.sceneNumber}.`);
          }

          scene.generatedImageUrl = payload.imageUrl;
          scene.generatedImagePrompt = payload.prompt;
          scene.generatedImageHash = payload.hash;
          scene.generatedImageStatus = "completed";
          scene.generatedImageError = undefined;
          scene.generatedImageOutdated = false;
        } catch (err) {
          console.error(err);
          errorsOccurred = true;
          // A failed replacement never discards a valid saved image. Keep it
          // visible as outdated so the user can retry deliberately.
          scene.generatedImageStatus = hasUsableMediaReference(scene.generatedImageUrl) ? "completed" : "failed";
          scene.generatedImageOutdated = hasUsableMediaReference(scene.generatedImageUrl);
          scene.generatedImageError = err instanceof Error ? err.message : "Image generation failed";
        }
      });

      const anyImages = updatedScenes.some((scene) => hasUsableMediaReference(scene.generatedImageUrl));

      persistFlow({
        ...mediaFlow,
        script: {
          ...persistedScript,
          scenes: updatedScenes
        },
        images: {
          message: errorsOccurred 
            ? "Visual artwork generation finished, but some scenes failed." 
            : "All scene visual artwork is ready.",
          provider: "AI Visual Engine",
          status: anyImages ? "ready" : "error"
        },
        videoOutdated: true
      });
    } catch (imgError) {
      persistFlow({
        ...mediaFlow,
        images: {
          ...flow.images,
          message:
            imgError instanceof Error
              ? imgError.message
              : "Visual artwork generation failed.",
          status: "error"
        }
      });
    } finally {
      setIsGeneratingImages(false);
    }
  };

  const regenerateAllImages = () => {
    generateSceneImages(true);
  };

  const regenerateSceneImage = (persistenceSceneId: string | undefined) => {
    if (!persistenceSceneId) {
      setError("Save this scene before requesting a replacement image.");
      return;
    }
    void generateSceneImages(false, persistenceSceneId);
  };

  const updateSceneVisualDirection = (sceneNumber: number, patch: NonNullable<MovieScene["visualDirection"]>) => {
    if (!flow?.script) return;
    persistFlow({ ...flow, script: { ...flow.script, scenes: flow.script.scenes.map((scene) => scene.sceneNumber === sceneNumber ? { ...scene, visualDirection: patch, generatedImageOutdated: Boolean(scene.generatedImageUrl) } : scene) } });
  };

  const generateAllMusic = async () => {
    if (!flow?.script || isGeneratingMusic || musicBatchRunningRef.current) return;
    if (!flow.draftId) {
      setError("Save the Video Studio project before generating cinematic scores.");
      return;
    }
    if (typeof OfflineAudioContext === "undefined" && !(globalThis as typeof globalThis & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext) {
      setError("This browser cannot render a cinematic score offline.");
      return;
    }

    musicBatchRunningRef.current = true;
    setIsGeneratingMusic(true);
    setError("");
    const updatedScenes = flow.script.scenes.map((scene) => ({ ...scene }));
    const updatedMusicDecisions = { ...flow.musicDecisions };
    const results: MusicBatchProgress["results"] = {};
    const candidates: Array<{ scene: MovieScene; category: "ambient" | "suspense" | "emotional" | "action" | "hopeful" }> = [];

    updatedScenes.forEach((scene, index) => {
      // A ready saved URL (including older imported WAVs) wins. A stale URL is
      // preserved for playback but is an explicit regeneration candidate.
      if (hasUsableMediaReference(scene.backgroundMusicUrl) && !scene.backgroundMusicOutdated) {
        results[scene.sceneNumber] = "skipped";
        return;
      }

      const persisted = updatedMusicDecisions[String(scene.sceneNumber)];
      const decision = persisted?.outcome === "silence"
        ? persisted
        : persisted?.category
          ? persisted
          : scene.backgroundMusicStatus === "silent"
            ? { outcome: "silence" as const, reason: scene.backgroundMusicReason || "Intentional silence was previously selected for this scene." }
            : decideSceneMusic({
                sceneTitle: scene.title,
                mood: scene.mood || scene.sceneTone || flow.tones.join(", "),
                sceneTone: scene.sceneTone,
                soundDesign: scene.soundDesign,
                narration: scene.narration,
                dialogueCount: scene.dialogues.length,
                estimatedDuration: scene.estimatedDuration,
                previous: index > 0 ? {
                  category: updatedScenes[index - 1].backgroundMusicCategory,
                  trackId: updatedScenes[index - 1].backgroundMusicTrackId,
                  wasSilent: updatedScenes[index - 1].backgroundMusicStatus === "silent",
                } : undefined,
              });

      if (decision.outcome === "silence") {
        updatedMusicDecisions[String(scene.sceneNumber)] = { outcome: "silence", reason: decision.reason };
        scene.backgroundMusicTitle = "Intentional silence";
        scene.backgroundMusicMood = "silence";
        scene.backgroundMusicPrompt = decision.reason;
        scene.backgroundMusicReason = decision.reason;
        scene.backgroundMusicStatus = "silent";
        scene.backgroundMusicError = undefined;
        results[scene.sceneNumber] = "silent";
        return;
      }

      // Persisted legacy decisions can be malformed; recompute rather than
      // attempting to render an unspecified category.
      const category = decision.category;
      if (!category) {
        scene.backgroundMusicStatus = "failed";
        scene.backgroundMusicError = "This scene has no valid music category. Generate its scene-aware decision again.";
        results[scene.sceneNumber] = "failed";
        return;
      }
      updatedMusicDecisions[String(scene.sceneNumber)] = { outcome: "music", category, reason: decision.reason };
      scene.backgroundMusicTitle = "Cinematic score not saved yet";
      scene.backgroundMusicMood = category;
      scene.backgroundMusicCategory = category;
      scene.backgroundMusicPrompt = decision.reason;
      scene.backgroundMusicReason = decision.reason;
      scene.backgroundMusicStatus = "generating";
      scene.backgroundMusicError = undefined;
      candidates.push({ scene, category });
    });

    setMusicBatchProgress({ current: 0, total: candidates.length, results });
    // Show the selected states while the sequential renderer works, without
    // queueing incomplete "generating" state as a successful project save.
    setFlow({ ...flow, script: { ...flow.script, scenes: updatedScenes }, musicDecisions: updatedMusicDecisions });

    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const { scene, category } = candidates[index];
        setMusicBatchProgress({ current: index + 1, total: candidates.length, currentSceneNumber: scene.sceneNumber, results: { ...results } });
        try {
          const recipe = createSampleScoreRecipe({
            category,
            sceneTitle: scene.title,
            mood: [scene.mood, scene.sceneTone, scene.directorNotes, scene.location].filter(Boolean).join(" "),
            genres: flow.genres,
            // Omit a seed so the established scene-aware deterministic recipe
            // remains stable. The explicit per-scene Regenerate control picks
            // a fresh seed only when the user asks for a replacement.
          });
          const rendered = await renderSampleBasedScore(recipe);
          const description = `Sample-based ${category} cinematic instrumental score; seed ${recipe.seed}; ${recipe.tempo} BPM; ${rendered.durationSeconds.toFixed(1)} seconds; ${rendered.eventCount} recorded-instrument events. No vocals or dialogue.`;
          const form = new FormData();
          form.append("draftId", flow.draftId);
          form.append("sceneNumber", String(scene.sceneNumber));
          form.append("file", new Blob([rendered.wav], { type: "audio/wav" }), `scene-${scene.sceneNumber}-cinematic-score.wav`);
          form.append("description", description);
          const response = await fetch("/api/background-music/sample-based", { method: "POST", body: form });
          const payload = await response.json();
          if (!response.ok || !payload.audioUrl) throw new Error(payload.error ?? "Could not save the cinematic score.");
          Object.assign(scene, {
            backgroundMusicUrl: payload.audioUrl,
            backgroundMusicTitle: `Scene ${scene.sceneNumber} cinematic score`,
            backgroundMusicMood: category,
            backgroundMusicCategory: category,
            backgroundMusicTrackId: `sample-based-${recipe.seed}`,
            backgroundMusicProvider: "Sample-Based Cinematic Score v1",
            backgroundMusicPrompt: description,
            backgroundMusicHash: `sample-based-${recipe.seed}`,
            backgroundMusicReason: "Saved browser-rendered sample-based cinematic score.",
            backgroundMusicStatus: "completed" as const,
            backgroundMusicError: undefined,
            backgroundMusicOutdated: false,
          });
          results[scene.sceneNumber] = "saved";
        } catch (sceneError) {
          scene.backgroundMusicStatus = hasUsableMediaReference(scene.backgroundMusicUrl) ? "completed" : "failed";
          scene.backgroundMusicOutdated = hasUsableMediaReference(scene.backgroundMusicUrl);
          scene.backgroundMusicError = sceneError instanceof Error ? sceneError.message : "Could not generate the cinematic score.";
          results[scene.sceneNumber] = "failed";
        }
        setMusicBatchProgress({ current: index + 1, total: candidates.length, currentSceneNumber: scene.sceneNumber, results: { ...results } });
      }

      const failed = Object.values(results).filter((result) => result === "failed").length;
      const saved = Object.values(results).filter((result) => result === "saved").length;
      persistFlow({
        ...flow,
        script: { ...flow.script, scenes: updatedScenes },
        musicDecisions: updatedMusicDecisions,
        music: {
          ...flow.music,
          message: failed ? `Generated ${saved} cinematic score${saved === 1 ? "" : "s"}; ${failed} scene${failed === 1 ? " needs" : "s need"} attention.` : candidates.length ? `Generated and saved ${saved} cinematic score${saved === 1 ? "" : "s"}.` : "All eligible scenes already have a saved score or intentional silence.",
          status: failed ? "error" : "ready",
          provider: "Sample-Based Cinematic Score v1",
        },
        videoOutdated: true,
      });
    } finally {
      musicBatchRunningRef.current = false;
      setIsGeneratingMusic(false);
    }
  };

  const generateSampleScore = async (scene: MovieScene, category: "ambient" | "suspense" | "emotional" | "action" | "hopeful", regenerate = false) => {
    if (!flow?.script || generatingSampleScene !== null || savingSampleScene !== null) return;
    if (typeof OfflineAudioContext === "undefined" && !(globalThis as typeof globalThis & { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext) {
      setSampleErrors((current) => ({ ...current, [scene.sceneNumber]: "This browser cannot render a cinematic score offline." }));
      return;
    }
    setGeneratingSampleScene(scene.sceneNumber); setSampleErrors((current) => ({ ...current, [scene.sceneNumber]: "" }));
    const revision = ++sampleGenerationRevisionRef.current;
    try {
      const previous = sampleScores[scene.sceneNumber];
      const recipe = createSampleScoreRecipe({ category, sceneTitle: scene.title, mood: [scene.mood, scene.sceneTone, scene.directorNotes, scene.location].filter(Boolean).join(" "), genres: flow.genres, seed: regenerate ? (previous?.recipe.seed ?? Date.now()) + 1 : undefined });
      const rendered = await renderSampleBasedScore(recipe);
      if (!isMountedRef.current || revision !== sampleGenerationRevisionRef.current) return;
      const blob = new Blob([rendered.wav], { type: "audio/wav" }); const url = URL.createObjectURL(blob); sampleUrlsRef.current.add(url);
      if (previous) { URL.revokeObjectURL(previous.url); sampleUrlsRef.current.delete(previous.url); }
      const description = `Sample-based ${category} cinematic instrumental score; seed ${recipe.seed}; ${recipe.tempo} BPM; ${rendered.durationSeconds.toFixed(1)} seconds; ${rendered.eventCount} recorded-instrument events. No vocals or dialogue.`;
      setSampleScores((current) => ({ ...current, [scene.sceneNumber]: { blob, url, durationSeconds: rendered.durationSeconds, recipe, description } }));
    } catch (generationError) {
      if (isMountedRef.current && revision === sampleGenerationRevisionRef.current) setSampleErrors((current) => ({ ...current, [scene.sceneNumber]: generationError instanceof Error ? generationError.message : "Could not render the cinematic score." }));
    } finally { if (isMountedRef.current && revision === sampleGenerationRevisionRef.current) setGeneratingSampleScene(null); }
  };

  const previewSampleScore = async (sceneNumber: number) => {
    const player = samplePreviewRefs.current[sceneNumber]; if (!player) return;
    Object.entries(samplePreviewRefs.current).forEach(([key, audio]) => { if (Number(key) !== sceneNumber && audio) audio.pause(); });
    try { player.currentTime = 0; await player.play(); }
    catch { setSampleErrors((current) => ({ ...current, [sceneNumber]: "Browser playback was blocked. Use the audio controls to start the preview." })); }
  };

  const saveSampleScore = async (sceneNumber: number) => {
    if (!flow?.script || !flow.draftId || savingSampleScene !== null) return;
    const preview = sampleScores[sceneNumber]; if (!preview) return;
    setSavingSampleScene(sceneNumber); setSampleErrors((current) => ({ ...current, [sceneNumber]: "" }));
    try {
      const form = new FormData(); form.append("draftId", flow.draftId); form.append("sceneNumber", String(sceneNumber)); form.append("file", preview.blob, `scene-${sceneNumber}-cinematic-score.wav`); form.append("description", preview.description);
      const response = await fetch("/api/background-music/sample-based", { method: "POST", body: form }); const payload = await response.json();
      if (!response.ok || !payload.audioUrl) throw new Error(payload.error ?? "Could not save the cinematic score.");
      const completedScenes = flow.script.scenes.map((scene) => scene.sceneNumber === sceneNumber ? { ...scene, backgroundMusicUrl: payload.audioUrl, backgroundMusicTitle: `Scene ${sceneNumber} cinematic score`, backgroundMusicMood: preview.recipe.category, backgroundMusicCategory: preview.recipe.category, backgroundMusicTrackId: `sample-based-${preview.recipe.seed}`, backgroundMusicProvider: "Sample-Based Cinematic Score v1", backgroundMusicPrompt: preview.description, backgroundMusicHash: `sample-based-${preview.recipe.seed}`, backgroundMusicReason: "Saved browser-rendered sample-based cinematic score.", backgroundMusicStatus: "completed" as const, backgroundMusicError: undefined, backgroundMusicOutdated: false } : scene);
      persistFlow({ ...flow, script: { ...flow.script, scenes: completedScenes }, music: { ...flow.music, message: `Saved cinematic score for Scene ${sceneNumber}.`, status: "ready", provider: "Sample-Based Cinematic Score v1" }, videoOutdated: true });
      URL.revokeObjectURL(preview.url); sampleUrlsRef.current.delete(preview.url); setSampleScores((current) => { const next = { ...current }; delete next[sceneNumber]; return next; });
    } catch (saveError) { setSampleErrors((current) => ({ ...current, [sceneNumber]: saveError instanceof Error ? saveError.message : "Could not save the cinematic score." })); }
    finally { setSavingSampleScene(null); }
  };

  const openPreview = async () => {
    if (!flow) return;
    // The standalone Guided preview restores only the authorized persisted
    // project. Waiting for this queued save prevents it from loading an older
    // snapshot while a Stage 4–7 edit is still in flight.
    if (!flow.projectId || !flow.draftId || !flow.script) {
      setError("Save this Guided project before opening the preview.");
      return;
    }
    const returnStage = flow.stage === "preview" ? (flow.returnStage ?? "preview") : flow.stage;
    const snapshot: VideoStudioFlowState = {
      ...flow,
      stage: "preview",
      returnStage,
      videoOutdated: false
    };
    setFlow(snapshot);
    saveVideoStudioFlow(snapshot);
    const saved = await queueDatabaseSave(snapshot, true);
    if (!saved.success) {
      setError("Could not save the current project for preview. Your local work is still available; retry Save Changes before opening preview.");
      return;
    }
    router.push(`/video-preview?mode=guided&project=${encodeURIComponent(snapshot.projectId!)}`);
  };

  if (!flow) {
    const hydrationFailed = hydrationState === "failed";
    return (
      <ProtectedRoute>
        <div className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-xl">
            <div className="glass-panel rounded-[2rem] p-8 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-gold" />
              <h1 className="mt-4 font-[var(--font-heading)] text-3xl text-white">
                {hydrationFailed ? "Could not restore this project" : "Loading Video Studio"}
              </h1>
              {hydrationFailed ? <>
                <p role="alert" className="mt-3 text-sm leading-6 text-red-100">Your saved Guided project could not be restored. Nothing was changed or saved. Check that the database migration is applied, then retry.</p>
                <button type="button" onClick={() => setHydrationAttempt((attempt) => attempt + 1)} className="mt-5 rounded-full border border-starlight/30 bg-starlight/10 px-5 py-3 text-sm font-semibold text-starlight transition hover:bg-starlight/20">Retry restore</button>
              </> : <p className="mt-3 text-sm text-white/70">Restoring your authorized project without changing its saved stage.</p>}
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-midnight">
        <div className="relative">

          <section className="relative px-4 py-10 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">
              <div className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 backdrop-blur-sm">
                    <div className="h-2 w-2 rounded-full bg-cyan-400" />
                    Guided Video Studio
                  </div>
                  <div>
                    <h1 className="font-[var(--font-heading)] text-5xl font-bold text-white sm:text-6xl">
                      Cinematic
                      <span className="text-gold">
                        {" "}Story Engine
                      </span>
                    </h1>
                    <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
                      Create a cinematic story with AI, refine scenes and dialogue, generate voice, music, and preview your final video.
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl border border-gold/20 bg-gold/10 px-6 py-4 backdrop-blur-sm">
                  <div className="text-xs font-medium uppercase tracking-wider text-gold">Current Stage</div>
                  <div className="text-sm font-semibold text-white">
                    {VIDEO_STAGE_LABELS.find((stage) => stage.id === flow.stage)?.label}
                  </div>
                  <div className={`mt-1 text-xs ${saveState === "failed" ? "text-rose-300" : "text-white/60"}`}>
                    {saveState === "saving" ? "Saving changes…" : saveState === "saved" ? "Saved to project" : saveState === "failed" ? "Project save failed" : "Saved locally"}
                    {saveState === "failed" && failedSaveRef.current ? (
                      <button type="button" className="ml-2 underline" onClick={() => queueDatabaseSave(failedSaveRef.current!, true)}>Retry</button>
                    ) : null}
                  </div>
                </div>
              </div>

              <StageIndicator currentStage={flow.stage} />

              {error ? (
                <div role="alert" className="mb-6 flex gap-3 rounded-2xl border border-red-300 bg-red-50 p-5 text-sm leading-6 text-red-950 shadow-sm">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
                  <span>{error}</span>
                </div>
              ) : null}

              <Warnings flow={flow} />

              {flow.stage === "setup" ? (
          <SetupStage
                  flow={flow}
                  customGenreInput={customGenreInput}
                  customToneInput={customToneInput}
            onAddCustomGenre={addCustomGenre}
            onAddCustomTone={addCustomTone}
                  onContinue={() => setStage("storyIdea")}
                  onCustomGenreInputChange={setCustomGenreInput}
                  onCustomToneInputChange={setCustomToneInput}
                  onToggleGenre={toggleGenre}
                  onToggleTone={toggleTone}
                  onLanguageChange={(language) => {
                    const scriptIsStale = language !== flow.language && Boolean(flow.script);
                    updateFlow({
                      language,
                      scenesNeedRegeneration: flow.scenesNeedRegeneration || scriptIsStale,
                      voiceNeedsRegeneration: flow.voiceNeedsRegeneration || scriptIsStale || Boolean(flow.voiceResult),
                      videoOutdated: flow.videoOutdated || scriptIsStale,
                    });
                  }}
                />
              ) : null}

              {flow.stage === "storyIdea" ? (
                <StoryIdeaStage
                  flow={flow}
                  isGenerating={isGeneratingStory}
                  onBack={goToPreviousStage}
                  onGenerate={() => generateStory()}
                  onRoughIdeaChange={updateRoughIdea}
                />
              ) : null}

              {flow.stage === "storyReview" ? (
                <StoryReviewStage
                  flow={flow}
                  isGenerating={isGeneratingStory}
                  onAcceptedStoryChange={updateAcceptedStory}
                  onBack={goToPreviousStage}
                  onContinue={acceptStory}
                  onRegenerate={() => generateStory()}
                />
              ) : null}

              {flow.stage === "scenes" ? (
                <ScenesStage
                  editingKey={editingKey}
                  flow={flow}
                  generatingDialogueLineId={generatingDialogueLineId}
                  generatingDialogueScene={generatingDialogueScene}
                  isGenerating={isGeneratingStory}
                  totalDialogueLines={totalDialogueLines}
                  onAddDialogueLine={addDialogueLine}
                  onAddSceneCharacter={addSceneCharacter}
                  onAddScene={addScene}
                  onBack={goToPreviousStage}
                  onContinue={() => setStage("voice")}
                  onDeleteDialogueLine={deleteDialogueLine}
                  onDeleteScene={deleteScene}
                  onDialogueChange={updateDialogueLine}
                  onDialogueMetaChange={updateDialogueMeta}
                  onEditingChange={setEditingKey}
                  onGenerateAdditionalDialogue={generateAdditionalDialogue}
                  onGenerateDialogueForLine={generateDialogueForLine}
                  onRegenerate={regenerateScenes}
                  onSceneFieldChange={updateSceneField}
                  onTitleChange={updateFilmField}
                />
              ) : null}

              {flow.stage === "voice" ? (
                <VoiceStage
                  flow={flow}
                  isGenerating={isGeneratingVoice}
                  script={visibleScript}
                  totalDialogueLines={totalDialogueLines}
                  onBack={goToPreviousStage}
                  onContinue={() => setStage("images")}
                  onGenerate={generateVoice}
                  regeneratingDialogueId={regeneratingDialogueAudioId}
                  onRegenerateDialogue={regenerateDialogueAudio}
                />
              ) : null}

              {flow.stage === "images" ? (
                <ImageStage
                  flow={flow}
                  isGenerating={isGeneratingImages}
                  onBack={goToPreviousStage}
                  onContinue={() => setStage("music")}
                  onGenerate={() => generateSceneImages(false)}
                  onRegenerateAll={regenerateAllImages}
                  onRegenerateScene={regenerateSceneImage}
                  onVisualDirectionChange={updateSceneVisualDirection}
                />
              ) : null}

              {flow.stage === "music" ? (
                <MusicStage
                  flow={flow}
                  isGenerating={isGeneratingMusic}
                  batchProgress={musicBatchProgress}
                  onBack={goToPreviousStage}
                  onGenerateAll={() => void generateAllMusic()}
                  sampleScores={sampleScores}
                  sampleErrors={sampleErrors}
                  generatingSampleScene={generatingSampleScene}
                  savingSampleScene={savingSampleScene}
                  samplePreviewRefs={samplePreviewRefs}
                  onGenerateSample={generateSampleScore}
                  onPreviewSample={previewSampleScore}
                  onSaveSample={saveSampleScore}
                  onPreview={openPreview}
                />
              ) : null}

              {flow.stage === "preview" ? (
                <PreviewShortcutStage
                  flow={flow}
                  finalSaveFeedback={finalSaveFeedback}
                  hasSavedProject={Boolean(flow.projectId && flow.draftId)}
                  onPreviousStep={goToPreviousStage}
                  onPreview={openPreview}
                  onSave={savePreviewProject}
                />
              ) : null}
            </div>
          </section>
        </div>
      </div>
      {/* Floating Action Bar */}
      {(() => {
        let isReady = false;
        let label = "";
        let sublabel = "";
        let action = () => {};
        let actionLabel = "";

        if (flow.stage === "voice" && flow.voiceResult && !flow.voiceNeedsRegeneration) {
          isReady = true;
          label = "Voices Ready";
          sublabel = "Narration and dialogue audio are ready. Next: prepare visuals.";
          action = () => setStage("music");
          actionLabel = "Continue to Music";
        } else if (flow.stage === "music" && flow.music.status === "ready") {
          isReady = true;
          label = "Music Ready";
          sublabel = "Scene-aware music decisions are saved. Next: review the preview.";
          action = openPreview;
          actionLabel = "Continue to Video";
        }

        if (!isReady) return null;

        return (
          <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-6 rounded-full border border-cyan-500/30 bg-black/60 px-8 py-4 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500/20 text-cyan-400">
                  <Check className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-cyan-400">{label}</p>
                  <p className="text-[10px] text-white/90">{sublabel}</p>
                </div>
              </div>
              <button
                onClick={action}
                className="rounded-full bg-cyan-500 px-6 py-2 text-xs font-black uppercase tracking-tighter text-white transition hover:scale-105 active:scale-95"
              >
                {actionLabel}
              </button>
            </div>
          </div>
        );
      })()}
    </ProtectedRoute>
  );
}

function StageIndicator({ currentStage }: { currentStage: VideoStudioStage }) {
  const currentIndex = VIDEO_STAGE_LABELS.findIndex((stage) => stage.id === currentStage);
  const nextStage = VIDEO_STAGE_LABELS[currentIndex + 1];

  return (
    <div className="mb-8">
      <p className="mb-3 text-sm text-white/70" aria-live="polite">
        You are in <span className="font-semibold text-white">Step {currentIndex + 1}: {VIDEO_STAGE_LABELS[currentIndex]?.label}</span>
        {nextStage ? <>. Next: {nextStage.label}.</> : <>. Review your saved preview or return to any earlier stage.</>}
      </p>
      <div className="grid gap-2 md:grid-cols-4 xl:grid-cols-7">
      {VIDEO_STAGE_LABELS.map((stage, index) => {
        const isCurrent = stage.id === currentStage;
        const isPast = index < currentIndex;

        return (
          <div
            key={stage.id}
            aria-current={isCurrent ? "step" : undefined}
            className={`rounded-[1rem] border px-3 py-3 text-sm transition ${
              isCurrent
                ? "border-cyan-400/45 bg-cyan-400/15 text-cyan-100"
                : isPast
                  ? "border-gold/20 bg-white/5 text-white/70"
                  : "border-white/10 bg-white/5 text-white/85"
            }`}
          >
            <p className="text-xs uppercase tracking-[0.18em]">Step {index + 1}</p>
            <p className="mt-1 font-semibold">{stage.label}</p>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function Warnings({ flow }: { flow: VideoStudioFlowState }) {
  const warnings = [
    flow.scenesNeedRegeneration
      ? "Story/setup changed after scenes were generated. Regenerate scenes and dialogues when ready."
      : null,
    flow.voiceNeedsRegeneration
      ? "Dialogues changed. Please regenerate voice audio."
      : null,
    flow.videoOutdated && flow.stage !== "preview"
      ? "Preview may be outdated until you open it again after the latest changes."
      : null
  ].filter(Boolean) as string[];

  if (warnings.length === 0) return null;

  return (
    <div className="mb-6 space-y-2">
      {warnings.map((warning) => (
        <div
          key={warning}
          role="status"
          className="rounded-[1rem] border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-950 shadow-sm"
        >
          {warning}
        </div>
      ))}
    </div>
  );
}

function SetupStage({
  flow,
  customGenreInput,
  customToneInput,
  onAddCustomGenre,
  onAddCustomTone,
  onContinue,
  onCustomGenreInputChange,
  onCustomToneInputChange,
  onToggleGenre,
  onToggleTone,
  onLanguageChange
}: {
  flow: VideoStudioFlowState;
  customGenreInput: string;
  customToneInput: string;
  onAddCustomGenre: () => void;
  onAddCustomTone: () => void;
  onContinue: () => void;
  onCustomGenreInputChange: (value: string) => void;
  onCustomToneInputChange: (value: string) => void;
  onToggleGenre: (value: string) => void;
  onToggleTone: (value: string) => void;
  onLanguageChange: (language: VideoLanguage) => void;
}) {
  return (
    <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-3xl border border-slate-700/50 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl">
        <SectionHeader
          icon={<Clapperboard className="h-7 w-7 text-white" />}
          label="Stage 1"
          title="Setup"
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <PaletteGroup
            activeItems={flow.genres}
            color="cyan"
            customInput={customGenreInput}
            customPlaceholder="Write a custom genre"
            label="Genre Palette"
            options={DEFAULT_VIDEO_GENRES}
            onAddCustom={onAddCustomGenre}
            onCustomInputChange={onCustomGenreInputChange}
            onToggle={onToggleGenre}
          />
          <PaletteGroup
            activeItems={flow.tones}
            color="purple"
            customInput={customToneInput}
            customPlaceholder="Write a custom tone"
            label="Emotional Palette"
            options={DEFAULT_VIDEO_TONES}
            onAddCustom={onAddCustomTone}
            onCustomInputChange={onCustomToneInputChange}
            onToggle={onToggleTone}
          />
        </div>

        <label className="mt-6 block">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">
            Language
          </span>
          <select
            value={flow.language}
            onChange={(event) => onLanguageChange(event.target.value as VideoLanguage)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-cyan-400/60"
          >
            <option value="en">English</option>
            <option value="ur">اردو</option>
          </select>
        </label>

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm leading-7 text-white/70">
          Scenes are now built dynamically. Start with an AI-generated draft, then add, remove, and edit scenes until the story naturally ends.
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-8 w-full rounded-2xl bg-blue-500 px-8 py-5 text-sm font-bold text-white transition hover:bg-blue-400"
        >
          Continue to Story Idea
        </button>
      </section>

      <InfoPanel
        title="What this stage saves"
        text="Genre, tone, and language stay saved as your base palette. You can still change genre, tone, cast, voice, and dialogue inside each scene later."
      />
    </div>
  );
}

function StoryIdeaStage({
  flow,
  isGenerating,
  onBack,
  onGenerate,
  onRoughIdeaChange
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
  onRoughIdeaChange: (value: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-slate-700/50 bg-slate-900/50 p-8 shadow-2xl backdrop-blur-xl">
      <SectionHeader
        icon={<Wand2 className="h-7 w-7 text-white" />}
        label="Stage 2"
        title="Rough Story Idea"
      />
      <label className="mb-3 block text-sm font-semibold text-slate-200">
        Rough story idea
      </label>
      <textarea
        value={flow.roughIdea}
        onChange={(event) => onRoughIdeaChange(event.target.value)}
        dir={textDirectionForVideoLanguage(flow.language)}
        placeholder="Describe your rough story concept, characters, world, conflict, and ending..."
        className="min-h-56 w-full resize-y rounded-2xl border border-slate-600/50 bg-slate-800/50 px-6 py-5 text-sm leading-7 text-white outline-none backdrop-blur-sm transition placeholder:text-slate-400 focus:border-cyan-400/50 focus:ring-2 focus:ring-cyan-400/20"
      />
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <SecondaryButton onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to Setup
        </SecondaryButton>
        <PrimaryButton disabled={isGenerating} onClick={onGenerate}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Generate Story with AI
        </PrimaryButton>
      </div>
    </section>
  );
}

function StoryReviewStage({
  flow,
  isGenerating,
  onAcceptedStoryChange,
  onBack,
  onContinue,
  onRegenerate
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  onAcceptedStoryChange: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onRegenerate: () => void;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <SectionHeader
        icon={<Sparkles className="h-7 w-7 text-white" />}
        label="Stage 3"
        title="Generated Story Review"
      />
      <label className="mb-3 block text-sm font-semibold text-white">
        Accept or edit the Gemini-generated story
      </label>
      <textarea
        value={flow.acceptedStory}
        onChange={(event) => onAcceptedStoryChange(event.target.value)}
        dir={textDirectionForVideoLanguage(flow.language)}
        className={`min-h-[28rem] w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-sm leading-7 text-white outline-none focus:border-gold/35 ${flow.language === "ur" ? "text-right" : ""}`}
      />
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <SecondaryButton onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back to Story Idea
        </SecondaryButton>
        <SecondaryButton disabled={isGenerating} onClick={onRegenerate}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Regenerate Story
        </SecondaryButton>
        <PrimaryButton onClick={onContinue}>
          <Check className="h-4 w-4" />
          Accept Story / Continue to Scenes
        </PrimaryButton>
      </div>
    </section>
  );
}

function ScenesStage({
  editingKey,
  flow,
  generatingDialogueLineId,
  generatingDialogueScene,
  isGenerating,
  totalDialogueLines,
  onAddDialogueLine,
  onAddSceneCharacter,
  onAddScene,
  onBack,
  onContinue,
  onDeleteDialogueLine,
  onDeleteScene,
  onDialogueChange,
  onDialogueMetaChange,
  onEditingChange,
  onGenerateAdditionalDialogue,
  onGenerateDialogueForLine,
  onRegenerate,
  onSceneFieldChange,
  onTitleChange
}: {
  editingKey: string | null;
  flow: VideoStudioFlowState;
  generatingDialogueLineId: string | null;
  generatingDialogueScene: number | null;
  isGenerating: boolean;
  totalDialogueLines: number;
  onAddDialogueLine: (sceneNumber: number, characterName?: string, line?: string) => void;
  onAddSceneCharacter: (sceneNumber: number, characterName: string) => void;
  onAddScene: () => void;
  onBack: () => void;
  onContinue: () => void;
  onDeleteDialogueLine: (sceneNumber: number, dialogueId: string) => void;
  onDeleteScene: (sceneNumber: number) => void;
  onDialogueChange: (sceneNumber: number, dialogueId: string, value: string) => void;
  onDialogueMetaChange: (
    sceneNumber: number,
    dialogueId: string,
    partial: Partial<Pick<MovieDialogueLine, "character" | "delivery">> & {
      voiceProfile?: Partial<MovieDialogueLine["voiceProfile"]>;
    }
  ) => void;
  onEditingChange: (key: string | null) => void;
  onGenerateAdditionalDialogue: (sceneNumber: number) => void;
  onGenerateDialogueForLine: (sceneNumber: number, dialogueId: string) => void;
  onRegenerate: () => void;
  onSceneFieldChange: (sceneNumber: number, field: EditableSceneField, value: string) => void;
  onTitleChange: (field: "logline" | "title", value: string) => void;
}) {
  const script = flow.script;
  const rtl = flow.language === "ur";

  if (!script) {
    return (
      <InfoPanel
        title="No generated scenes yet"
        text="Go back to Story Idea and generate a story before reviewing scenes and dialogues."
      />
    );
  }

  return (
    <section className="space-y-5">
      <div className="glass-panel rounded-[2rem] p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-starlight/80">
              Stage 4: Scenes and Dialogues
            </p>
            <EditableBlock
              editKey="film-title"
              editingKey={editingKey}
              label="Movie Title"
              singleLine
              text={script.title}
              rtl={rtl}
              onChange={(value) => onTitleChange("title", value)}
              onEditingChange={onEditingChange}
            />
            <EditableBlock
              editKey="film-logline"
              editingKey={editingKey}
              label="Logline"
              text={script.logline}
              rtl={rtl}
              onChange={(value) => onTitleChange("logline", value)}
              onEditingChange={onEditingChange}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Stat label="Scenes" value={String(script.scenes.length)} />
            <Stat label="Runtime" value={script.estimatedRuntime} />
            <Stat label="Dialogue" value={String(totalDialogueLines)} />
            <Stat label="Cast" value={String(script.characterVoices.length)} />
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <SecondaryButton onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Story Review
          </SecondaryButton>
          <SecondaryButton disabled={isGenerating} onClick={onRegenerate}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Regenerate Scenes & Dialogues
          </SecondaryButton>
          <PrimaryButton onClick={onContinue}>
            <Mic2 className="h-4 w-4" />
            Continue to Audio Generation
          </PrimaryButton>
        </div>
      </div>

      {script.scenes.map((scene) => (
        <SceneCard
          key={`${script.id}-${scene.sceneNumber}`}
          editingKey={editingKey}
          generatingDialogueLineId={generatingDialogueLineId}
          generatingDialogueScene={generatingDialogueScene}
          scene={scene}
          rtl={rtl}
          onAddDialogueLine={onAddDialogueLine}
          onAddSceneCharacter={onAddSceneCharacter}
          onDeleteDialogueLine={onDeleteDialogueLine}
          onDeleteScene={onDeleteScene}
          onDialogueChange={onDialogueChange}
          onDialogueMetaChange={onDialogueMetaChange}
          onEditingChange={onEditingChange}
          onGenerateAdditionalDialogue={onGenerateAdditionalDialogue}
          onGenerateDialogueForLine={onGenerateDialogueForLine}
          onSceneFieldChange={onSceneFieldChange}
        />
      ))}
      <button
        type="button"
        onClick={onAddScene}
        className="w-full rounded-[1.4rem] border border-starlight/20 bg-starlight/10 px-5 py-4 text-sm font-semibold text-starlight transition hover:bg-starlight/15"
      >
        <Plus className="mr-2 inline h-4 w-4" />
        Add Next Scene
      </button>
    </section>
  );
}

function VoiceStage({
  flow,
  isGenerating,
  script,
  totalDialogueLines,
  onBack,
  onContinue,
  onGenerate,
  regeneratingDialogueId,
  onRegenerateDialogue
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  script: VideoGenerationResponse | null;
  totalDialogueLines: number;
  onBack: () => void;
  onContinue: () => void;
  onGenerate: () => void;
  regeneratingDialogueId: string | null;
  onRegenerateDialogue: (sceneNumber: number, dialogueId: string) => void;
}) {
  const audioSummary = summarizeVideoAudio(script?.scenes ?? []);
  const audioStatus = videoAudioStatus(audioSummary, flow.voiceNeedsRegeneration);
  const languageMismatch = Boolean(script && !isCurrentVideoScriptLanguage(flow.scriptLanguage, flow.language));

  return (
    <section className="space-y-6">
      <div className="glass-panel rounded-[2rem] p-6">
        <SectionHeader
          icon={<Mic2 className="h-7 w-7 text-white" />}
          label="Stage 5"
          title="Voice Audio"
        />
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Dialogue lines" value={String(audioSummary.dialogueLines)} />
          <Stat label="Dialogue clips" value={String(audioSummary.dialogueClips)} />
          <Stat label="Narration clips" value={`${audioSummary.narrationClips}/${audioSummary.narrationRequired}`} />
          <Stat label="Audio status" value={audioStatus} />
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <SecondaryButton onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Edit Dialogues
          </SecondaryButton>
          <PrimaryButton disabled={!script || isGenerating || languageMismatch} onClick={onGenerate}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
            Generate Voice
          </PrimaryButton>
          <SecondaryButton disabled={!script || isGenerating || languageMismatch} onClick={onGenerate}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Regenerate Voice
          </SecondaryButton>
          <PrimaryButton
            disabled={!script || isGenerating || !flow.voiceResult || flow.voiceNeedsRegeneration}
            onClick={onContinue}
          >
            <ImageIcon className="h-4 w-4" />
            Continue to Visuals
          </PrimaryButton>
          {languageMismatch ? (
            <p className="col-span-full mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 italic">
              Language changed after this script was generated. Regenerate scenes and dialogues before voice synthesis; existing saved media remains intact.
            </p>
          ) : !flow.voiceResult && !isGenerating && (
            <p className="col-span-full mt-2 text-center text-xs text-white/75 italic">
              Please generate voice audio to unlock visual generation.
            </p>
          )}
        </div>
      </div>

      {script?.scenes.map((scene) => (
          <VoiceSceneCard
          key={`${script.id}-${scene.sceneNumber}`}
          scene={scene}
            rtl={flow.language === "ur"}
          regeneratingDialogueId={regeneratingDialogueId}
          onRegenerateDialogue={onRegenerateDialogue}
        />
      ))}
    </section>
  );
}

function ImageStage({
  flow,
  isGenerating,
  onBack,
  onGenerate,
  onRegenerateAll,
  onRegenerateScene,
  onVisualDirectionChange,
  onContinue
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
  onRegenerateAll: () => void;
  onRegenerateScene: (persistenceSceneId: string | undefined) => void;
  onVisualDirectionChange: (sceneNumber: number, direction: NonNullable<MovieScene["visualDirection"]>) => void;
  onContinue: () => void;
}) {
  const allGenerated = flow.script?.scenes.every((scene) => hasUsableMediaReference(scene.generatedImageUrl) && !scene.generatedImageOutdated);
  const anyImages = flow.script?.scenes.some((scene) => hasUsableMediaReference(scene.generatedImageUrl));

  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <SectionHeader
        icon={<ImageIcon className="h-7 w-7 text-white" />}
        label="Stage 6"
        title="Visual Image Generation"
      />
      <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-5">
        <p className="text-xs uppercase tracking-[0.26em] text-white/75">Visual Status</p>
        <h3 className="mt-2 text-xl font-semibold capitalize text-white">{flow.images?.status || "idle"}</h3>
        <p className="mt-3 text-sm leading-7 text-white/90">{flow.images?.message || "Generate AI visual artwork for each scene."}</p>

        {flow.script?.scenes.map((scene) => (
          <div key={scene.sceneNumber} className="mt-4 border-t border-white/10 pt-4 flex flex-col gap-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-semibold text-white">Scene {scene.sceneNumber}: {scene.title}</p>
                <p className="text-xs text-white/70 italic mt-1">"{scene.imagePrompt || scene.visualPrompt || "Cinematic visual"}"</p>
                <VisualBriefSummary scene={scene} characters={flow.script?.characterVoices ?? []} onChange={(direction) => onVisualDirectionChange(scene.sceneNumber, direction)} />
              </div>
              <div className="flex items-center gap-2 text-xs">
                {(!scene.generatedImageStatus || scene.generatedImageStatus === "idle") && (
                  <><span className="h-2 w-2 rounded-full bg-gray-500"></span><span className="text-gray-400">Not generated</span></>
                )}
                {scene.generatedImageStatus === "generating" && (
                  <><Loader2 className="h-3 w-3 animate-spin text-amber-700" /><span className="text-amber-900">Generating...</span></>
                )}
                {scene.generatedImageStatus === "completed" && hasUsableMediaReference(scene.generatedImageUrl) && (
                  scene.generatedImageOutdated
                    ? <><RefreshCcw className="h-3 w-3 text-amber-700" /><span className="text-amber-900">Outdated — Regenerate recommended</span></>
                    : <><Check className="h-3 w-3 text-green-400" /><span className="text-green-400">Ready</span></>
                )}
                {scene.generatedImageStatus === "completed" && !hasUsableMediaReference(scene.generatedImageUrl) && (
                  <><X className="h-3 w-3 text-amber-700" /><span className="text-amber-900">Media reference missing</span></>
                )}
                {scene.generatedImageStatus === "failed" && (
                  <><X className="h-3 w-3 text-red-700" /><span className="text-red-800">Failed</span></>
                )}
              </div>
            </div>

            {scene.generatedImageUrl && (
              <div className="relative overflow-hidden rounded-xl border border-white/15 bg-black/40 h-52 w-full max-w-xl">
                <img src={scene.generatedImageUrl} alt={scene.title} className="h-full w-full object-cover" />
              </div>
            )}

            {hasUsableMediaReference(scene.generatedImageUrl) && (
              <button
                type="button"
                onClick={() => onRegenerateScene(scene.persistenceSceneId)}
                disabled={isGenerating}
                className="self-start text-xs font-medium text-starlight underline hover:text-white disabled:opacity-50"
              >
                Replace This Scene Image
              </button>
            )}

            {scene.generatedImageStatus === "failed" && (
              <div className="flex flex-col gap-2 mt-1">
                <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-900">{scene.generatedImageError}</p>
                <button
                  onClick={onGenerate}
                  disabled={isGenerating}
                  className="self-start text-xs font-medium text-red-800 underline hover:text-red-950"
                >
                  Retry Generation
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-stretch gap-3 [&>*]:flex-1 [&>*]:min-w-[200px] xl:[&>*]:min-w-[180px]">
        <SecondaryButton onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </SecondaryButton>
        <PrimaryButton disabled={isGenerating || allGenerated} onClick={onGenerate}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          {isGenerating ? "Generating Visuals…" : "Generate Visuals"}
        </PrimaryButton>
        <SecondaryButton disabled={isGenerating} onClick={onRegenerateAll}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Regenerate All Images
        </SecondaryButton>
        <PrimaryButton
          disabled={isGenerating}
          onClick={onContinue}
        >
          <Music2 className="h-4 w-4" />
          Continue to Music
        </PrimaryButton>
      </div>
    </section>
  );
}

function VisualBriefSummary({ scene, characters, onChange }: { scene: MovieScene; characters: VideoGenerationResponse["characterVoices"]; onChange?: (direction: NonNullable<MovieScene["visualDirection"]>) => void }) {
  const context = buildSceneVisualContext({
    scene: {
      id: scene.persistenceSceneId,
      title: scene.title,
      narration: scene.narration,
      imagePrompt: scene.imagePrompt,
      visualPrompt: scene.visualPrompt,
      directorNotes: scene.directorNotes,
      location: scene.location,
      mood: scene.mood,
      dialogueCharacterNames: scene.dialogues.map((dialogue) => dialogue.character),
      visualDirection: scene.visualDirection,
    },
    characters: characters.map((voice) => ({ id: voice.characterId, name: voice.character, appearance: voice.appearance, role: voice.archetype, personalityTone: voice.tone })),
  });
  const { brief } = context;
  return (
    <details className="mt-3 max-w-xl rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/80">
      <summary className="cursor-pointer font-medium text-starlight">Review visual brief before generating</summary>
      <p className="mt-2"><span className="font-semibold text-white">Required:</span> {brief.requiredVisualEvents.join(" ") || "No visual event authored."}</p>
      <p className="mt-1"><span className="font-semibold text-white">Setting:</span> {brief.primaryLocation} ({brief.interiorOrExterior})</p>
      <p className="mt-1"><span className="font-semibold text-white">Characters:</span> {brief.presentCharacterNames.join(", ") || "None identified"}</p>
      {brief.visibleCharacterActions.length > 0 && <p className="mt-1"><span className="font-semibold text-white">Actions:</span> {brief.visibleCharacterActions.join(" ")}</p>}
      {brief.warnings.map((warning) => <p key={warning} role="alert" className="mt-2 rounded border border-amber-300/50 bg-amber-100/10 p-2 font-medium text-amber-100">{warning}</p>)}
      {onChange && <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input aria-label="Primary visual location" defaultValue={scene.visualDirection?.primaryLocation ?? brief.primaryLocation} onBlur={(event) => onChange({ ...scene.visualDirection, primaryLocation: event.target.value })} className="rounded border border-white/15 bg-black/30 px-2 py-1 text-white" placeholder="Primary visual location" />
        <input aria-label="Required visual event" defaultValue={scene.visualDirection?.requiredEvent ?? brief.requiredVisualEvents.join(" ")} onBlur={(event) => onChange({ ...scene.visualDirection, requiredEvent: event.target.value })} className="rounded border border-white/15 bg-black/30 px-2 py-1 text-white" placeholder="Required visual event" />
        <input aria-label="Camera and composition" defaultValue={scene.visualDirection?.composition ?? brief.compositionAndCamera} onBlur={(event) => onChange({ ...scene.visualDirection, composition: event.target.value })} className="rounded border border-white/15 bg-black/30 px-2 py-1 text-white sm:col-span-2" placeholder="Camera and composition" />
        <div className="sm:col-span-2">Visible characters: {characters.map((character) => <label key={character.character} className="mr-3 inline-flex items-center gap-1"><input type="checkbox" defaultChecked={scene.visualDirection?.visibleCharacterIds ? scene.visualDirection.visibleCharacterIds.includes(character.characterId ?? "") : brief.presentCharacterNames.includes(character.character)} onChange={(event) => { const selected = new Set(scene.visualDirection?.visibleCharacterIds ?? brief.presentCharacterIds); event.target.checked ? selected.add(character.characterId ?? "") : selected.delete(character.characterId ?? ""); onChange({ ...scene.visualDirection, visibleCharacterIds: [...selected].filter(Boolean) }); }} />{character.character}</label>)}</div>
      </div>}
    </details>
  );
}

function MusicStage({
  flow,
  isGenerating,
  batchProgress,
  onBack,
  onGenerateAll,
  sampleScores,
  sampleErrors,
  generatingSampleScene,
  savingSampleScene,
  samplePreviewRefs,
  onGenerateSample,
  onPreviewSample,
  onSaveSample,
  onPreview
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  batchProgress: MusicBatchProgress | null;
  onBack: () => void;
  onGenerateAll: () => void;
  sampleScores: Record<number, SampleScorePreview>;
  sampleErrors: Record<number, string>;
  generatingSampleScene: number | null;
  savingSampleScene: number | null;
  samplePreviewRefs: MutableRefObject<Record<number, HTMLAudioElement | null>>;
  onGenerateSample: (scene: MovieScene, category: "ambient" | "suspense" | "emotional" | "action" | "hopeful", regenerate?: boolean) => Promise<void>;
  onPreviewSample: (sceneNumber: number) => Promise<void>;
  onSaveSample: (sceneNumber: number) => Promise<void>;
  onPreview: () => void;
}) {
  const anyTracks = flow.script?.scenes.some((scene) => hasUsableMediaReference(scene.backgroundMusicUrl));
  const musicSummary = summarizeVideoMusic(flow.script?.scenes ?? []);
  const musicAvailability = videoMusicStatus(musicSummary);
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <SectionHeader
        icon={<Music2 className="h-7 w-7 text-white" />}
        label="Stage 7"
        title="Background Music"
      />
      <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-5">
        <p className="text-xs uppercase tracking-[0.26em] text-white/75">Music availability</p>
        <h3 className="mt-2 text-xl font-semibold text-white">{musicAvailability}</h3>
        <p className="mt-3 text-sm leading-7 text-white/90">
          {musicSummary.availableTracks > 0
            ? `${musicSummary.availableTracks} playable track${musicSummary.availableTracks === 1 ? " is" : "s are"} saved for this project.`
            : "Music is optional. Scenes with intentional silence can continue without a saved track."}
        </p>
        
        {flow.script?.scenes.map((scene, index) => {
          const previous = flow.script?.scenes[index - 1];
          const persistedDecision = flow.musicDecisions[String(scene.sceneNumber)];
          const effectiveDecision = persistedDecision?.outcome === "silence"
            ? { outcome: "silence" as const, reason: persistedDecision.reason }
            : persistedDecision?.category
              ? { outcome: "music" as const, category: persistedDecision.category, reason: persistedDecision.reason, reusePreviousTrack: false }
              : undefined;
          const sceneDecision = effectiveDecision ?? decideSceneMusic({
            sceneTitle: scene.title,
            mood: scene.mood,
            sceneTone: scene.sceneTone,
            soundDesign: scene.soundDesign,
            dialogueCount: scene.dialogues.length,
            estimatedDuration: scene.estimatedDuration,
            previous: previous
              ? {
                  category: previous.backgroundMusicCategory,
                  trackId: previous.backgroundMusicTrackId,
                  wasSilent: previous.backgroundMusicStatus === "silent",
                }
              : undefined,
          });
          const samplePreview = sampleScores[scene.sceneNumber];
          const sampleBusy = generatingSampleScene === scene.sceneNumber || savingSampleScene === scene.sceneNumber;
          return (
          <div key={scene.sceneNumber} className="mt-4 border-t border-white/10 pt-4 flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-semibold text-white">Scene {scene.sceneNumber}: {scene.title}</p>
                <p className="text-xs text-white/70">Mood: {scene.backgroundMusicMood || scene.mood || "N/A"}</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {(!scene.backgroundMusicStatus || scene.backgroundMusicStatus === "idle") && (
                  <><span className="h-2 w-2 rounded-full bg-gray-500"></span><span className="text-gray-400">Not decided</span></>
                )}
                {scene.backgroundMusicStatus === "generating" && (
                  <><Loader2 className="h-3 w-3 animate-spin text-cyan-400" /><span className="text-cyan-400">Selecting...</span></>
                )}
                {scene.backgroundMusicStatus === "completed" && hasUsableMediaReference(scene.backgroundMusicUrl) && (
                  scene.backgroundMusicOutdated
                    ? <><RefreshCcw className="h-3 w-3 text-amber-700" /><span className="text-amber-900">Outdated — Regenerate recommended</span></>
                    : <><Check className="h-3 w-3 text-green-400" /><span className="text-green-400">Track available</span></>
                )}
                {scene.backgroundMusicStatus === "completed" && !hasUsableMediaReference(scene.backgroundMusicUrl) && (
                  <><X className="h-3 w-3 text-amber-700" /><span className="text-amber-900">Track reference missing</span></>
                )}
                {scene.backgroundMusicStatus === "silent" && (
                  <><span className="h-2 w-2 rounded-full bg-slate-400"></span><span className="text-slate-300">Intentional silence</span></>
                )}
                {scene.backgroundMusicStatus === "unavailable" && (
                  <><span className="h-2 w-2 rounded-full bg-amber-500"></span><span className="text-amber-900">Cinematic score not saved</span></>
                )}
                {scene.backgroundMusicStatus === "failed" && (
                  <><X className="h-3 w-3 text-red-700" /><span className="text-red-800">Failed</span></>
                )}
              </div>
            </div>
            
            {scene.backgroundMusicStatus === "failed" && (
              <div className="flex flex-col gap-2 mt-1">
                <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-xs font-medium text-red-900">{scene.backgroundMusicError}</p>
                <button
                  onClick={onGenerateAll}
                  disabled={isGenerating}
                  className="self-start text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded"
                >
                  Retry missing or failed scores
                </button>
              </div>
            )}

              <span className="text-xs text-white/55">Optional — scenes without a track remain silent.</span>
            {sceneDecision.outcome === "music" ? (
              <div className="rounded-lg border border-emerald-400/25 bg-emerald-950/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-100">Cinematic Score</p>
                    <p className="mt-1 text-xs text-white/70">Recorded CC0 piano, strings, glockenspiel, and timpani arranged in your browser. It is not neural AI music.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void onGenerateSample(scene, sceneDecision.category)} disabled={sampleBusy || isGenerating} className="rounded bg-emerald-400/15 px-2.5 py-1 text-xs text-emerald-100 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-50">
                      {generatingSampleScene === scene.sceneNumber ? "Generating…" : samplePreview ? "Generate New Score" : "Generate Cinematic Score"}
                    </button>
                    {hasUsableMediaReference(scene.backgroundMusicUrl) && !samplePreview ? <button type="button" onClick={() => void onGenerateSample(scene, sceneDecision.category, true)} disabled={sampleBusy || isGenerating} className="rounded bg-white/10 px-2.5 py-1 text-xs text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">Regenerate Saved Score</button> : null}
                    {samplePreview ? <button type="button" onClick={() => void onGenerateSample(scene, sceneDecision.category, true)} disabled={sampleBusy} className="rounded bg-white/10 px-2.5 py-1 text-xs text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">Regenerate</button> : null}
                  </div>
                </div>
                {samplePreview ? <div className="mt-3 flex flex-wrap items-center gap-2"><audio ref={(node) => { samplePreviewRefs.current[scene.sceneNumber] = node; }} controls src={samplePreview.url} className="h-8 min-w-56 flex-1" /><button type="button" onClick={() => void onPreviewSample(scene.sceneNumber)} disabled={sampleBusy} className="rounded bg-white/10 px-2.5 py-1 text-xs text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50">Preview Generated Score</button><button type="button" onClick={() => void onSaveSample(scene.sceneNumber)} disabled={sampleBusy} className="rounded bg-emerald-400/15 px-2.5 py-1 text-xs text-emerald-100 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-50">{savingSampleScene === scene.sceneNumber ? "Saving…" : "Save to Scene"}</button></div> : null}
                {sampleErrors[scene.sceneNumber] ? <p role="alert" className="mt-2 text-xs font-medium text-red-800">{sampleErrors[scene.sceneNumber]}</p> : null}
                {samplePreview && hasUsableMediaReference(scene.backgroundMusicUrl) ? <p className="mt-2 text-xs font-medium text-amber-900">Saving this preview will explicitly replace the existing score.</p> : null}
                <details className="mt-3 text-xs text-white/65"><summary className="cursor-pointer text-white/80">Sample credits and provenance</summary><p className="mt-2 leading-5">{SAMPLE_CREDITS.source} — {SAMPLE_CREDITS.license}. {SAMPLE_CREDITS.attribution}</p><a className="underline" href={SAMPLE_CREDITS.sourceUrl} target="_blank" rel="noreferrer">View source and license</a></details>
              </div>
            ) : null}

            {sceneDecision.outcome === "silence" ? (
              <p className="rounded bg-slate-900/30 px-3 py-2 text-xs text-slate-300">
                Intentional silence — no music required.
              </p>
            ) : null}

            {(scene.backgroundMusicStatus === "silent" || scene.backgroundMusicStatus === "unavailable") && scene.backgroundMusicReason ? (
              <p className="text-xs text-white/70">{scene.backgroundMusicReason}</p>
            ) : null}
            
            {hasUsableMediaReference(scene.backgroundMusicUrl) && (
              <audio controls src={scene.backgroundMusicUrl} className="w-full h-8 mt-1" />
            )}
          </div>
          );
        })}
      </div>

      {batchProgress ? (
        <div role="status" className="mt-4 rounded-xl border border-cyan-400/20 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-50">
          {isGenerating
            ? `Generating music ${batchProgress.current}/${batchProgress.total}${batchProgress.currentSceneNumber ? ` for Scene ${batchProgress.currentSceneNumber}` : ""}...`
            : `Music batch complete: ${Object.values(batchProgress.results).filter((result) => result === "saved").length} saved, ${Object.values(batchProgress.results).filter((result) => result === "skipped").length} existing kept, ${Object.values(batchProgress.results).filter((result) => result === "silent").length} intentional silence, ${Object.values(batchProgress.results).filter((result) => result === "failed").length} failed.`}
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-stretch gap-3 [&>*]:flex-1 [&>*]:min-w-[200px] xl:[&>*]:min-w-[180px]">
        <SecondaryButton onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </SecondaryButton>
        <PrimaryButton disabled={isGenerating} onClick={onGenerateAll}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4" />}
          Generate All Music
        </PrimaryButton>
        <div className="flex">
          <PreviewFinalAudioButton
            scenes={flow.script?.scenes || []}
          />
        </div>
        <PrimaryButton
          disabled={isGenerating}
          onClick={onPreview}
        >
          <Clapperboard className="h-4 w-4" />
          Preview Video
        </PrimaryButton>
        {!anyTracks && !isGenerating && (
          <p className="col-span-full mt-2 text-center text-xs text-white/75 italic">
            Preview remains available: intentional silence is a valid scene decision.
          </p>
        )}
      </div>
    </section>
  );
}

function PreviewShortcutStage({
  flow,
  finalSaveFeedback,
  hasSavedProject,
  onPreviousStep,
  onPreview,
  onSave,
}: {
  flow: VideoStudioFlowState;
  finalSaveFeedback: "idle" | "saving" | "saved" | "failed";
  hasSavedProject: boolean;
  onPreviousStep: () => void;
  onPreview: () => void;
  onSave: () => void;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <SectionHeader
        icon={<Clapperboard className="h-7 w-7 text-white" />}
        label="Stage 8"
        title="Video Preview"
      />
      <p className="text-sm leading-7 text-white/90">
        Preview data is saved for <span dir={textDirectionForVideoLanguage(flow.language)} className={flow.language === "ur" ? "inline-block text-right" : ""}>{flow.script?.title ?? "the current film"}</span>. Open the dedicated preview page or jump back to editing.
      </p>
      {finalSaveFeedback !== "idle" ? (
        <p role={finalSaveFeedback === "failed" ? "alert" : "status"} className={`mt-4 text-sm font-medium ${finalSaveFeedback === "failed" ? "text-rose-300" : finalSaveFeedback === "saved" ? "text-emerald-300" : "text-cyan-200"}`}>
          {finalSaveFeedback === "saving" ? "Saving project…" : finalSaveFeedback === "saved" ? "Project saved to My Projects." : "Project save failed. Your current work remains safely in this browser; try again."}
        </p>
      ) : null}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <SecondaryButton onClick={onPreviousStep}>
          <ArrowLeft className="h-4 w-4" />
          Previous Step
        </SecondaryButton>
        <SecondaryButton disabled={finalSaveFeedback === "saving"} onClick={onSave}>
          {finalSaveFeedback === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {hasSavedProject ? "Save Changes" : "Save to My Projects"}
        </SecondaryButton>
        <PrimaryButton onClick={onPreview}>
          <Clapperboard className="h-4 w-4" />
          Open Preview Page
        </PrimaryButton>
      </div>
    </section>
  );
}

function SectionHeader({
  icon,
  label,
  title
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
}) {
  return (
    <div className="mb-8 flex items-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500 shadow-lg">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">
          {label}
        </p>
        <h2 className="text-2xl font-bold text-white">{title}</h2>
      </div>
    </div>
  );
}

function InfoPanel({ title, text }: { title: string; text: string }) {
  return (
    <section className="glass-panel flex min-h-[24rem] items-center rounded-[2rem] p-8">
      <div>
        <Sparkles className="h-10 w-10 text-gold" />
        <h2 className="mt-5 font-[var(--font-heading)] text-3xl text-white">{title}</h2>
        <p className="mt-4 text-sm leading-7 text-white/90">{text}</p>
      </div>
    </section>
  );
}

function PaletteGroup({
  activeItems,
  color,
  customInput,
  customPlaceholder,
  label,
  options,
  onAddCustom,
  onCustomInputChange,
  onToggle
}: {
  activeItems: string[];
  color: "cyan" | "purple";
  customInput: string;
  customPlaceholder: string;
  label: string;
  options: string[];
  onAddCustom: () => void;
  onCustomInputChange: (value: string) => void;
  onToggle: (value: string) => void;
}) {
  const activeClass =
    color === "cyan"
      ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-200 shadow-lg shadow-cyan-500/20"
      : "border-purple-400/50 bg-purple-500/20 text-purple-200 shadow-lg shadow-purple-500/20";

  return (
    <div>
      <label className="mb-4 block text-sm font-semibold text-slate-200">{label}</label>
      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all duration-300 ${
              activeItems.includes(option)
                ? activeClass
                : "border-slate-600/50 bg-slate-800/30 text-slate-300 hover:border-slate-500/50 hover:bg-slate-700/50"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={customInput}
          onChange={(event) => onCustomInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddCustom();
            }
          }}
          placeholder={customPlaceholder}
          className="min-w-0 flex-1 rounded-xl border border-slate-600/50 bg-slate-950/40 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/50"
        />
        <button
          type="button"
          onClick={onAddCustom}
          className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function PrimaryButton({
  children,
  disabled = false,
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-4 text-sm font-bold text-white transition-all duration-300 hover:bg-blue-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale disabled:pointer-events-none disabled:shadow-none"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  disabled = false,
  onClick
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white/80 transition-all duration-300 hover:border-cyan-300/35 hover:bg-white/10 hover:text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale disabled:pointer-events-none"
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28 rounded-[1.1rem] border border-white/10 bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[0.2em] text-white/75">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function SceneCard({
  editingKey,
  generatingDialogueLineId,
  generatingDialogueScene,
  scene,
  rtl,
  onAddDialogueLine,
  onAddSceneCharacter,
  onDeleteDialogueLine,
  onDeleteScene,
  onDialogueChange,
  onDialogueMetaChange,
  onEditingChange,
  onGenerateAdditionalDialogue,
  onGenerateDialogueForLine,
  onSceneFieldChange
}: {
  editingKey: string | null;
  generatingDialogueLineId: string | null;
  generatingDialogueScene: number | null;
  scene: MovieScene;
  rtl: boolean;
  onAddDialogueLine: (sceneNumber: number, characterName?: string, line?: string) => void;
  onAddSceneCharacter: (sceneNumber: number, characterName: string) => void;
  onDeleteDialogueLine: (sceneNumber: number, dialogueId: string) => void;
  onDeleteScene: (sceneNumber: number) => void;
  onDialogueChange: (sceneNumber: number, dialogueId: string, value: string) => void;
  onDialogueMetaChange: (
    sceneNumber: number,
    dialogueId: string,
    partial: Partial<Pick<MovieDialogueLine, "character" | "delivery">> & {
      voiceProfile?: Partial<MovieDialogueLine["voiceProfile"]>;
    }
  ) => void;
  onEditingChange: (key: string | null) => void;
  onGenerateAdditionalDialogue: (sceneNumber: number) => void;
  onGenerateDialogueForLine: (sceneNumber: number, dialogueId: string) => void;
  onSceneFieldChange: (sceneNumber: number, field: EditableSceneField, value: string) => void;
}) {
  const priorMediaValidation = validateSceneMedia(scene, "authoring");
  return (
    <article className="glass-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-white/10 bg-white/[0.03] p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
            Scene {scene.sceneNumber}
          </span>
          <span className="rounded-full border border-starlight/20 bg-starlight/10 px-3 py-1 text-xs text-starlight">
            {scene.mood}
          </span>
          <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
            {scene.sceneGenre}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/90">
            {scene.sceneTone}
          </span>
        </div>
        <h3 dir={rtl ? "rtl" : undefined} className={`font-[var(--font-heading)] text-2xl text-white ${rtl ? "text-right" : ""}`}>{scene.title}</h3>
        <p className="mt-2 text-sm text-white/85">{scene.location}</p>
        {priorMediaValidation.issues.length > 0 ? (
          <div className="mt-4" aria-label={`Previously generated media for Scene ${scene.sceneNumber}`}>
            <p className="text-xs uppercase tracking-[0.2em] text-white/60">Previously generated media</p>
            <MediaValidationSummary status={priorMediaValidation.status} issues={priorMediaValidation.issues} />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => onDeleteScene(scene.sceneNumber)}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Remove Scene
        </button>
      </div>

      <div className="grid gap-5 p-6 lg:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <EditableBlock
              editKey={`scene-${scene.sceneNumber}-genre`}
              editingKey={editingKey}
              label="Scene Genre"
              singleLine
              text={scene.sceneGenre}
              onChange={(value) => onSceneFieldChange(scene.sceneNumber, "sceneGenre", value)}
              onEditingChange={onEditingChange}
            />
            <EditableBlock
              editKey={`scene-${scene.sceneNumber}-tone`}
              editingKey={editingKey}
              label="Scene Tone"
              singleLine
              text={scene.sceneTone}
              onChange={(value) => onSceneFieldChange(scene.sceneNumber, "sceneTone", value)}
              onEditingChange={onEditingChange}
            />
            <EditableBlock
              editKey={`scene-${scene.sceneNumber}-location`}
              editingKey={editingKey}
              label="Location"
              singleLine
              text={scene.location}
              onChange={(value) => onSceneFieldChange(scene.sceneNumber, "location", value)}
              onEditingChange={onEditingChange}
            />
            <EditableBlock
              editKey={`scene-${scene.sceneNumber}-mood`}
              editingKey={editingKey}
              label="Mood"
              singleLine
              text={scene.mood}
              onChange={(value) => onSceneFieldChange(scene.sceneNumber, "mood", value)}
              onEditingChange={onEditingChange}
            />
          </div>
          <EditableBlock
            editKey={`scene-${scene.sceneNumber}-narration`}
            editingKey={editingKey}
            label="Narration"
            text={scene.narration}
            rtl={rtl}
            onChange={(value) => onSceneFieldChange(scene.sceneNumber, "narration", value)}
            onEditingChange={onEditingChange}
          />
          <EditableBlock
            editKey={`scene-${scene.sceneNumber}-director`}
            editingKey={editingKey}
            label="Director Notes"
            text={scene.directorNotes}
            onChange={(value) => onSceneFieldChange(scene.sceneNumber, "directorNotes", value)}
            onEditingChange={onEditingChange}
          />
          <EditableBlock
            editKey={`scene-${scene.sceneNumber}-visual`}
            editingKey={editingKey}
            label="Visual Prompt"
            text={scene.visualPrompt}
            onChange={(value) => onSceneFieldChange(scene.sceneNumber, "visualPrompt", value)}
            onEditingChange={onEditingChange}
          />
          <EditableBlock
            editKey={`scene-${scene.sceneNumber}-image`}
            editingKey={editingKey}
            label="Image Prompt"
            text={scene.imagePrompt}
            onChange={(value) => onSceneFieldChange(scene.sceneNumber, "imagePrompt", value)}
            onEditingChange={onEditingChange}
          />
          <EditableBlock
            editKey={`scene-${scene.sceneNumber}-sound`}
            editingKey={editingKey}
            label="Sound Design"
            text={scene.soundDesign}
            onChange={(value) => onSceneFieldChange(scene.sceneNumber, "soundDesign", value)}
            onEditingChange={onEditingChange}
          />
        </div>

        <DialogueReview
          dialogues={scene.dialogues}
          rtl={rtl}
          editingKey={editingKey}
          generatingDialogueLineId={generatingDialogueLineId}
          isGenerating={generatingDialogueScene === scene.sceneNumber}
          sceneNumber={scene.sceneNumber}
          onAddDialogueLine={onAddDialogueLine}
          onAddSceneCharacter={onAddSceneCharacter}
          onDeleteDialogueLine={onDeleteDialogueLine}
          onDialogueChange={onDialogueChange}
          onDialogueMetaChange={onDialogueMetaChange}
          onEditingChange={onEditingChange}
          onGenerateAdditionalDialogue={onGenerateAdditionalDialogue}
          onGenerateDialogueForLine={onGenerateDialogueForLine}
        />
      </div>
    </article>
  );
}

function MediaValidationSummary({ status, issues }: { status: MediaValidationStatus; issues: string[] }) {
  const styles: Record<MediaValidationStatus, string> = {
    ready: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
    needs_attention: "border-amber-300 bg-amber-50 text-amber-950",
    unavailable: "border-slate-400/25 bg-slate-400/10 text-slate-200",
  };
  const label: Record<MediaValidationStatus, string> = {
    ready: "Ready",
    needs_attention: "Needs attention",
    unavailable: "Validation unavailable",
  };
  return <div className={`mt-3 rounded-xl border p-3 text-xs ${styles[status]}`}>
    <p className="font-semibold">Validation: {label[status]}</p>
    {issues.length > 0 ? <ul className="mt-2 list-disc space-y-1 pl-4 leading-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p className="mt-1 text-white/70">Saved references are structurally valid. Remote availability is unverified until playback or storage access is attempted.</p>}
    {status === "needs_attention" ? <p className="mt-2 text-amber-900">Use the existing Visuals, Voice, or Music controls to retry, generate, or import only the affected asset.</p> : null}
  </div>;
}

function DialogueReview({
  dialogues,
  rtl,
  editingKey,
  generatingDialogueLineId,
  isGenerating,
  sceneNumber,
  onAddDialogueLine,
  onAddSceneCharacter,
  onDeleteDialogueLine,
  onDialogueChange,
  onDialogueMetaChange,
  onEditingChange,
  onGenerateAdditionalDialogue,
  onGenerateDialogueForLine
}: {
  dialogues: MovieDialogueLine[];
  rtl: boolean;
  editingKey: string | null;
  generatingDialogueLineId: string | null;
  isGenerating: boolean;
  sceneNumber: number;
  onAddDialogueLine: (sceneNumber: number, characterName?: string, line?: string) => void;
  onAddSceneCharacter: (sceneNumber: number, characterName: string) => void;
  onDeleteDialogueLine: (sceneNumber: number, dialogueId: string) => void;
  onDialogueChange: (sceneNumber: number, dialogueId: string, value: string) => void;
  onDialogueMetaChange: (
    sceneNumber: number,
    dialogueId: string,
    partial: Partial<Pick<MovieDialogueLine, "character" | "delivery">> & {
      voiceProfile?: Partial<MovieDialogueLine["voiceProfile"]>;
    }
  ) => void;
  onEditingChange: (key: string | null) => void;
  onGenerateAdditionalDialogue: (sceneNumber: number) => void;
  onGenerateDialogueForLine: (sceneNumber: number, dialogueId: string) => void;
}) {
  const [newCharacterName, setNewCharacterName] = useState("");
  const characters = Array.from(new Set(dialogues.map((dialogue) => dialogue.character)));
  const addCharacter = () => {
    const cleanName = newCharacterName.trim();
    if (!cleanName) return;
    onAddSceneCharacter(sceneNumber, cleanName);
    setNewCharacterName("");
  };

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/20 p-4">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Mic2 className="h-4 w-4 text-gold" />
          <p className="text-xs uppercase tracking-[0.26em] text-white/75">Dialogue Review</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onAddDialogueLine(sceneNumber, characters[0])}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 transition hover:border-gold/25 hover:text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Line
          </button>
          <button
            type="button"
            disabled={isGenerating}
            onClick={() => onGenerateAdditionalDialogue(sceneNumber)}
            className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-2 text-xs font-semibold text-gold transition hover:bg-gold/15 disabled:opacity-60"
          >
            {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate More Lines
          </button>
        </div>
        <div className="flex flex-col gap-2 rounded-[1rem] border border-white/10 bg-white/5 p-3 sm:flex-row">
          <input
            dir={rtl ? "rtl" : undefined}
            value={newCharacterName}
            onChange={(event) => setNewCharacterName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCharacter();
              }
            }}
            placeholder="Add a new character to this scene"
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white outline-none placeholder:text-white/35"
          />
          <button
            type="button"
            onClick={addCharacter}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Character
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {dialogues.map((dialogue) => (
          <div key={dialogue.id} className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select
                dir={rtl ? "rtl" : undefined}
                value={dialogue.character}
                onChange={(event) =>
                  onDialogueMetaChange(sceneNumber, dialogue.id, {
                    character: event.target.value,
                    voiceProfile: { character: event.target.value }
                  })
                }
                className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold text-white outline-none"
              >
                {characters.map((character) => (
                  <option key={character} value={character}>{character}</option>
                ))}
              </select>
              <span className="rounded-full bg-starlight/10 px-2 py-0.5 text-xs text-starlight">
                {dialogue.delivery}
              </span>
              <select
                value={dialogue.voiceProfile.deepgramModel}
                onChange={(event) => {
                  const selectedVoice = VIDEO_VOICE_OPTIONS.find((voice) => voice.deepgramModel === event.target.value);
                  if (!selectedVoice) return;
                  onDialogueMetaChange(sceneNumber, dialogue.id, {
                    voiceProfile: {
                      deepgramModel: selectedVoice.deepgramModel,
                      description: selectedVoice.voiceName,
                      gender: selectedVoice.gender,
                      voiceName: selectedVoice.voiceName
                    }
                  });
                }}
                className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold outline-none"
              >
                {VIDEO_VOICE_OPTIONS.map((voice) => (
                  <option key={voice.deepgramModel} value={voice.deepgramModel}>{voice.voiceName}</option>
                ))}
              </select>
              <input
                value={dialogue.delivery}
                onChange={(event) => onDialogueMetaChange(sceneNumber, dialogue.id, { delivery: event.target.value })}
                placeholder="delivery"
                className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white outline-none"
              />
              <button
                type="button"
                onClick={() => onAddDialogueLine(sceneNumber, dialogue.character)}
                className="ml-auto rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/90 transition hover:border-gold/25 hover:text-white"
              >
                Add another
              </button>
              <button
                type="button"
                disabled={generatingDialogueLineId === dialogue.id}
                onClick={() => onGenerateDialogueForLine(sceneNumber, dialogue.id)}
                className="inline-flex items-center gap-1 rounded-full border border-gold/20 bg-gold/10 px-2 py-1 text-[11px] font-semibold text-gold transition hover:bg-gold/15 disabled:opacity-60"
              >
                {generatingDialogueLineId === dialogue.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                AI Line
              </button>
              <button
                type="button"
                onClick={() => onDeleteDialogueLine(sceneNumber, dialogue.id)}
                className="inline-flex items-center gap-1 rounded-full border border-red-400/20 px-2 py-1 text-[11px] font-semibold text-red-300 transition hover:bg-red-500/10"
              >
                <Trash2 className="h-3 w-3" />
                Remove
              </button>
            </div>
            <EditableBlock
              editKey={`scene-${sceneNumber}-dialogue-${dialogue.id}`}
              editingKey={editingKey}
              label="Dialogue Line"
              text={dialogue.line}
                rtl={rtl}
              onChange={(value) => onDialogueChange(sceneNumber, dialogue.id, value)}
              onEditingChange={onEditingChange}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceSceneCard({
  scene,
  rtl,
  regeneratingDialogueId,
  onRegenerateDialogue,
}: {
  scene: MovieScene;
  rtl: boolean;
  regeneratingDialogueId: string | null;
  onRegenerateDialogue: (sceneNumber: number, dialogueId: string) => void;
}) {
  return (
    <article className="glass-panel overflow-hidden rounded-[2rem]">
      <div className="border-b border-white/10 bg-white/[0.03] p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-xs text-gold">
              Scene {scene.sceneNumber}
            </span>
            <span className="rounded-full border border-starlight/20 bg-starlight/10 px-3 py-1 text-xs text-starlight">
              {scene.mood}
            </span>
          </div>
          <h3 dir={rtl ? "rtl" : undefined} className={`font-[var(--font-heading)] text-2xl text-white ${rtl ? "text-right" : ""}`}>{scene.title}</h3>
        </div>
        <PlaySceneAudioButton audioUrls={scene.dialogues.map(d => d.audioUrl || "")} />
      </div>
      <div className="grid gap-5 p-6 lg:grid-cols-2">
        {scene.dialogues.map((dialogue) => (
          <div key={dialogue.id} className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold text-white">{dialogue.character}</p>
            <p className="mt-1 text-xs text-starlight/90">
              Emotion-informed delivery: {resolveDialogueEmotion({ line: dialogue, scene }).emotion}
            </p>
            <p dir={rtl ? "rtl" : undefined} className={`mt-3 text-sm leading-7 text-white/72 ${rtl ? "text-right" : ""}`}>"{dialogue.line}"</p>
            {dialogue.audioUrl ? (
              <audio controls src={dialogue.audioUrl} className="mt-3 w-full" />
            ) : (
              <p className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/75">
                {dialogue.audioError ?? "Waiting for voice generation."}
              </p>
            )}
            {dialogue.audioOutdated ? <p className="mt-2 text-xs font-medium text-amber-900">Outdated — Regenerate recommended. The previous clip is retained until replacement succeeds.</p> : null}
            <button
              type="button"
              onClick={() => onRegenerateDialogue(scene.sceneNumber, dialogue.id)}
              disabled={Boolean(regeneratingDialogueId)}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-starlight/30 px-3 py-2 text-xs font-semibold text-starlight transition hover:bg-starlight/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {regeneratingDialogueId === dialogue.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
              Regenerate emotional delivery
            </button>
          </div>
        ))}
      </div>
    </article>
  );
}

function EditableBlock({
  editKey,
  editingKey,
  label,
  singleLine = false,
  text,
  rtl = false,
  onChange,
  onEditingChange
}: {
  editKey: string;
  editingKey: string | null;
  label: string;
  singleLine?: boolean;
  text: string;
  rtl?: boolean;
  onChange: (value: string) => void;
  onEditingChange: (key: string | null) => void;
}) {
  const isEditing = editingKey === editKey;

  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.24em] text-white/75">{label}</p>
        <button
          type="button"
          onClick={() => onEditingChange(isEditing ? null : editKey)}
          className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-white/10 bg-black/20 px-2 text-white/70 transition hover:border-gold/25 hover:text-white"
          aria-label={isEditing ? `Close ${label} editor` : `Edit ${label}`}
        >
          {isEditing ? <X className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
        </button>
      </div>

      {isEditing ? (
        <div>
          {singleLine ? (
            <input
              dir={rtl ? "rtl" : undefined}
              value={text}
              onChange={(event) => onChange(event.target.value)}
              className={`w-full rounded-[1rem] border border-cyan-400/25 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-gold/35 ${rtl ? "text-right" : ""}`}
            />
          ) : (
            <textarea
              dir={rtl ? "rtl" : undefined}
              value={text}
              onChange={(event) => onChange(event.target.value)}
              className={`min-h-32 w-full resize-y rounded-[1rem] border border-cyan-400/25 bg-black/30 px-4 py-3 text-sm leading-7 text-white outline-none focus:border-gold/35 ${rtl ? "text-right" : ""}`}
            />
          )}
          <button
            type="button"
            onClick={() => onEditingChange(null)}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200"
          >
            <Check className="h-4 w-4" />
            Done
          </button>
        </div>
      ) : (
        <p className={`text-sm text-white/72 ${singleLine ? "text-lg font-semibold" : "leading-7"}`}>
          {text}
        </p>
      )}
    </div>
  );
}
