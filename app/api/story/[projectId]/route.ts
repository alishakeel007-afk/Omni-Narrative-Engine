import { NextResponse } from "next/server";
import { ProjectStatus } from "@prisma/client";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { deleteFromSupabaseStorage } from "@/lib/supabase-storage";
import {
  excludeSharedProjectStorageObjects,
  planOwnedProjectStorageCleanup,
} from "@/lib/project-storage-cleanup";
import { summarizeProject } from "@/lib/project-summary";

export const runtime = "nodejs";

const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: z.nativeEnum(ProjectStatus).optional(),
}).refine((value) => value.title !== undefined || value.status !== undefined, "No project changes were supplied.");

async function getOwnedProjectId(projectId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });
  if (!project) return { error: NextResponse.json({ error: "Project not found or access denied." }, { status: 404 }) };
  return { projectId: project.id, userId: user.id };
}

async function getOwnedProjectCompletion(projectId: string, userId: string) {
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId },
    include: {
      drafts: {
        where: { isActive: true },
        take: 1,
        include: {
          scenes: {
            select: {
              id: true,
              sceneNumber: true,
              description: true,
              mediaAssets: { select: { type: true, url: true, status: true } },
              dialogues: { select: { text: true, audioUrl: true } },
            },
          },
        },
      },
    },
  });
  return project ? summarizeProject(project) : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const owned = await getOwnedProjectId(projectId);
  if (owned.error) return owned.error;

  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid project update." }, { status: 400 });

  if (parsed.data.status === ProjectStatus.COMPLETED) {
    const summary = await getOwnedProjectCompletion(owned.projectId, owned.userId);
    if (!summary || (summary.workflow !== "video-studio" && summary.workflow !== "custom-builder")) {
      return NextResponse.json({ error: "Only saved Guided or Custom projects can be marked complete." }, { status: 400 });
    }
    if (!summary.completion.eligible) {
      return NextResponse.json({
        error: "This project still needs attention before it can be marked complete.",
        completion: summary.completion,
      }, { status: 400 });
    }
  }

  const project = await prisma.storyProject.update({
    where: { id: owned.projectId },
    data: parsed.data,
    select: { id: true, title: true, status: true, updatedAt: true },
  });
  return NextResponse.json({ project });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const owned = await getOwnedProjectId(projectId);
  if (owned.error) return owned.error;

  // Only MediaAsset/VideoJob storage paths that match our server-generated,
  // project-scoped formats are candidates. URL-only legacy dialogue clips and
  // unknown layouts are deliberately retained rather than guessed at.
  const [mediaAssets, videoJobs] = await Promise.all([
    prisma.mediaAsset.findMany({
      where: { draft: { storyProjectId: owned.projectId } },
      select: { storagePath: true },
    }),
    prisma.videoGenerationJob.findMany({
      where: { draft: { storyProjectId: owned.projectId } },
      select: { outputStoragePath: true },
    }),
  ]);
  const plan = planOwnedProjectStorageCleanup(owned.projectId, [
    ...mediaAssets.map((asset) => asset.storagePath),
    ...videoJobs.map((job) => job.outputStoragePath),
  ]);

  // A malformed or manually copied database reference must never cause an
  // object used by another project to be removed.
  const candidatePaths = plan.objects.map((object) => object.storagePath);
  const [foreignAssets, foreignJobs] = candidatePaths.length > 0
    ? await Promise.all([
        prisma.mediaAsset.findMany({
          where: {
            storagePath: { in: candidatePaths },
            draft: { storyProjectId: { not: owned.projectId } },
          },
          select: { storagePath: true },
        }),
        prisma.videoGenerationJob.findMany({
          where: {
            outputStoragePath: { in: candidatePaths },
            draft: { storyProjectId: { not: owned.projectId } },
          },
          select: { outputStoragePath: true },
        }),
      ])
    : [[], []];
  const exclusive = excludeSharedProjectStorageObjects(plan.objects, [
    ...foreignAssets.map((asset) => asset.storagePath).filter((path): path is string => Boolean(path)),
    ...foreignJobs.map((job) => job.outputStoragePath).filter((path): path is string => Boolean(path)),
  ]);

  // Storage is cleaned before cascading database deletion. If an operation
  // fails, leave the project and its records in place; a retry treats a prior
  // successful delete as complete (404), avoiding an unsafe partial DB delete.
  try {
    for (const object of exclusive.deletable) {
      await deleteFromSupabaseStorage({ ...object, allowNotFound: true });
    }
  } catch {
    return NextResponse.json(
      { error: "Project media cleanup could not be completed. The project was not deleted; retry after checking Storage access." },
      { status: 503 },
    );
  }

  await prisma.storyProject.delete({ where: { id: owned.projectId } });
  return NextResponse.json({
    success: true,
    deletedStorageObjects: exclusive.deletable.length,
    retainedStorageObjects: plan.retainedStoragePaths.length + exclusive.retainedSharedStoragePaths.length,
  });
}
