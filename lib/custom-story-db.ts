import { normalizeCreateStoryDraft } from "@/lib/create-story-storage";
import { prepareCustomDraftForPersistence } from "@/lib/custom-story-persistence";
import type { CreateStoryDraft } from "@/types/create-story";

export { prepareCustomDraftForPersistence } from "@/lib/custom-story-persistence";

export type CustomStorySaveResult = {
  success: boolean;
  projectId?: string;
  draftId?: string;
  /** A user-safe explanation only; server/database internals stay private. */
  error?: string;
  /** Browser-only previews are deliberately not written into a project snapshot. */
  omittedTransientMedia?: boolean;
};

function saveErrorForStatus(status: number) {
  if (status === 401) return "Your session has expired. Sign in again, then retry the save.";
  if (status === 400) return "This draft contains unsupported saved data. Your local draft is still safe.";
  if (status === 404) return "This project is no longer available to this account.";
  if (status >= 500) return "The project database is temporarily unavailable. Please retry shortly.";
  return "The project could not be saved. Your local draft is still safe.";
}

function responseError(payload: unknown, fallback: string) {
  const error = payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: unknown }).error
    : undefined;
  // API routes provide intentionally safe messages. Keep this bounded so an
  // unexpected intermediary response cannot create an oversized UI message.
  return typeof error === "string" && error.length > 0 && error.length <= 300 ? error : fallback;
}

/**
 * Server persistence for Custom Mode. Local storage remains a safe working
 * copy; a project becomes account-owned only after this request succeeds.
 */
export async function saveCustomStoryToDatabase(draft: CreateStoryDraft): Promise<CustomStorySaveResult> {
  const prepared = prepareCustomDraftForPersistence(draft);
  try {
    const response = await fetch("/api/story/custom/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: prepared.draft }),
    });
    const payload = await response.json().catch(() => null) as { projectId?: string; draftId?: string; error?: string } | null;
    if (!response.ok) return { success: false, error: responseError(payload, saveErrorForStatus(response.status)) };
    return typeof payload?.projectId === "string" && typeof payload?.draftId === "string"
      ? { success: true, projectId: payload.projectId, draftId: payload.draftId, omittedTransientMedia: prepared.omittedTransientMedia }
      : { success: false, error: "The project server returned an incomplete save result." };
  } catch {
    return { success: false, error: "The project could not be reached. Check your connection and retry." };
  }
}

/** Ownership is enforced by the server route; no cached project is substituted. */
export async function loadCustomStoryFromDatabase(projectId: string): Promise<CreateStoryDraft | null> {
  try {
    const response = await fetch(`/api/story/${encodeURIComponent(projectId)}/custom/load`);
    if (!response.ok) return null;
    const payload = await response.json() as { draft?: Partial<CreateStoryDraft>; projectId?: string; draftId?: string };
    if (!payload.draft || payload.projectId !== projectId || typeof payload.draftId !== "string") return null;
    return normalizeCreateStoryDraft({ ...payload.draft, projectId: payload.projectId, draftId: payload.draftId });
  } catch {
    return null;
  }
}
