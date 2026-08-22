import type { MovieScene, VideoGenerationResponse } from "@/types/video";

export const VIDEO_DRAFT_STORAGE_KEY = "omni-narrative-engine-video-draft";
export const VIDEO_VOICE_RESULT_STORAGE_KEY = "omni-narrative-engine-video-voice-result";
export const VIDEO_STUDIO_FLOW_STORAGE_KEY = "omni-narrative-engine-video-studio-flow";

export type VideoStudioStage =
  | "setup"
  | "storyIdea"
  | "storyReview"
  | "scenes"
  | "voice"
  | "images"
  | "music"
  | "preview";

export type VideoStudioStatus = "idle" | "generating" | "ready" | "error";

export type VideoStudioImageState = {
  message: string;
  provider: string;
  status: VideoStudioStatus;
};

export type VideoStudioMusicState = {
  message: string;
  mood: string;
  provider: string;
  status: VideoStudioStatus;
  title: string;
  trackUrl: string;
};

export type VideoStudioFlowState = {
  acceptedStory: string;
  generatedStory: string;
  genres: string[];
  images: VideoStudioImageState;
  music: VideoStudioMusicState;
  roughIdea: string;
  sceneCount: number;
  scenesNeedRegeneration: boolean;
  script: VideoGenerationResponse | null;
  stage: VideoStudioStage;
  tones: string[];
  updatedAt: string;
  videoOutdated: boolean;
  voiceNeedsRegeneration: boolean;
  voiceResult: VideoGenerationResponse | null;
};

export const DEFAULT_VIDEO_GENRES = [
  "Cinematic Drama",
  "Fantasy",
  "Sci-Fi",
  "Mystery",
  "Adventure",
  "Horror",
  "Romance"
];

export const DEFAULT_VIDEO_TONES = [
  "Immersive and emotional",
  "Suspenseful",
  "Epic and heroic",
  "Dark and tense",
  "Warm and hopeful",
  "Funny and fast-paced"
];

export const DEFAULT_VIDEO_SCENARIO =
  "A young inventor in a flooded future city builds a machine that can replay memories from rainwater, but one memory reveals the mayor erased an entire district from history.";

export const VIDEO_STAGE_LABELS: Array<{ id: VideoStudioStage; label: string }> = [
  { id: "setup", label: "Setup" },
  { id: "storyIdea", label: "Story Idea" },
  { id: "storyReview", label: "Story Review" },
  { id: "scenes", label: "Scenes & Dialogues" },
  { id: "voice", label: "Voice Audio" },
  { id: "images", label: "Visual Generation" },
  { id: "music", label: "Background Music" },
  { id: "preview", label: "Video Preview" }
];

function toStringArray(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const values = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

    return values.length > 0 ? values : fallback;
  }

  if (typeof value === "string" && value.trim()) {
    const values = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return values.length > 0 ? values : fallback;
  }

  return fallback;
}

function toCleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toStage(value: unknown): VideoStudioStage {
  return VIDEO_STAGE_LABELS.some((stage) => stage.id === value)
    ? (value as VideoStudioStage)
    : "setup";
}

function toStatus(value: unknown): VideoStudioStatus {
  return value === "generating" || value === "ready" || value === "error" ? value : "idle";
}

function normalizeScene(scene: MovieScene, index: number): MovieScene {
  return {
    ...scene,
    dialogues: Array.isArray(scene.dialogues)
      ? scene.dialogues.map((dialogue, dialogueIndex) => ({
          ...dialogue,
          id: dialogue.id || `scene-${index + 1}-dialogue-${dialogueIndex + 1}`,
          line: toCleanString(dialogue.line, "Dialogue pending.")
        }))
      : [],
    sceneNumber: index + 1
  };
}

export function normalizeVideoScript(value: unknown): VideoGenerationResponse | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<VideoGenerationResponse>;

  if (!Array.isArray(source.scenes)) {
    return null;
  }

  return {
    audio: {
      errors: Array.isArray(source.audio?.errors) ? source.audio.errors : [],
      generatedCount: Number(source.audio?.generatedCount) || 0,
      provider: source.audio?.provider || "Deepgram TTS",
      requested: Boolean(source.audio?.requested)
    },
    characterVoices: Array.isArray(source.characterVoices) ? source.characterVoices : [],
    estimatedRuntime: toCleanString(source.estimatedRuntime, "Pending runtime"),
    generatedAt: toCleanString(source.generatedAt, new Date().toISOString()),
    genre: toCleanString(source.genre, "Cinematic Drama"),
    id: toCleanString(source.id, `video-${Date.now()}`),
    logline: toCleanString(source.logline, "Generated story pending."),
    scenes: source.scenes.map(normalizeScene),
    title: toCleanString(source.title, "Untitled Omni-Narrative Film"),
    tone: toCleanString(source.tone, "Immersive and emotional")
  };
}

export function createStoryTextFromScript(script: VideoGenerationResponse) {
  const sceneSummary = script.scenes
    .map((scene) => `Scene ${scene.sceneNumber}: ${scene.title}\n${scene.narration}`)
    .join("\n\n");

  return `${script.title}\n\n${script.logline}\n\n${sceneSummary}`;
}

