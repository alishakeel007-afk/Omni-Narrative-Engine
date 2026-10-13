import { NextResponse } from "next/server";
import { CharacterSource } from "@prisma/client";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? { userId: user.id } : null;

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

const updateCharacterSchema = z.object({
  draftId: z.string().min(1),
  name: z.string().min(1),
  emotionalState: z.string().optional(),
  visualAppearance: z.string().optional(),
  sceneNumber: z.number().optional(),
});

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? { userId: user.id } : null;

  if (!session?.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const result = updateCharacterSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid update data" }, { status: 400 });
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

  const { draftId, name, ...update } = result.data;
  
  // Note: we need to import upsertCharacterState in this file
  const { upsertCharacterState } = await import("@/lib/story-database");
  const character = await upsertCharacterState(draftId, name, update);

  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 });
  }

  return NextResponse.json({ character });
}
