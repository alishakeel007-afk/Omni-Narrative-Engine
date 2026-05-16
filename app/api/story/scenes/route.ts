import { NextResponse } from "next/server";
import { ChoiceType } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addSceneToDraft } from "@/lib/story-database";

export const runtime = "nodejs";

const sceneSchema = z.object({
  draftId: z.string().min(1),
  sceneNumber: z.number().int().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  location: z.string().optional(),
  mood: z.string().optional(),
  selectedSuggestion: z.string().optional(),
  choices: z
    .array(
      z.object({
        choiceText: z.string().min(1),
        choiceType: z.nativeEnum(ChoiceType).optional(),
        selected: z.boolean().optional(),
        resultText: z.string().optional(),
      }),
    )
    .optional(),
  dialogues: z
    .array(
      z.object({
        characterId: z.string().min(1).optional(),
        text: z.string().min(1),
        delivery: z.string().optional(),
        audioUrl: z.string().url().optional(),
      }),
    )
    .optional(),
});

export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = sceneSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid scene data" }, { status: 400 });
  }

  const draft = await prisma.storyDraft.findFirst({
    where: {
      id: result.data.draftId,
      project: { userId: session.userId },
    },
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const scene = await addSceneToDraft(result.data.draftId, result.data);

  return NextResponse.json({ scene }, { status: 201 });
}
