import { NextResponse } from "next/server";
import { StoryMode } from "@prisma/client";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function getStoredDraft(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const custom = (value as Record<string, unknown>).customBuilder;
  if (!custom || typeof custom !== "object" || Array.isArray(custom)) return null;
  const state = (custom as Record<string, unknown>).state;
  return state && typeof state === "object" && !Array.isArray(state) ? state : null;
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId: user.id, mode: StoryMode.CUSTOM },
    select: { id: true, drafts: { where: { isActive: true }, orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, progressState: true } } },
  });
  const draft = project?.drafts[0];
  const state = draft ? getStoredDraft(draft.progressState) : null;
  if (!project || !draft || !state) return NextResponse.json({ error: "Custom project not found or unavailable." }, { status: 404 });
  return NextResponse.json({ projectId: project.id, draftId: draft.id, draft: state });
}
