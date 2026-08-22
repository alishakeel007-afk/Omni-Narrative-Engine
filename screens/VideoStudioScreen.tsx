"use client";

import { useEffect, useMemo, useState } from "react";
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
  saveVideoStudioFlow,
  type VideoStudioFlowState,
  type VideoStudioStage
} from "@/lib/video-storage";
import {
  createVideoStudioProject,
  loadVideoStudioFromDatabase,
  saveVideoStudioToDatabase
} from "@/lib/video-studio-db";
import type { MovieDialogueLine, MovieScene, VideoGenerationResponse } from "@/types/video";

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

const VIDEO_VOICE_OPTIONS = [
  { deepgramModel: "aura-orion-en", gender: "male", voiceName: "Orion - warm male" },
  { deepgramModel: "aura-asteria-en", gender: "female", voiceName: "Asteria - clear female" },
  { deepgramModel: "aura-athena-en", gender: "female", voiceName: "Athena - confident female" },
  { deepgramModel: "aura-arcas-en", gender: "male", voiceName: "Arcas - expressive male" },
  { deepgramModel: "aura-orpheus-en", gender: "male", voiceName: "Orpheus - narrator male" }
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
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [isGeneratingMusic, setIsGeneratingMusic] = useState(false);
  const [generatingDialogueScene, setGeneratingDialogueScene] = useState<number | null>(null);
  const [generatingDialogueLineId, setGeneratingDialogueLineId] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [customGenreInput, setCustomGenreInput] = useState("");
  const [customToneInput, setCustomToneInput] = useState("");

  useEffect(() => {
    const localFlow = loadVideoStudioFlow();
    setFlow(localFlow);

    if (localFlow.projectId) {
      loadVideoStudioFromDatabase(localFlow.projectId).then((dbFlow) => {
        if (dbFlow) {
          setFlow(dbFlow);
          saveVideoStudioFlow(dbFlow);
        }
      });
    }
  }, []);

  const visibleScript = flow?.voiceResult ?? flow?.script ?? null;
  const totalDialogueLines = useMemo(
    () => visibleScript?.scenes.reduce((total, scene) => total + scene.dialogues.length, 0) ?? 0,
    [visibleScript]
  );

  const persistFlow = (nextFlow: VideoStudioFlowState) => {
    setFlow(nextFlow);
    saveVideoStudioFlow(nextFlow);

    if (nextFlow.projectId && nextFlow.draftId && (nextFlow.script || nextFlow.voiceResult)) {
      saveVideoStudioToDatabase(nextFlow);
    }
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

    setIsGeneratingStory(true);
    setError("");
    setEditingKey(null);

    try {
      const response = await fetch("/api/video/generate", {
        body: JSON.stringify({
          genre: flow.genres,
          includeAudio: false,
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
        scene.sceneNumber === sceneNumber ? { ...scene, [field]: value } : scene
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
                dialogue.id === dialogueId ? { ...dialogue, line: value } : dialogue
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
              dialogues: scene.dialogues.map((dialogue) =>
                dialogue.id === dialogueId
                  ? {
                      ...dialogue,
                      ...partial,
                      audioUrl: undefined,
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
    const nextScenes = flow.script.scenes
      .filter((scene) => scene.sceneNumber !== sceneNumber)
      .map((scene, index) => ({ ...scene, sceneNumber: index + 1 }));

    persistFlow({
      ...flow,
      sceneCount: nextScenes.length,
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

    setIsGeneratingVoice(true);
    setError("");

    try {
      const response = await fetch("/api/video/tts", {
        body: JSON.stringify({ script: flow.script, projectId: flow.projectId }),
        headers: {
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Voice generation failed.");
      }

      const voiceResult = payload as VideoGenerationResponse;
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

  const generateSceneImages = async (forceRegenerateAll = false) => {
    if (!flow?.script || isGeneratingImages) return;

    setIsGeneratingImages(true);
    setError("");
    persistFlow({
      ...flow,
      images: {
        ...flow.images,
        message: "Generating AI visual artwork...",
        status: "generating"
      }
    });

    try {
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

      const updatedScenes = flow.script.scenes.map(scene => {
        if (forceRegenerateAll) {
          return {
            ...scene,
            generatedImageUrl: undefined,
            generatedImagePrompt: undefined,
            generatedImageHash: undefined,
            generatedImageStatus: "idle" as const,
            generatedImageError: undefined
          };
        }
        return { ...scene };
      });

      let errorsOccurred = false;

      await mapWithConcurrency(updatedScenes, 2, async (scene) => {
        if (scene.generatedImageStatus === "completed" || scene.generatedImageUrl) {
          return;
        }

        scene.generatedImageStatus = "generating";

        try {
          const sceneCharacterNames = Array.from(new Set(scene.dialogues.map((d) => d.character).filter(Boolean)));
          const sceneCharacterAppearances = sceneCharacterNames
            .map((name) => flow.script?.characterVoices.find((v) => v.character.toLowerCase() === name.toLowerCase())?.appearance)
            .filter((appearance): appearance is string => Boolean(appearance));

          const response = await fetch("/api/video/image", {
            body: JSON.stringify({
              sceneId: `scene-${scene.sceneNumber}`,
              imagePrompt: scene.imagePrompt || scene.visualPrompt || scene.title,
              visualPrompt: scene.visualPrompt,
              sceneTitle: scene.title,
              location: scene.location,
              mood: scene.mood,
              genres: flow.genres,
              existingHash: scene.generatedImageHash,
              characterNames: sceneCharacterNames,
              characterAppearances: sceneCharacterAppearances,
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
        } catch (err) {
          console.error(err);
          errorsOccurred = true;
          scene.generatedImageStatus = "failed";
          scene.generatedImageError = err instanceof Error ? err.message : "Image generation failed";
        }
      });

      const anyImages = updatedScenes.some(s => s.generatedImageStatus === "completed" || !!s.generatedImageUrl);

      persistFlow({
        ...flow,
        script: {
          ...flow.script,
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
        ...flow,
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

  const generateBackgroundMusic = async (forceRegenerateAll = false) => {
    if (!flow?.script || isGeneratingMusic) return;

    setIsGeneratingMusic(true);
    setError("");
    persistFlow({
      ...flow,
      music: {
        ...flow.music,
        message: "Generating scene-specific background music...",
        status: "generating"
      }
    });

    try {
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

      const updatedScenes = flow.script.scenes.map(scene => {
        if (forceRegenerateAll) {
          return {
            ...scene,
            backgroundMusicUrl: undefined,
            backgroundMusicTitle: undefined,
            backgroundMusicMood: undefined,
            backgroundMusicPrompt: undefined,
            backgroundMusicHash: undefined,
            backgroundMusicStatus: "idle" as const,
            backgroundMusicError: undefined
          };
        }
        return { ...scene };
      });

      let errorsOccurred = false;

      await mapWithConcurrency(updatedScenes, 2, async (scene) => {
        if (scene.backgroundMusicStatus === "completed" || scene.backgroundMusicUrl) {
          return;
        }

        scene.backgroundMusicStatus = "generating";

        try {
          const response = await fetch("/api/background-music", {
            body: JSON.stringify({
              mood: scene.mood || scene.sceneTone || flow.tones.join(", "),
              soundDesign: scene.soundDesign || "",
              sceneTitle: scene.title,
              sceneLocation: scene.location,
              narration: scene.narration,
              estimatedDuration: scene.estimatedDuration,
              genres: flow.genres,
              existingHash: scene.backgroundMusicHash,
              sceneId: `scene-${scene.sceneNumber}`,
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
            throw new Error(payload.error ?? `Failed to generate music for Scene ${scene.sceneNumber}.`);
          }

          scene.backgroundMusicUrl = payload.audioUrl;
          scene.backgroundMusicTitle = payload.title ?? `Scene ${scene.sceneNumber} Score`;
          scene.backgroundMusicMood = payload.mood ?? scene.mood;
          scene.backgroundMusicPrompt = payload.prompt;
          scene.backgroundMusicHash = payload.hash;
          scene.backgroundMusicStatus = "completed";
          scene.backgroundMusicError = undefined;
        } catch (err) {
          console.error(err);
          errorsOccurred = true;
          scene.backgroundMusicStatus = "failed";
          scene.backgroundMusicError = err instanceof Error ? err.message : "Generation failed";
        }
      });

      const anyTracks = updatedScenes.some(s => s.backgroundMusicStatus === "completed" || !!s.backgroundMusicUrl);

      persistFlow({
        ...flow,
        script: {
          ...flow.script,
          scenes: updatedScenes
        },
        music: {
          message: errorsOccurred 
            ? "Background music generation finished, but some scenes failed." 
            : "Background music is ready.",
          mood: updatedScenes[0]?.backgroundMusicMood ?? "ambient",
          status: anyTracks ? "ready" : "error",
          title: "Scene-Specific Background Score",
          trackUrl: updatedScenes[0]?.backgroundMusicUrl ?? "",
          provider: ""
        },
        videoOutdated: true
      });
    } catch (musicError) {
      persistFlow({
        ...flow,
        music: {
          ...flow.music,
          message:
            musicError instanceof Error
              ? musicError.message
              : "Background music generation failed.",
          status: "error"
        }
      });
    } finally {
      setIsGeneratingMusic(false);
    }
  };

  const regenerateAllMusic = () => {
    generateBackgroundMusic(true);
  };

  const openPreview = () => {
    if (!flow) return;
    persistFlow({
      ...flow,
      stage: "preview",
      videoOutdated: false
    });
    router.push("/video-preview?mode=guided");
  };

  if (!flow) {
    return (
      <ProtectedRoute>
        <div className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-xl">
            <div className="glass-panel rounded-[2rem] p-8 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-gold" />
              <h1 className="mt-4 font-[var(--font-heading)] text-3xl text-white">
                Loading Video Studio
              </h1>
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
                </div>
              </div>

              <StageIndicator currentStage={flow.stage} />

              {error ? (
                <div className="mb-6 flex gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 text-sm leading-6 text-red-200 backdrop-blur-sm">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
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
                />
              ) : null}

              {flow.stage === "storyIdea" ? (
                <StoryIdeaStage
                  flow={flow}
                  isGenerating={isGeneratingStory}
                  onBack={() => setStage("setup")}
                  onGenerate={() => generateStory()}
                  onRoughIdeaChange={updateRoughIdea}
                />
              ) : null}

              {flow.stage === "storyReview" ? (
                <StoryReviewStage
                  flow={flow}
                  isGenerating={isGeneratingStory}
                  onAcceptedStoryChange={updateAcceptedStory}
                  onBack={() => setStage("storyIdea")}
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
                  onBack={() => setStage("storyReview")}
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
                  onBack={() => setStage("scenes")}
                  onContinue={() => setStage("images")}
                  onGenerate={generateVoice}
                />
              ) : null}

              {flow.stage === "images" ? (
                <ImageStage
                  flow={flow}
                  isGenerating={isGeneratingImages}
                  onBack={() => setStage("voice")}
                  onContinue={() => setStage("music")}
                  onGenerate={() => generateSceneImages(false)}
                  onRegenerateAll={regenerateAllImages}
                />
              ) : null}

              {flow.stage === "music" ? (
                <MusicStage
                  flow={flow}
                  isGenerating={isGeneratingMusic}
                  onBack={() => setStage("images")}
                  onGenerate={() => generateBackgroundMusic(false)}
                  onRegenerateAll={regenerateAllMusic}
                  onPreview={openPreview}
                />
              ) : null}

              {flow.stage === "preview" ? (
                <PreviewShortcutStage
                  flow={flow}
                  onBackAudio={() => setStage("music")}
                  onBackDialogues={() => setStage("scenes")}
                  onPreview={openPreview}
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
          sublabel = "All character dialogues generated.";
          action = () => setStage("music");
          actionLabel = "Continue to Music";
        } else if (flow.stage === "music" && flow.music.status === "ready") {
          isReady = true;
          label = "Music Ready";
          sublabel = "Cinematic score generated.";
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

  return (
    <div className="mb-8 grid gap-2 md:grid-cols-4 xl:grid-cols-7">
      {VIDEO_STAGE_LABELS.map((stage, index) => {
        const isCurrent = stage.id === currentStage;
        const isPast = index < currentIndex;

        return (
          <div
            key={stage.id}
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
          className="rounded-[1rem] border border-gold/20 bg-gold/10 px-4 py-3 text-sm leading-6 text-gold"
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
  onToggleTone
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
        text="Genre and tone stay saved as your base palette. You can still change genre, tone, cast, voice, and dialogue inside each scene later."
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
        className="min-h-[28rem] w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-5 py-4 text-sm leading-7 text-white outline-none focus:border-gold/35"
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
              onChange={(value) => onTitleChange("title", value)}
              onEditingChange={onEditingChange}
            />
            <EditableBlock
              editKey="film-logline"
              editingKey={editingKey}
              label="Logline"
              text={script.logline}
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
  onGenerate
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  script: VideoGenerationResponse | null;
  totalDialogueLines: number;
  onBack: () => void;
  onContinue: () => void;
  onGenerate: () => void;
}) {
  const generatedCount = flow.voiceResult?.audio.generatedCount ?? 0;

  return (
    <section className="space-y-6">
      <div className="glass-panel rounded-[2rem] p-6">
        <SectionHeader
          icon={<Mic2 className="h-7 w-7 text-white" />}
          label="Stage 5"
          title="Voice Audio"
        />
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label="Dialogue" value={String(totalDialogueLines)} />
          <Stat label="Voiced" value={String(generatedCount)} />
          <Stat label="Provider" value="Deepgram" />
          <Stat label="Status" value={flow.voiceNeedsRegeneration ? "Needs regen" : flow.voiceResult ? "Ready" : "Idle"} />
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <SecondaryButton onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back to Edit Dialogues
          </SecondaryButton>
          <PrimaryButton disabled={!script || isGenerating} onClick={onGenerate}>
            {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic2 className="h-4 w-4" />}
            Generate Voice
          </PrimaryButton>
          <SecondaryButton disabled={!script || isGenerating} onClick={onGenerate}>
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
          {!flow.voiceResult && !isGenerating && (
            <p className="col-span-full mt-2 text-center text-xs text-white/75 italic">
              Please generate voice audio to unlock visual generation.
            </p>
          )}
        </div>
      </div>

      {script?.scenes.map((scene) => (
        <VoiceSceneCard key={`${script.id}-${scene.sceneNumber}`} scene={scene} />
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
  onContinue
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
  onRegenerateAll: () => void;
  onContinue: () => void;
}) {
  const allGenerated = flow.script?.scenes.every(s => s.generatedImageStatus === "completed" || !!s.generatedImageUrl);
  const anyImages = flow.script?.scenes.some(s => s.generatedImageStatus === "completed" || !!s.generatedImageUrl);

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
              </div>
              <div className="flex items-center gap-2 text-xs">
                {(!scene.generatedImageStatus || scene.generatedImageStatus === "idle") && (
                  <><span className="h-2 w-2 rounded-full bg-gray-500"></span><span className="text-gray-400">Not generated</span></>
                )}
                {scene.generatedImageStatus === "generating" && (
                  <><Loader2 className="h-3 w-3 animate-spin text-amber-400" /><span className="text-amber-400">Generating...</span></>
                )}
                {scene.generatedImageStatus === "completed" && (
                  <><Check className="h-3 w-3 text-green-400" /><span className="text-green-400">Completed</span></>
                )}
                {scene.generatedImageStatus === "failed" && (
                  <><X className="h-3 w-3 text-red-400" /><span className="text-red-400">Failed</span></>
                )}
              </div>
            </div>

            {scene.generatedImageUrl && (
              <div className="relative overflow-hidden rounded-xl border border-white/15 bg-black/40 h-52 w-full max-w-xl">
                <img src={scene.generatedImageUrl} alt={scene.title} className="h-full w-full object-cover" />
              </div>
            )}

            {scene.generatedImageStatus === "failed" && (
              <div className="flex flex-col gap-2 mt-1">
                <p className="text-xs text-red-300 bg-red-900/30 p-2 rounded">{scene.generatedImageError}</p>
                <button
                  onClick={onGenerate}
                  disabled={isGenerating}
                  className="self-start text-xs text-red-400 underline hover:text-red-300"
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
          Generate Missing Images
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

function MusicStage({
  flow,
  isGenerating,
  onBack,
  onGenerate,
  onRegenerateAll,
  onPreview
}: {
  flow: VideoStudioFlowState;
  isGenerating: boolean;
  onBack: () => void;
  onGenerate: () => void;
  onRegenerateAll: () => void;
  onPreview: () => void;
}) {
  const allGenerated = flow.script?.scenes.every(s => s.backgroundMusicStatus === "completed" || !!s.backgroundMusicUrl);
  const anyTracks = flow.script?.scenes.some(s => s.backgroundMusicStatus === "completed" || !!s.backgroundMusicUrl);

  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <SectionHeader
        icon={<Music2 className="h-7 w-7 text-white" />}
        label="Stage 6"
        title="Background Music"
      />
      <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-5">
        <p className="text-xs uppercase tracking-[0.26em] text-white/75">Music Status</p>
        <h3 className="mt-2 text-xl font-semibold capitalize text-white">{flow.music.status}</h3>
        <p className="mt-3 text-sm leading-7 text-white/90">{flow.music.message}</p>
        
        {flow.script?.scenes.map((scene) => (
          <div key={scene.sceneNumber} className="mt-4 border-t border-white/10 pt-4 flex flex-col gap-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-semibold text-white">Scene {scene.sceneNumber}: {scene.title}</p>
                <p className="text-xs text-white/70">Mood: {scene.backgroundMusicMood || scene.mood || "N/A"}</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                {(!scene.backgroundMusicStatus || scene.backgroundMusicStatus === "idle") && (
                  <><span className="h-2 w-2 rounded-full bg-gray-500"></span><span className="text-gray-400">Not generated</span></>
                )}
                {scene.backgroundMusicStatus === "generating" && (
                  <><Loader2 className="h-3 w-3 animate-spin text-cyan-400" /><span className="text-cyan-400">Generating...</span></>
                )}
                {scene.backgroundMusicStatus === "completed" && (
                  <><Check className="h-3 w-3 text-green-400" /><span className="text-green-400">Completed</span></>
                )}
                {scene.backgroundMusicStatus === "failed" && (
                  <><X className="h-3 w-3 text-red-400" /><span className="text-red-400">Failed</span></>
                )}
              </div>
            </div>
            
            {scene.backgroundMusicStatus === "failed" && (
              <div className="flex flex-col gap-2 mt-1">
                <p className="text-xs text-red-300 bg-red-900/30 p-2 rounded">{scene.backgroundMusicError}</p>
                <button
                  onClick={onGenerate}
                  disabled={isGenerating}
                  className="self-start text-xs bg-white/10 hover:bg-white/20 text-white px-3 py-1 rounded"
                >
                  Retry
                </button>
              </div>
            )}
            
            {(scene.backgroundMusicStatus === "completed" || scene.backgroundMusicUrl) && (
              <audio controls src={scene.backgroundMusicUrl} className="w-full h-8 mt-1" />
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
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music2 className="h-4 w-4" />}
          Generate Missing Music
        </PrimaryButton>
        <SecondaryButton disabled={isGenerating} onClick={onRegenerateAll}>
          {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Regenerate All Music
        </SecondaryButton>
        <div className="flex">
          <PreviewFinalAudioButton
            scenes={flow.script?.scenes || []}
          />
        </div>
        <PrimaryButton
          disabled={!anyTracks || isGenerating}
          onClick={onPreview}
        >
          <Clapperboard className="h-4 w-4" />
          Preview Video
        </PrimaryButton>
        {!anyTracks && !isGenerating && (
          <p className="col-span-full mt-2 text-center text-xs text-white/75 italic">
            Complete background music to unlock final video preview.
          </p>
        )}
      </div>
    </section>
  );
}

function PreviewShortcutStage({
  flow,
  onBackAudio,
  onBackDialogues,
  onPreview
}: {
  flow: VideoStudioFlowState;
  onBackAudio: () => void;
  onBackDialogues: () => void;
  onPreview: () => void;
}) {
  return (
    <section className="glass-panel rounded-[2rem] p-6">
      <SectionHeader
        icon={<Clapperboard className="h-7 w-7 text-white" />}
        label="Stage 7"
        title="Video Preview"
      />
      <p className="text-sm leading-7 text-white/90">
        Preview data is saved for {flow.script?.title ?? "the current film"}. Open the dedicated preview page or jump back to editing.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <SecondaryButton onClick={onBackDialogues}>
          <ArrowLeft className="h-4 w-4" />
          Back to Edit Dialogues
        </SecondaryButton>
        <SecondaryButton onClick={onBackAudio}>
          <Music2 className="h-4 w-4" />
          Back to Audio & Music
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
        <h3 className="font-[var(--font-heading)] text-2xl text-white">{scene.title}</h3>
        <p className="mt-2 text-sm text-white/85">{scene.location}</p>
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

function DialogueReview({
  dialogues,
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
              onChange={(value) => onDialogueChange(sceneNumber, dialogue.id, value)}
              onEditingChange={onEditingChange}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function VoiceSceneCard({ scene }: { scene: MovieScene }) {
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
          <h3 className="font-[var(--font-heading)] text-2xl text-white">{scene.title}</h3>
        </div>
        <PlaySceneAudioButton audioUrls={scene.dialogues.map(d => d.audioUrl || "")} />
      </div>
      <div className="grid gap-5 p-6 lg:grid-cols-2">
        {scene.dialogues.map((dialogue) => (
          <div key={dialogue.id} className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold text-white">{dialogue.character}</p>
            <p className="mt-3 text-sm leading-7 text-white/72">"{dialogue.line}"</p>
            {dialogue.audioUrl ? (
              <audio controls src={dialogue.audioUrl} className="mt-3 w-full" />
            ) : (
              <p className="mt-3 rounded-[1rem] border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-white/75">
                {dialogue.audioError ?? "Waiting for voice generation."}
              </p>
            )}
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
  onChange,
  onEditingChange
}: {
  editKey: string;
  editingKey: string | null;
  label: string;
  singleLine?: boolean;
  text: string;
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
              value={text}
              onChange={(event) => onChange(event.target.value)}
              className="w-full rounded-[1rem] border border-cyan-400/25 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-gold/35"
            />
          ) : (
            <textarea
              value={text}
              onChange={(event) => onChange(event.target.value)}
              className="min-h-32 w-full resize-y rounded-[1rem] border border-cyan-400/25 bg-black/30 px-4 py-3 text-sm leading-7 text-white outline-none focus:border-gold/35"
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
