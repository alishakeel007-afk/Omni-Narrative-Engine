import { prisma } from "@/lib/prisma";
import { getEnvValue } from "@/lib/env";
import { deleteFromSupabaseStorage } from "@/lib/supabase-storage";
import { discardStudioTake, normalizeStudioState, type StudioState, type StudioTake } from "@/types/studio";
import { generationLockMs } from "@/lib/film/duration";
import { ltxRequest } from "./ltx";
import { loadStudio, saveStudio, StudioError } from "./store";

/** Only a stored object under this workspace's exact prefix may be removed. */
export function takeStorageObject(workspaceId: string, take: StudioTake) {
  if (!take.url) return;
  const storage = getEnvValue(["NEXT_PUBLIC_SUPABASE_URL"]);
  let url: URL;
  try { url = new URL(take.url); } catch { throw new StudioError("This take has an invalid storage address. No file was deleted."); }
  if (!storage || url.origin !== new URL(storage).origin) {
    if (take.stored) throw new StudioError("This take is outside this project's storage. No file was deleted.");
    return; // An unarchived legacy provider URL is not an application-owned object.
  }
  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|authenticated|sign)\/([^/]+)\/(.+)$/);
  if (!match) throw new StudioError("This take has an unsupported storage address. No file was deleted.");
  const bucket = decodeURIComponent(match[1]);
  const path = decodeURIComponent(match[2]);
  const expected = getEnvValue([take.kind === "video" ? "SUPABASE_VIDEO_BUCKET" : "SUPABASE_IMAGE_BUCKET"]) || (take.kind === "video" ? "generated-videos" : "generated-images");
  if (bucket !== expected || !path.startsWith(`studio/${workspaceId}/`) || path.split("/").some(part => !part || part === "." || part === ".." || part.includes("\\")))
    throw new StudioError("This file does not belong to this project's generated media. No file was deleted.", 403);
  return { bucket, path };
}

function assertUnused(state: StudioState, take: StudioTake) {
  if (state.clips?.some(clip => clip.sourceTakeId === take.id))
    throw new StudioError("This video is used in your edit. Remove its clips from the timeline before deleting it.", 409);
  if (state.renderJobs?.some(job => ["submitting", "queued", "rendering", "processing"].includes(job.status)))
    throw new StudioError("Wait for the current export to finish before deleting its source media.", 409);
  if (state.operation && Date.now() - Date.parse(state.operation.startedAt) < generationLockMs(state.clipSeconds))
    throw new StudioError("Wait for the current project operation to finish before deleting media.", 409);
}

export async function deleteSceneTake(userId: string, workspaceId: string, sceneId: string, takeId: string) {
  // An owner-scoped lookup happens before any storage or provider request.
  await loadStudio(userId, workspaceId);
  const reserved = await prisma.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ state: unknown; revision: number }[]>`SELECT "state", "revision" FROM "FilmWorkspace" WHERE "id" = ${workspaceId} AND "userId" = ${userId} FOR UPDATE`;
    if (!rows.length) throw new StudioError("Project not found.", 404);
    const state = normalizeStudioState(rows[0].state);
    const previous = state.takeDeletions?.find(item => item.takeId === takeId && item.sceneId === sceneId);
    if (previous && !previous.pending) return { state, take: undefined };
    const scene = state.scenes.find(item => item.id === sceneId);
    const take = previous?.pending ?? scene?.takes.find(item => item.id === takeId);
    if (!take) throw new StudioError("Take not found.", 404);
    if (!["complete", "error", "failed", "cancelled"].includes(take.status))
      throw new StudioError("Wait for this generation to stop before deleting its take.", 409);
    assertUnused(state, take);
    if (await tx.filmSceneJob.count({ where: { workspaceId, userId, status: { in: ["queued", "waiting", "running"] } } }))
      throw new StudioError("Wait for ongoing generation to finish or stop it before deleting media.", 409);
    // Validate before hiding anything. Keep the original source for retryable cleanup.
    takeStorageObject(workspaceId, take);
    const receipt = { takeId, sceneId, kind: take.kind, deletedAt: previous?.deletedAt ?? new Date().toISOString(), pending: structuredClone(take) };
    state.takeDeletions = [...(state.takeDeletions ?? []).filter(item => item.takeId !== takeId), receipt];
    discardStudioTake(state, takeId);
    state.revision = rows[0].revision + 1;
    await tx.filmWorkspace.update({ where: { id: workspaceId }, data: { state: JSON.parse(JSON.stringify(state)), revision: state.revision } });
    return { state, take };
  }, { timeout: 30000, maxWait: 10000 });
  if (!reserved.take) return { state: reserved.state };
  let cleanupError: string | undefined;
  try {
    const object = takeStorageObject(workspaceId, reserved.take);
    if (object) await deleteFromSupabaseStorage({ ...object, allowNotFound: true });
    if (reserved.take.provider === "modal-ltx")
      await ltxRequest(`/jobs/${encodeURIComponent(reserved.take.providerId)}/file`, undefined, "DELETE");
  } catch {
    cleanupError = "The take is hidden, but storage cleanup did not finish. Retry deletion to free its remaining storage. No new generation was started.";
  }
  // Merge only the receipt into the latest revision, preserving concurrent edits.
  for (let attempt = 0; attempt < 5; attempt++) {
    const loaded = await loadStudio(userId, workspaceId);
    const state = structuredClone(loaded.state);
    const receipt = state.takeDeletions?.find(item => item.takeId === takeId && item.sceneId === sceneId);
    if (!receipt) throw new StudioError("The deletion record could not be found. Reload and retry cleanup.", 409);
    // A concurrent retry may already have completed both removals.
    if (!receipt.pending) return { state: loaded.state };
    if (cleanupError) receipt.error = cleanupError;
    else { delete receipt.pending; delete receipt.error; }
    discardStudioTake(state, takeId);
    try { return { state: await saveStudio(loaded, state), ...(cleanupError ? { error: cleanupError } : {}) }; }
    catch (error) { if (!(error instanceof StudioError && error.status === 409) || attempt === 4) throw error; }
  }
  throw new StudioError("Reload and retry deletion to finish storage cleanup.", 409);
}
