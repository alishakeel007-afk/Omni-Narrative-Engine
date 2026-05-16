import { NextResponse } from "next/server";
import { CharacterSource } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addCharacterToDraft } from "@/lib/story-database";

export const runtime = "nodejs";

const characterSchema = z.object({
  draftId: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  personalityTone: z.string().min(1),
  traits: z.array(z.string()).default([]),
  voiceStyle: z.string().optional(),
  appearancePrompt: z.string().optional(),
  referenceImageUrl: z.string().url().optional(),
  voiceSampleUrl: z.string().url().optional(),
  sourceType: z.nativeEnum(CharacterSource).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();

  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = characterSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid character data" }, { status: 400 });
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

  const character = await addCharacterToDraft(result.data.draftId, result.data);

  return NextResponse.json({ character }, { status: 201 });
}
