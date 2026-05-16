import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createDraftVersion } from "@/lib/story-database";

export const runtime = "nodejs";

const createDraftVersionSchema = z.object({
  storyProjectId: z.string().min(1),
  baseDraftId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = createDraftVersionSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid draft data" }, { status: 400 });
  }

  const project = await prisma.storyProject.findFirst({
    where: {
      id: result.data.storyProjectId,
      userId: session.userId,
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Story project not found" }, { status: 404 });
  }

  const draft = await createDraftVersion(result.data.storyProjectId, result.data.baseDraftId);

  return NextResponse.json({ draft }, { status: 201 });
}
