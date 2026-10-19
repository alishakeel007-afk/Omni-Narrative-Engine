export type StudioTab = "plan" | "scenes" | "assemble";
export type StudioMode = "discover" | "develop";
export type StudioCharacter = {
  id: string;
  name: string;
  appearance: string;
  referenceId?: string;
  references?: { id: string; label: string }[];
  locked: boolean;
  motivation?: string;
  relationships?: string;
  /** Urdu only. English speech is generated natively and is not selectable. */
  voice?: FilmVoiceProfile;
};
export type StudioDialogue = {
  /** Stable identity. Never infer a line from its array position. */
  id?: string;
  character: string;
  text: string;
  audioUrl?: string;
  /** Set only on the Urdu path, where speech is synthesised before generation. */
  audioStoragePath?: string;
  audioFingerprint?: string;
  /** Measured with ffprobe, never estimated. */
  audioDuration?: number;
  audioError?: string;
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
  provider?: "magic-hour" | "qwen" | "modal-ltx" | "cloudflare";
  nativeAudio?: boolean;
  /**
   * MEASURED output length in seconds, read back from the finished file. Never
   * assume it equals what was requested: the pipeline snaps to its frame grid
   * and a provider may return something shorter.
   */
  duration?: number;
  /** What this take was ASKED for, kept separate from `duration` above. */
  requestedSeconds?: number;
  requestedFrames?: number;
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
  /** Intentional scene clothing; excluded from the locked identity key. */
  sceneWardrobe?: string;
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
  /**
   * Visual action only. This guides the picture and is NEVER spoken. The field
   * is named `description` for v1 compatibility; `visualAction` is the name the
   * four-step workflow uses and is kept in sync by the normalizer.
   */
  description: string;
  visualAction?: string;
  /** Scene direction never changes the character's locked identity. */
  direction?: SceneDirection;
  /**
   * Shot identity. A clip carries one mixed soundtrack and one lip-synced
   * performance, so a scene with several speakers is split into shots, each
   * holding at most one speaking turn.
   */
  parentSceneId?: string;
  shotIndex?: number;
  /**
   * The single speaking character. Required only on the Urdu lip-sync path,
   * where one supplied speech track drives one mouth; English generation may
   * carry several speakers across the beats of one clip.
   */
  speakerId?: string;
  dialogueIds?: string[];
  /** Requested clip length. Falls back to the project default when unset. */
  requestedSeconds?: number;
  /**
   * Optional internal cuts. A scene with beats is still generated as ONE source
   * video — the beats describe cuts inside it, and the editor can split that
   * video at them afterwards. Empty or absent means one continuous shot.
   */
  beats?: FilmBeat[];
  musicStatus?: "idle" | "generating" | "ready" | "unavailable";
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
  portraitCharacterId?: string;
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
  sourceSignature?: string;
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
export type FilmLanguage = "en" | "ur";
export type FilmStep = "setup" | "script" | "generate" | "edit";
export type FilmAssist = "guided" | "custom";
export type CreativeBrief = {
  audience?: string;
  purpose?: string;
  tone?: string;
  genre?: string;
  ending?: string;
};
export type SceneDirection = {
  location?: string;
  timeOfDay?: string;
  lighting?: string;
  props?: string;
  camera?: string;
  delivery?: string;
  music?: string;
  ambience?: string;
  soundEffects?: string;
  /** Keyed by stable character ID; applies to this scene only. */
  wardrobe?: Record<string, string>;
};
/** Only sizes the worker actually supports are offered. */
export type FilmFormat = "landscape";

/**
 * One cut inside a single generated video.
 *
 * Beats are rendered as chronological prose with explicit cuts in the prompt,
 * never as pipe-separated fragments, because the pipeline reads a description
 * of a continuous piece of footage rather than a list of jobs.
 */
export type FilmBeat = {
  id: string;
  visualAction: string;
  /** Lines spoken during this beat, by stable dialogue id. */
  dialogueIds?: string[];
};

/** Urdu only: English speech is generated natively and is not selectable. */
export type FilmVoiceProfile = {
  archetype: string;
  gender: string;
  label: string;
};

/**
 * One instance of a source take on the timeline.
 *
 * Splitting produces two instances sharing a scene and take with adjacent
 * source ranges, which is why the timeline is a list of instances rather than
 * a list of scene ids.
 */
export type TimelineClip = {
  /** Unique per instance, not per scene. */
  id: string;
  sceneId: string;
  sourceTakeId: string;
  sourceIn: number;
  sourceOut: number;
  /** The clip's baked mixed soundtrack. Not a dialogue-only control. */
  clipVolume: number;
  /** Reserved for a later version's separate English voice track. */
  dialogueVolume?: number;
  /** Only meaningful when the scene has a stored music object. */
  musicVolume?: number;
  fadeIn?: number;
  fadeOut?: number;
  texts?: StudioTextOverlay[];
  /** Its source take was regenerated; the clip needs relinking before export. */
  stale?: boolean;
};

export type EditSnapshot = { clips: TimelineClip[] };

export const MAX_EDIT_HISTORY = 30;
export const MIN_CLIP_SECONDS = 0.5;

export type StudioState = {
  /** 1 is the conversational studio's shape; 2 adds the four-step workflow. */
  version: 1 | 2;
  revision: number;
  /** Four-step workflow state. */
  step?: FilmStep;
  language?: FilmLanguage;
  assist?: FilmAssist;
  format?: FilmFormat;
  visualStyle?: string;
  sourceScript?: string;
  /** Writer's rough starting idea, kept when a generated script refines the premise. */
  roughIdea?: string;
  creativeBrief?: CreativeBrief;
  /** Replaced/deleted scenes retain their immutable media and IDs. */
  archivedScenes?: StudioScene[];
  scriptUndo?: { kind?: "rebuild" | "sceneList" | "character"; scenes: StudioScene[]; characters: StudioCharacter[]; title: string; premise: string; world: string };
  /**
   * Default requested clip length in seconds. The effective value is resolved
   * through `lib/film/duration.ts`, which clamps it to what this deployment is
   * configured and validated for, so a project saved with a long clip does not
   * keep requesting one after the capability is switched back off.
   */
  clipSeconds?: number;
  /**
   * Timeline as edit instances. This is the field the four-step editor uses;
   * `timeline` and `edits` below are the v1 shape, kept only so the legacy
   * studio keeps compiling until it is removed.
   */
  clips?: TimelineClip[];
  history?: { past: EditSnapshot[]; future: EditSnapshot[] };
  /** Cached guided proposals, keyed by a context fingerprint. */
  suggestions?: Record<string, { choices: StudioChoice[]; createdAt: string }>;
  mode?: StudioMode;
  operation?: { id: string; startedAt: string };
  exports?: { id: string; url: string; name: string; createdAt: string; sourceSignature?: string }[];
  title: string;
  premise: string;
  world: string;
  characters: StudioCharacter[];
  scenes: StudioScene[];
  messages: StudioMessage[];
  /** @deprecated v1 shape. Superseded by `clips`; removed with the legacy UI. */
  timeline: string[];
  /** @deprecated v1 shape. Per-clip settings now live on each TimelineClip. */
  edits: Record<string, StudioEdit>;
  /** @deprecated v1 single-level undo. Superseded by `history`. */
  undoEdits?: Record<string, StudioEdit>;
  /** @deprecated v1 single-level undo. Superseded by `history`. */
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
  title: "Untitled story",
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

/** A legacy narrator marker: never spoken, never sent for generation. */
export function isNarratorDialogue(line: Pick<StudioDialogue, "id" | "character">) {
  return (
    /^(narrator|voiceover|voice over|narration)$/i.test((line.character || "").trim()) ||
    /-narration$/.test(line.id || "")
  );
}

/** Spoken lines only: narrator leftovers and blank lines never generate audio. */
export function spokenDialogue(scene: Pick<StudioScene, "dialogues">) {
  return scene.dialogues.filter((line) => line.text.trim() && !isNarratorDialogue(line));
}

function clipFromLegacyScene(state: StudioState, sceneId: string): TimelineClip | null {
  const scene = state.scenes.find((item) => item.id === sceneId);
  const take = scene?.takes.find((item) => item.id === scene.selectedVideoId);
  if (!scene || !take) return null;
  const edit = state.edits?.[sceneId];
  const duration = take.duration || 0;
  const sourceOut = edit?.end || duration;
  return {
    id: `clip-${sceneId}`,
    sceneId,
    sourceTakeId: take.id,
    sourceIn: edit?.start || 0,
    // A v1 edit with no explicit end meant "to the end of the take".
    sourceOut: sourceOut > (edit?.start || 0) ? sourceOut : duration,
    // v1 stored the clip's own soundtrack level as videoVolume.
    clipVolume: edit ? edit.videoVolume : take.nativeAudio ? 1 : 0,
    ...(edit?.musicVolume !== undefined ? { musicVolume: edit.musicVolume } : {}),
    ...(edit?.fadeIn ? { fadeIn: edit.fadeIn } : {}),
    ...(edit?.fadeOut ? { fadeOut: edit.fadeOut } : {}),
    ...(edit?.texts?.length ? { texts: edit.texts } : {}),
  };
}

function derivedStep(state: StudioState): FilmStep {
  if (state.clips?.length) return "edit";
  const generated = state.scenes.some((scene) =>
    scene.takes.some((take) => take.kind === "video" && take.status === "complete"),
  );
  if (generated) return "generate";
  return state.scenes.length ? "script" : "setup";
}

/**
 * Brings any stored project up to the v2 shape without losing authored work.
 *
 * v1 projects keep their `timeline`/`edits` so the legacy studio still opens
 * them, and gain the `clips` the four-step editor reads. Legacy narrator lines
 * are left on the record but excluded from generation and playback elsewhere,
 * because a scene's description is often the only authored text it has.
 */
export function normalizeStudioState(raw: unknown): StudioState {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<StudioState>;
  const state: StudioState = {
    ...structuredClone(EMPTY_STUDIO),
    ...source,
    scenes: (source.scenes || []).map((scene, sceneIndex) => ({
      ...scene,
      visualAction: scene.visualAction ?? scene.description ?? "",
      description: scene.description ?? scene.visualAction ?? "",
      takes: scene.takes || [],
      dialogues: (scene.dialogues || []).map((line, lineIndex) => ({
        ...line,
        id: line.id || `scene-${sceneIndex + 1}-line-${lineIndex + 1}`,
      })),
      // Beats are addressed by id for the same reason dialogue is: an edit
      // elsewhere in the scene must not change which beat a reference means.
      ...(scene.beats?.length
        ? {
            beats: scene.beats.map((beat, beatIndex) => ({
              ...beat,
              id: beat.id || `scene-${sceneIndex + 1}-beat-${beatIndex + 1}`,
            })),
          }
        : {}),
    })),
    characters: source.characters || [],
    messages: source.messages || [],
    timeline: source.timeline || [],
    edits: source.edits || {},
  };

  state.language = state.language ?? "en";
  state.assist = state.assist ?? "guided";
  state.format = state.format ?? "landscape";

  if (!state.clips) {
    state.clips = state.timeline
      .map((sceneId) => clipFromLegacyScene(state, sceneId))
      .filter((clip): clip is TimelineClip => clip !== null);
  }
  state.history = state.history ?? { past: [], future: [] };
  state.step = state.step ?? derivedStep(state);
  state.version = 2;
  return state;
}
