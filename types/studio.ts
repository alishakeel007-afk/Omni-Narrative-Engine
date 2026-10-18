export type StudioTab = "plan" | "scenes" | "assemble";
export type StudioMode = "discover" | "develop";
export type StudioCharacter = {
  id: string;
  name: string;
  appearance: string;
  referenceId?: string;
  references?: { id: string; label: string }[];
  locked: boolean;
};
export type StudioDialogue = {
  character: string;
  text: string;
  audioUrl?: string;
};
export type StudioTake = {
  id: string;
  providerId: string;
  kind: "image" | "video";
  status: string;
  url?: string;
  stored?: boolean;
  error?: string;
  prompt: string;
  continuityKey?: string;
  provider?: "magic-hour" | "qwen" | "modal-ltx";
  nativeAudio?: boolean;
  duration?: number;
  identity?: StudioIdentity[];
  continuity?: StudioContinuity;
  createdAt: string;
  jobId?: string;
  threadId?: string;
  parentTakeId?: string;
  sourceRequirements?: string;
  stale?: boolean;
};
export type StudioChoice = {
  label: string;
  description?: string;
  message: string;
};
export type StudioImageRequest = {
  prompt: string;
  referenceIds: string[];
  identity?: StudioIdentity[];
  variation?: number;
};
export type StudioIdentity = {
  characterId: string;
  name: string;
  appearance: string;
  referenceIds: string[];
  key: string;
};
export type StudioContinuity = {
  status: "pending" | "passed" | "failed" | "review" | "error";
  checkedAt?: string;
  sampleFps?: number;
  method: "visual-review";
  checks?: {
    characterId: string;
    verdict: "match" | "mismatch" | "uncertain";
    notes: string;
    timestamps?: string[];
  }[];
  error?: string;
};
export type StudioScene = {
  id: string;
  title: string;
  description: string;
  characterIds: string[];
  dialogues: StudioDialogue[];
  takes: StudioTake[];
  selectedImageId?: string;
  selectedVideoId?: string;
  musicUrl?: string;
  outdated?: boolean;
};
export type StudioPlan = {
  title: string;
  premise: string;
  world: string;
  characters: { name: string; appearance: string }[];
  scenes: {
    title: string;
    description: string;
    characters: string[];
    dialogues: { character: string; text: string }[];
  }[];
};
export type StudioMessage = {
  id: string;
  requestId?: string;
  role: "user" | "assistant";
  text: string;
  tab: StudioTab;
  plan?: StudioPlan;
  choices?: StudioChoice[];
  imageRequest?: StudioImageRequest;
  image?: StudioTake;
  imageError?: string;
  editProposal?: { sceneId: string; changes: Partial<StudioEdit> }[];
  approved?: boolean;
  createdAt: string;
};
export type StudioEdit = {
  start: number;
  end: number;
  voiceDelay: number;
  voiceVolume: number;
  musicVolume: number;
  videoVolume: number;
  fadeIn?: number;
  fadeOut?: number;
  texts?: StudioTextOverlay[];
};
export type StudioTextOverlay = {
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  start: number;
  end: number;
};
export type StudioRenderJob = {
  id: string;
  requestId: string;
  providerId: string;
  status: string;
  createdAt: string;
  snapshotKey: string;
  error?: string;
  url?: string;
  snapshot?: { clips: StudioRenderClip[] };
};
export type StudioRenderClip = {
  url: string;
  start: number;
  end: number;
  volume: number;
  fade_in: number;
  fade_out: number;
  texts: StudioTextOverlay[];
  voices: string[];
  music: string | null;
  voice_delay: number;
  voice_volume: number;
  music_volume: number;
};
export type StudioState = {
  version: 1;
  revision: number;
  mode?: StudioMode;
  operation?: { id: string; startedAt: string };
  exports?: { id: string; url: string; name: string; createdAt: string }[];
  title: string;
  premise: string;
  world: string;
  characters: StudioCharacter[];
  scenes: StudioScene[];
  messages: StudioMessage[];
  timeline: string[];
  edits: Record<string, StudioEdit>;
  undoEdits?: Record<string, StudioEdit>;
  undoTimeline?: string[];
  renderJobs?: StudioRenderJob[];
};
export type StudioProject = { id: string; title: string; updatedAt: string };
export type SceneThread = {
  id: string;
  sceneId: string;
  title: string;
  parentTakeId?: string | null;
  parentJobId?: string | null;
};
export type SceneJob = {
  id: string;
  sceneId: string;
  threadId: string;
  kind: "chat" | "image" | "video";
  status: string;
  phase: string;
  text: string;
  error?: string | null;
  cancelRequested: boolean;
  createdAt: string;
  dependsOnId?: string | null;
  result?: {
    reply?: string;
    choices?: StudioChoice[];
    take?: StudioTake;
    stale?: boolean;
    requirements?: string;
  } | null;
};
export const EMPTY_STUDIO: StudioState = {
  version: 1,
  revision: 0,
  title: "Untitled film",
  premise: "",
  world: "",
  characters: [],
  scenes: [],
  messages: [],
  timeline: [],
  edits: {},
};
export const DEFAULT_STUDIO_EDIT: StudioEdit = {
  start: 0,
  end: 0,
  voiceDelay: 0,
  voiceVolume: 1,
  musicVolume: 0.2,
  videoVolume: 0,
};
export function sceneEdit(state: StudioState, sceneId: string): StudioEdit {
  const scene = state.scenes.find((item) => item.id === sceneId);
  const native = scene?.takes.find(
    (take) => take.id === scene.selectedVideoId,
  )?.nativeAudio;
  return {
    ...DEFAULT_STUDIO_EDIT,
    ...(native ? { videoVolume: 1, voiceVolume: 0, musicVolume: 0 } : {}),
    ...state.edits[sceneId],
  };
}
