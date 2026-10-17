export type ProjectListDraft = {
  id: string;
  isActive: boolean;
  progressState?: unknown;
  videoStudioState: unknown;
  scenes: Array<{
    id?: string;
    sceneNumber?: number;
    description: string;
    mediaAssets: Array<{ type: string; url?: string | null; status?: string }>;
    dialogues: Array<{ text?: string; audioUrl: string | null }>;
  }>;
};

export type VideoProjectCompletion = {
  eligible: boolean;
  reasons: string[];
};

type PersistedVideoState = {
  language?: unknown;
  stage?: unknown;
  mediaFreshness?: unknown;
  musicDecisions?: unknown;
};

type PersistedCustomState = {
  language?: unknown;
  scenes?: unknown;
  video?: { status?: unknown };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isFreshnessMarked(value: unknown, key: "image" | "narration" | "music"): boolean {
  return asRecord(value)[key] === true;
}

function hasStaleDialogue(value: unknown): boolean {
  const indices = asRecord(value).dialogueIndices;
  return Array.isArray(indices) && indices.length > 0;
}

function hasReadyAsset(assets: ProjectListDraft["scenes"][number]["mediaAssets"], type: string): boolean {
  return assets.some((asset) => asset.type === type && (asset.status === undefined || asset.status === "READY") && Boolean(asset.url?.trim()));
}

/**
 * Completion is intentionally derived from persisted assets and freshness
 * metadata. A project reaching preview is not, by itself, a completed work.
 */
export function getVideoProjectCompletion(activeDraft: ProjectListDraft | undefined): VideoProjectCompletion {
  if (!activeDraft) return { eligible: false, reasons: ["No active Video Studio draft is available."] };
  const state = asRecord(activeDraft.videoStudioState) as PersistedVideoState;
  const freshness = asRecord(state.mediaFreshness);
  const musicDecisions = asRecord(state.musicDecisions);
  const reasons: string[] = [];

  if (activeDraft.scenes.length === 0) reasons.push("Add at least one scene.");

  for (const scene of activeDraft.scenes) {
    const sceneLabel = `Scene ${scene.sceneNumber ?? "?"}`;
    // Freshness is keyed by stable Scene.id, never mutable display order.
    const effectiveFreshness = scene.id ? freshness[scene.id] : undefined;

    if (isFreshnessMarked(effectiveFreshness, "image")) reasons.push(`${sceneLabel} image is outdated.`);
    else if (!hasReadyAsset(scene.mediaAssets, "IMAGE")) reasons.push(`${sceneLabel} image is missing.`);

    if (scene.description.trim()) {
      if (isFreshnessMarked(effectiveFreshness, "narration")) reasons.push(`${sceneLabel} narration is outdated.`);
      else if (!hasReadyAsset(scene.mediaAssets, "AUDIO")) reasons.push(`${sceneLabel} narration is missing.`);
    }

    const spokenDialogues = scene.dialogues.filter((dialogue) => dialogue.text === undefined || dialogue.text.trim());
    if (spokenDialogues.length > 0) {
      if (hasStaleDialogue(effectiveFreshness)) reasons.push(`${sceneLabel} dialogue audio is outdated.`);
      else if (spokenDialogues.some((dialogue) => !dialogue.audioUrl?.trim())) reasons.push(`${sceneLabel} dialogue audio is missing.`);
    }

    const decision = asRecord(musicDecisions[String(scene.sceneNumber)]);
    const intentionalSilence = decision.outcome === "silence";
    if (!intentionalSilence) {
      if (isFreshnessMarked(effectiveFreshness, "music")) reasons.push(`${sceneLabel} background music is outdated.`);
      else if (!hasReadyAsset(scene.mediaAssets, "MUSIC")) reasons.push(`${sceneLabel} background music is missing.`);
    }
  }

  return { eligible: reasons.length === 0, reasons };
}

/** Small, provider-free status summary used by the project list. */
export function summarizeProject<T extends { drafts: ProjectListDraft[] }>(project: T) {
  const activeDraft = project.drafts.find((draft) => draft.isActive) ?? project.drafts[0];
  const scenes = activeDraft?.scenes ?? [];
  const hasVideoStudioState = Boolean(activeDraft?.videoStudioState);
  const progress = asRecord(activeDraft?.progressState);
  const customState = asRecord(asRecord(progress.customBuilder).state) as PersistedCustomState;
  const customScenes = Array.isArray(customState.scenes) ? customState.scenes : [];
  const hasCustomBuilderState = Boolean(progress.customBuilder) && Array.isArray(customState.scenes);
  const videoState = asRecord(activeDraft?.videoStudioState) as PersistedVideoState;
  const completion = hasVideoStudioState ? getVideoProjectCompletion(activeDraft) : { eligible: false, reasons: [] };
  const customComplete = customState.video?.status === "ready";
  const customCompletion: VideoProjectCompletion = customComplete
    ? { eligible: true, reasons: [] }
    : { eligible: false, reasons: ["Complete the Custom Mode preview preparation before marking this project complete."] };
  return {
    ...project,
    workflow: hasCustomBuilderState ? "custom-builder" as const : hasVideoStudioState ? "video-studio" as const : "story" as const,
    resumeStage: hasCustomBuilderState ? "builder" : typeof videoState?.stage === "string" ? videoState.stage : null,
    language: hasCustomBuilderState ? (customState.language === "ur" ? "ur" as const : "en" as const) : videoState.language === "ur" ? "ur" as const : "en" as const,
    sceneCount: hasCustomBuilderState ? customScenes.length : scenes.length,
    mediaReady: hasCustomBuilderState ? customCompletion.eligible : completion.eligible,
    completion: hasCustomBuilderState ? customCompletion : completion,
  };
}
