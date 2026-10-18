import { NextResponse } from "next/server";
import { StoryMode } from "@prisma/client";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { createStoryProjectWithInitialDraft } from "@/lib/story-database";
import { summarizeProject } from "@/lib/project-summary";

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
    characters: z.array(z.object({
      name: z.string().min(1).max(120),
      role: z.string().min(1).max(120),
      personalityTone: z.string().max(500).default(""),
      traits: z.array(z.string().max(120)).max(20).default([]),
      appearancePrompt: z.string().max(1000).optional(),
    })).max(30).optional(),
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
        // Keep the active draft in the bounded project-list payload even if
        // an older project has more than five historical versions.
        orderBy: [{ isActive: "desc" }, { versionNumber: "desc" }],
        take: 5,
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

  const summaries = projects.map(summarizeProject);

  return NextResponse.json({ projects: summaries });
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
