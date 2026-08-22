import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ChoiceType } from "@prisma/client";
import { processAndIndexSceneMemories } from "@/lib/memory/memory-service";

export const runtime = "nodejs";

// ─── Validation Schema ───────────────────────────────────────────────────────

const saveSchema = z.object({
  draftId: z.string().uuid(),
  sceneNumber: z.number().int().min(1),
  scene: z.object({
    title: z.string(),
    chapter: z.string().optional(),
    location: z.string().optional(),
    mood: z.string().optional(),
    text: z.string(),
    resultSummary: z.string().optional(),
    inventoryUpdate: z.union([
      z.object({
        action: z.enum(["add", "remove"]),
        item: z.string(),
        reason: z.string().optional(),
      }),
      z.null(),
    ]).optional(),
    options: z.array(z.string()).optional(),
    cast: z.array(z.object({
      name: z.string(),
      role: z.string().optional(),
      emotionalState: z.string().optional(),
      visualAppearance: z.string().optional(),
      traits: z.array(z.string()).optional(),
      relationships: z.array(z.string()).optional(),
      imageLabel: z.string().optional(),
    })).optional(),
  }),
  choice: z.object({
    text: z.string(),
    choiceType: z.enum(["AI Suggested", "Custom"]),
  }),
  currentState: z.object({
    sceneNumber: z.number().int().min(0),
    healthStatus: z.object({
      health: z.number(),
      mana: z.number(),
      resolve: z.number(),
    }),
    inventory: z.array(z.string()),
  }),
});

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // 1. Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verify project ownership
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found or access denied." }, { status: 403 });
  }

  // 3. Parse & validate body
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const result = saveSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: result.error.issues[0]?.message ?? "Invalid save data." },
      { status: 400 }
    );
  }

  const { draftId, sceneNumber, scene, choice, currentState } = result.data;

  // 4. Verify draft belongs to this project
  const draft = await prisma.storyDraft.findFirst({
    where: { id: draftId, storyProjectId: projectId },
    select: { id: true },
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found or does not belong to this project." }, { status: 403 });
  }

  // 5. Upsert scene (idempotent by draftId + sceneNumber)
  const savedScene = await prisma.scene.upsert({
    where: {
      draftId_sceneNumber: { draftId, sceneNumber },
    },
    create: {
      draftId,
      sceneNumber,
      title: scene.title,
      description: scene.text,
      location: scene.location,
      mood: scene.mood,
      choices: {
        create: [{
          choiceText: choice.text,
          choiceType: choice.choiceType === "AI Suggested" ? ChoiceType.AI_SUGGESTED : ChoiceType.CUSTOM,
          selected: true,
          resultText: scene.resultSummary,
        }],
      },
    },
    update: {
      // On duplicate save, update result summary only
      description: scene.text,
    },
    select: { id: true },
  });

  // 6. Update draft progress state (health, inventory, sceneIndex)
  await prisma.storyDraft.update({
    where: { id: draftId },
    data: {
      updatedAt: new Date(),
      progressState: {
        sceneIndex: currentState.sceneNumber,
        health: currentState.healthStatus.health,
        mana: currentState.healthStatus.mana,
        resolve: currentState.healthStatus.resolve,
        inventory: currentState.inventory,
      },
    },
  });

  // 7. Fire-and-forget: index memories into pgvector
  //    This is non-critical — a failure here must never fail the save.
  setImmediate(async () => {
    try {
      // Reconstruct a StoryScene-compatible object for the memory extractor
      const sceneForMemory = {
        sceneNumber,
        title: scene.title,
        chapter: scene.chapter ?? "",
        location: scene.location ?? "",
        mood: scene.mood ?? "",
        text: scene.text,
        options: scene.options ?? [],
        resultSummary: scene.resultSummary,
        inventoryUpdate: scene.inventoryUpdate ?? null,
        cast: (scene.cast ?? []).map((character) => ({
          name: character.name,
          role: character.role ?? "",
          emotionalState: character.emotionalState ?? "",
          visualAppearance: character.visualAppearance ?? "",
          traits: character.traits ?? [],
          relationships: character.relationships ?? [],
          imageLabel: character.imageLabel ?? "",
        })),
        media: {
          audioMoodPrompt: "", backgroundMusicMood: "",
          imageLabel: "", imagePrompt: "",
          narrationDuration: "", narrationLabel: "",
          playerState: "ready" as const,
        },
      };

      await processAndIndexSceneMemories(
        draftId,
        savedScene.id,
        user.id,
        sceneForMemory,
        choice.text
      );
    } catch (err) {
      // Swallow silently — memory indexing is best-effort
      console.error("[Save] Background memory indexing failed:", err);
    }
  });

  return NextResponse.json({ success: true, sceneId: savedScene.id }, { status: 200 });
}
