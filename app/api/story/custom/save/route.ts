import { NextResponse } from "next/server";
import { DraftStatus, Prisma, ProjectStatus, StoryMode } from "@prisma/client";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { mergePersistedCustomMedia } from "@/lib/custom-story-media";
import { classifyCustomSaveFailure } from "@/lib/custom-save-error";

export const runtime = "nodejs";

const text = z.string().max(20_000);
const customDraftSchema = z.object({
  projectId: z.string().uuid().optional(),
  draftId: z.string().uuid().optional(),
  clientImportId: z.string().min(8).max(200),
  language: z.enum(["en", "ur"]).default("en"),
  storyTitle: z.string().trim().min(1).max(200),
  genres: z.array(z.string().max(120)).max(20),
  tones: z.array(z.string().max(120)).max(20),
  includeNarration: z.boolean(),
  numberOfScenes: z.number().int().min(1).max(50),
  characters: z.array(z.object({
    id: z.string().min(1).max(200), name: z.string().max(200), role: z.string().max(200),
    personalityTone: z.string().max(1000), voiceStyle: z.string().max(500),
  })).max(50),
  scenes: z.array(z.object({
    id: z.string().min(1).max(200), sceneNumber: z.number().int().min(1).max(100),
    title: z.string().max(300), storyDescription: text, selectedSuggestion: text,
    sceneGenre: z.string().max(120), sceneTone: z.string().max(120), activeCharacterIds: z.array(z.string().max(200)).max(50),
    suggestions: z.array(z.string().max(2000)).max(3),
    dialogues: z.array(z.object({ id: z.string().min(1).max(200), characterId: z.string().max(200), characterName: z.string().max(200), text, voiceStyle: z.string().max(500).optional(), audioUrl: z.string().url().max(4000).optional(), audioFingerprint: z.string().max(200).optional(), audioStoragePath: z.string().max(1000).optional(), audioOutdated: z.boolean().optional() })).max(200),
    generatedImageUrl: z.string().url().max(4000).optional(), generatedImagePrompt: z.string().max(5000).optional(),
    generatedImageStatus: z.enum(["idle", "generating", "ready", "error"]).optional(), generatedImageError: z.string().max(1000).optional(), narrationAudioUrl: z.string().url().max(4000).optional(), narrationAudioFingerprint: z.string().max(200).optional(), narrationAudioStoragePath: z.string().max(1000).optional(), narrationAudioOutdated: z.boolean().optional(),
    backgroundMusicUrl: z.string().url().max(4000).optional(), backgroundMusicStatus: z.enum(["idle", "generating", "ready", "error", "silent"]).optional(), backgroundMusicProvider: z.string().max(300).optional(), backgroundMusicPrompt: z.string().max(2000).optional(),
  })).min(1).max(50),
  audio: z.object({ backgroundMusicStatus: z.string().max(40), backgroundMusicMessage: z.string().max(1000), backgroundMusicUrl: z.string().url().max(4000).optional(), voiceStatus: z.string().max(40), voiceMessage: z.string().max(1000) }),
  visuals: z.object({ status: z.string().max(40), message: z.string().max(1000) }),
  video: z.object({ status: z.string().max(40), message: z.string().max(1000) }),
  selectedMode: z.literal("create-your-own"), updatedAt: z.string().max(100),
});

const requestSchema = z.object({ draft: customDraftSchema });

function toState(draft: z.infer<typeof customDraftSchema>) {
  // Do not allow a client to move its snapshot between account projects.
  const { projectId: _projectId, draftId: _draftId, ...state } = draft;
  return { customBuilder: { clientImportId: draft.clientImportId, state } } as Prisma.InputJsonValue;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid Custom Mode draft." }, { status: 400 });
  const draft = parsed.data.draft;
  if ((draft.projectId && !draft.draftId) || (!draft.projectId && draft.draftId)) {
    return NextResponse.json({ error: "Project and draft identity must be supplied together." }, { status: 400 });
  }

  const metadata = (progressState: Prisma.InputJsonValue = toState(draft)) => ({
    title: draft.storyTitle, genres: draft.genres as Prisma.InputJsonValue, tones: draft.tones as Prisma.InputJsonValue,
    numberOfScenes: draft.scenes.length, includeNarration: draft.includeNarration, progressState,
  });

  try {
    const saved = await prisma.$transaction(async (tx) => {
      if (draft.projectId && draft.draftId) {
        const owned = await tx.storyDraft.findFirst({
          where: { id: draft.draftId, storyProjectId: draft.projectId, isActive: true, project: { userId: user.id, mode: StoryMode.CUSTOM } },
          select: { id: true, storyProjectId: true },
        });
        if (!owned) return null;
        const current = await tx.storyDraft.findUnique({ where: { id: owned.id }, select: { progressState: true } });
        const progressState = mergePersistedCustomMedia(current?.progressState, toState(draft) as Record<string, unknown>) as Prisma.InputJsonValue;
        await tx.storyProject.update({ where: { id: owned.storyProjectId }, data: { title: draft.storyTitle, status: ProjectStatus.IN_PROGRESS } });
        await tx.storyDraft.update({ where: { id: owned.id }, data: metadata(progressState) });
        return { projectId: owned.storyProjectId, draftId: owned.id };
      }

      // Retried local imports use the durable client key and cannot create duplicates.
      const existing = await tx.storyDraft.findFirst({
        where: { project: { userId: user.id, mode: StoryMode.CUSTOM }, progressState: { path: ["customBuilder", "clientImportId"], equals: draft.clientImportId } },
        select: { id: true, storyProjectId: true },
      });
      if (existing) {
        const current = await tx.storyDraft.findUnique({ where: { id: existing.id }, select: { progressState: true } });
        const progressState = mergePersistedCustomMedia(current?.progressState, toState(draft) as Record<string, unknown>) as Prisma.InputJsonValue;
        await tx.storyProject.update({ where: { id: existing.storyProjectId }, data: { title: draft.storyTitle, status: ProjectStatus.IN_PROGRESS } });
        await tx.storyDraft.update({ where: { id: existing.id }, data: metadata(progressState) });
        return { projectId: existing.storyProjectId, draftId: existing.id };
      }
      const project = await tx.storyProject.create({
        data: { userId: user.id, title: draft.storyTitle, mode: StoryMode.CUSTOM, status: ProjectStatus.IN_PROGRESS,
          drafts: { create: { ...metadata(), versionNumber: 1, isActive: true, status: DraftStatus.EDITING } } },
        select: { id: true, drafts: { select: { id: true } } },
      });
      return { projectId: project.id, draftId: project.drafts[0].id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!saved) return NextResponse.json({ error: "Project not found or access denied." }, { status: 404 });
    return NextResponse.json(saved);
  } catch (error) {
    const failure = classifyCustomSaveFailure(error);
    // This deliberately records only a stable classification, never a
    // connection URL, user id, payload, or raw driver/provider message.
    console.error("Custom Mode project save failed", { code: failure.logCode });
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
