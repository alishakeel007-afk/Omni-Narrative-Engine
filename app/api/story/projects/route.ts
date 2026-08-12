import { NextResponse } from "next/server";
import { StoryMode } from "@prisma/client";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createStoryProjectWithInitialDraft } from "@/lib/story-database";

export const runtime = "nodejs";

const createProjectSchema = z.object({
  title: z.string().min(1),
  mode: z.nativeEnum(StoryMode),
  draft: z.object({
    title: z.string().min(1),
    genres: z.array(z.string()).default([]),
    tones: z.array(z.string()).default([]),
    numberOfScenes: z.number().int().min(1).max(20),
    includeNarration: z.boolean().optional(),
  }),
});

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? { userId: user.id } : null;

  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await prisma.storyProject.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
    include: {
      drafts: {
        orderBy: { versionNumber: "desc" },
        take: 5,
      },
    },
  });

  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? { userId: user.id } : null;

  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = createProjectSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid project data" }, { status: 400 });
  }

  const project = await createStoryProjectWithInitialDraft(session.userId, result.data);

  return NextResponse.json({ project }, { status: 201 });
}
