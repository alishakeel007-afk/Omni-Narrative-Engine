import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type JsonRecord = Record<string, unknown>;

export type CustomSceneMediaPatch = {
  backgroundMusicPrompt?: string;
  backgroundMusicProvider?: string;
  backgroundMusicStatus?: "idle" | "generating" | "ready" | "error" | "silent";
  backgroundMusicUrl?: string | undefined;
  generatedImageError?: string | undefined;
  generatedImagePrompt?: string;
  generatedImageStatus?: "idle" | "generating" | "ready" | "error";
  generatedImageUrl?: string | undefined;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function customState(progressState: unknown) {
  const progress = asRecord(progressState);
  const customBuilder = asRecord(progress?.customBuilder);
  const state = asRecord(customBuilder?.state);
  const scenes = Array.isArray(state?.scenes) ? state.scenes : null;
  return progress && customBuilder && state && scenes ? { customBuilder, progress, scenes, state } : null;
}

/**
 * Associates a just-uploaded Custom-mode asset with its already-owned draft.
 * It intentionally changes only one scene's media fields, so it cannot replace
 * the author's other browser-side edits.
 */
export async function saveOwnedCustomSceneMedia(params: {
  draftId: string;
  projectId: string;
  sceneId: string;
  userId: string;
  patch: CustomSceneMediaPatch;
}) {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.storyDraft.findFirst({
      where: {
        id: params.draftId,
        storyProjectId: params.projectId,
        isActive: true,
        project: { userId: params.userId },
      },
      select: { id: true, progressState: true },
    });
    const source = customState(draft?.progressState);
    if (!draft || !source) return false;

    let matched = false;
    const scenes = source.scenes.map((scene) => {
      const sourceScene = asRecord(scene);
      if (!sourceScene || sourceScene.id !== params.sceneId) return scene;
      matched = true;
      return { ...sourceScene, ...params.patch };
    });
    if (!matched) return false;

    await tx.storyDraft.update({
      where: { id: draft.id },
      data: {
        progressState: {
          ...source.progress,
          customBuilder: {
            ...source.customBuilder,
            state: { ...source.state, scenes },
          },
        } as Prisma.InputJsonValue,
      },
    });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/**
 * A queued browser save can be older than a media endpoint response. Preserve
 * server-associated media unless the author explicitly chose intentional music
 * silence. This prevents stale saves from detaching valid stored objects.
 */
export function mergePersistedCustomMedia(existingProgressState: unknown, submittedState: JsonRecord): JsonRecord {
  const source = customState(existingProgressState);
  const submitted = asRecord(submittedState.customBuilder);
  const state = asRecord(submitted?.state);
  const submittedScenes = Array.isArray(state?.scenes) ? state.scenes : null;
  if (!source || !submitted || !state || !submittedScenes) return submittedState;

  const existingById = new Map(source.scenes.flatMap((scene) => {
    const record = asRecord(scene);
    return record && typeof record.id === "string" ? [[record.id, record] as const] : [];
  }));
  const scenes = submittedScenes.map((scene) => {
    const next = asRecord(scene);
    if (!next || typeof next.id !== "string") return scene;
    const existing = existingById.get(next.id);
    if (!existing) return scene;
    const merged: JsonRecord = { ...next };

    if (typeof existing.generatedImageUrl === "string" && typeof next.generatedImageUrl !== "string") {
      merged.generatedImageUrl = existing.generatedImageUrl;
      merged.generatedImagePrompt = next.generatedImagePrompt ?? existing.generatedImagePrompt;
      merged.generatedImageStatus = "ready";
      delete merged.generatedImageError;
    }
    if (typeof existing.narrationAudioUrl === "string" && typeof next.narrationAudioUrl !== "string") {
      merged.narrationAudioUrl = existing.narrationAudioUrl;
      if (typeof existing.narrationAudioFingerprint === "string") merged.narrationAudioFingerprint = existing.narrationAudioFingerprint;
      if (typeof existing.narrationAudioStoragePath === "string") merged.narrationAudioStoragePath = existing.narrationAudioStoragePath;
      if (typeof existing.narrationAudioOutdated === "boolean") merged.narrationAudioOutdated = existing.narrationAudioOutdated;
    }
    if (next.backgroundMusicStatus !== "silent" && typeof existing.backgroundMusicUrl === "string" && typeof next.backgroundMusicUrl !== "string") {
      merged.backgroundMusicUrl = existing.backgroundMusicUrl;
      merged.backgroundMusicProvider = next.backgroundMusicProvider ?? existing.backgroundMusicProvider;
      merged.backgroundMusicPrompt = next.backgroundMusicPrompt ?? existing.backgroundMusicPrompt;
      merged.backgroundMusicStatus = "ready";
    }

    const existingDialogues = Array.isArray(existing.dialogues) ? existing.dialogues : [];
    const existingDialogueById = new Map(existingDialogues.flatMap((dialogue) => {
      const record = asRecord(dialogue);
      return record && typeof record.id === "string" ? [[record.id, record] as const] : [];
    }));
    if (Array.isArray(next.dialogues)) {
      merged.dialogues = next.dialogues.map((dialogue) => {
        const candidate = asRecord(dialogue);
        const saved = candidate && typeof candidate.id === "string" ? existingDialogueById.get(candidate.id) : null;
        return candidate && saved && typeof saved.audioUrl === "string" && typeof candidate.audioUrl !== "string"
          ? {
            ...candidate,
            audioUrl: saved.audioUrl,
            ...(typeof saved.audioFingerprint === "string" ? { audioFingerprint: saved.audioFingerprint } : {}),
            ...(typeof saved.audioStoragePath === "string" ? { audioStoragePath: saved.audioStoragePath } : {}),
            ...(typeof saved.audioOutdated === "boolean" ? { audioOutdated: saved.audioOutdated } : {}),
          }
          : dialogue;
      });
    }
    return merged;
  });

  return {
    ...submittedState,
    customBuilder: { ...submitted, state: { ...state, scenes } },
  };
}
