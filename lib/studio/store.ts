import { prisma } from "@/lib/prisma";
import { EMPTY_STUDIO, normalizeStudioState, type StudioState } from "@/types/studio";
import { sceneImageRequirements, sceneRequirements } from "./identity";
import { markStaleClips } from "@/lib/film/edit";

function refreshFreshness(state: StudioState) {
  for (const scene of state.scenes) {
    const requirements = sceneRequirements(state, scene);
    for (const take of scene.takes) {
      if (take.kind === "image" && take.sourceImageRequirements)
        take.stale = take.sourceImageRequirements !== sceneImageRequirements(state, scene);
      else if (take.sourceRequirements) take.stale = take.sourceRequirements !== requirements;
    }
  }
  if (state.clips?.length) state.clips = markStaleClips(state, state.clips);
  return state;
}

export class StudioError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function loadStudio(userId: string, projectId: string) {
  const project = await prisma.filmWorkspace.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) throw new StudioError("Project not found.", 404);
  // Normalizing on load keeps every caller on one shape, so a v1 project opens
  // without each route having to know about the older layout.
  return { project, state: refreshFreshness(normalizeStudioState(project.state)) };
}
export async function saveStudio(
  loaded: Awaited<ReturnType<typeof loadStudio>>,
  state: StudioState,
) {
  const next = refreshFreshness({ ...state, revision: loaded.state.revision + 1 });
  const changed = await prisma.filmWorkspace.updateMany({
    where: {
      id: loaded.project.id,
      userId: loaded.project.userId,
      revision: loaded.state.revision,
    },
    data: {
      state: JSON.parse(JSON.stringify(next)),
      revision: next.revision,
      title: state.title,
      updatedAt: new Date(),
    },
  });
  if (!changed.count)
    throw new StudioError(
      "This project changed in another request. Reload it before trying again.",
      409,
    );
  return next;
}
export async function createStudio(userId: string) {
  const project = await prisma.filmWorkspace.create({
    data: {
      userId,
      title: EMPTY_STUDIO.title,
      state: JSON.parse(JSON.stringify(EMPTY_STUDIO)),
    },
  });
  return { id: project.id, state: structuredClone(EMPTY_STUDIO) };
}
export async function referenceData(workspaceId: string, id: string) {
  const memory = await prisma.filmReference.findFirst({
    where: { workspaceId, id },
  });
  if (!memory) throw new StudioError("Character reference not found.", 404);
  return JSON.parse(memory.content) as { data: string; mimeType: string };
}