export function createDefaultVideoStudioFlow(): VideoStudioFlowState {
  return {
    acceptedStory: "",
    generatedStory: "",
    genres: [DEFAULT_VIDEO_GENRES[0]],
    images: {
      message: "Visual images have not been generated yet.",
      provider: "",
      status: "idle"
    },
    music: {
      message: "Background music has not been generated yet.",
      mood: "",
      provider: "",
      status: "idle",
      title: "",
      trackUrl: ""
    },
    roughIdea: DEFAULT_VIDEO_SCENARIO,
    sceneCount: 0,
    scenesNeedRegeneration: false,
    script: null,
    stage: "setup",
    tones: [DEFAULT_VIDEO_TONES[0]],
    updatedAt: new Date().toISOString(),
    videoOutdated: false,
    voiceNeedsRegeneration: false,
    voiceResult: null
  };
}

export function normalizeVideoStudioFlow(value: unknown): VideoStudioFlowState {
  const fallback = createDefaultVideoStudioFlow();

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const source = value as Partial<VideoStudioFlowState>;
  const script = normalizeVideoScript(source.script);
  const voiceResult = normalizeVideoScript(source.voiceResult);
  const sceneCount = Math.max(0, Math.min(20, Number(source.sceneCount) || fallback.sceneCount));

  return {
    ...fallback,
    acceptedStory: toCleanString(source.acceptedStory, source.generatedStory || ""),
    generatedStory: toCleanString(source.generatedStory, ""),
    genres: toStringArray(source.genres, fallback.genres),
    images: {
      message: toCleanString(source.images?.message, fallback.images.message),
      provider: toCleanString(source.images?.provider, ""),
      status: toStatus(source.images?.status)
    },
    music: {
      message: toCleanString(source.music?.message, fallback.music.message),
      mood: toCleanString(source.music?.mood, ""),
      provider: toCleanString(source.music?.provider, ""),
      status: toStatus(source.music?.status),
      title: toCleanString(source.music?.title, ""),
      trackUrl: toCleanString(source.music?.trackUrl, "")
    },
    roughIdea: toCleanString(source.roughIdea, fallback.roughIdea),
    sceneCount,
    scenesNeedRegeneration: Boolean(source.scenesNeedRegeneration),
    script,
    stage: toStage(source.stage),
    tones: toStringArray(source.tones, fallback.tones),
    updatedAt: toCleanString(source.updatedAt, fallback.updatedAt),
    videoOutdated: Boolean(source.videoOutdated),
    voiceNeedsRegeneration: Boolean(source.voiceNeedsRegeneration),
    voiceResult
  };
}

export function loadVideoStudioFlow() {
  if (typeof window === "undefined") {
    return createDefaultVideoStudioFlow();
  }

  try {
    const rawFlow = window.localStorage.getItem(VIDEO_STUDIO_FLOW_STORAGE_KEY);
    const flow = rawFlow
      ? normalizeVideoStudioFlow(JSON.parse(rawFlow))
      : createDefaultVideoStudioFlow();

    if (!flow.script) {
      const rawDraft = window.localStorage.getItem(VIDEO_DRAFT_STORAGE_KEY);
      const draftScript = rawDraft ? normalizeVideoScript(JSON.parse(rawDraft)) : null;

      if (draftScript) {
        return {
          ...flow,
          acceptedStory: flow.acceptedStory || createStoryTextFromScript(draftScript),
          generatedStory: flow.generatedStory || createStoryTextFromScript(draftScript),
          script: draftScript,
          stage: flow.stage === "setup" ? "scenes" : flow.stage
        };
      }
    }

    return flow;
  } catch {
    window.localStorage.removeItem(VIDEO_STUDIO_FLOW_STORAGE_KEY);
    return createDefaultVideoStudioFlow();
  }
}

export function saveVideoStudioFlow(flow: VideoStudioFlowState) {
  if (typeof window === "undefined") return;

  const payload = {
    ...flow,
    updatedAt: new Date().toISOString()
  };

  window.localStorage.setItem(VIDEO_STUDIO_FLOW_STORAGE_KEY, JSON.stringify(payload));

  if (flow.script) {
    window.localStorage.setItem(VIDEO_DRAFT_STORAGE_KEY, JSON.stringify(flow.script));
  }

  if (flow.voiceResult) {
    window.localStorage.setItem(VIDEO_VOICE_RESULT_STORAGE_KEY, JSON.stringify(flow.voiceResult));
  }
}

export function resetVideoStudioFlow() {
  if (typeof window === "undefined") {
    return createDefaultVideoStudioFlow();
  }

  const freshFlow = createDefaultVideoStudioFlow();
  window.localStorage.removeItem(VIDEO_DRAFT_STORAGE_KEY);
  window.localStorage.removeItem(VIDEO_VOICE_RESULT_STORAGE_KEY);
  window.localStorage.setItem(VIDEO_STUDIO_FLOW_STORAGE_KEY, JSON.stringify(freshFlow));
  return freshFlow;
}

export function setVideoStudioStage(stage: VideoStudioStage) {
  const flow = loadVideoStudioFlow();
  saveVideoStudioFlow({
    ...flow,
    stage
  });
}
