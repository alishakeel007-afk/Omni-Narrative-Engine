import { prisma } from "@/lib/prisma";
import { EMPTY_STUDIO, type StudioState } from "@/types/studio";

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
  return { project, state: project.state as unknown as StudioState };
}
export async function saveStudio(
  loaded: Awaited<ReturnType<typeof loadStudio>>,
  state: StudioState,
) {
  const next = { ...state, revision: loaded.state.revision + 1 };
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
