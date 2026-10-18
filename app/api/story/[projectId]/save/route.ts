import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { ChoiceType } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { indexMemories, persistChoiceMemory, persistSceneMemories } from "@/lib/memory/memory-service";

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
  }).optional(),
  choiceSceneNumber: z.number().int().min(1).optional(),
  currentState: z.object({
    sceneNumber: z.number().int().min(0),
    healthStatus: z.object({
      health: z.number(),
      mana: z.number(),
      resolve: z.number(),
    }),
    inventory: z.array(z.string()),
  }),
  setup: z.unknown().optional(),
}).refine((value) => !value.choice || value.choiceSceneNumber !== undefined, {
  message: "choiceSceneNumber is required when saving a selected choice.",
  path: ["choiceSceneNumber"],
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

  const { draftId, sceneNumber, scene, choice, choiceSceneNumber, currentState, setup } = result.data;

  // 4. Verify draft belongs to this project
  const draft = await prisma.storyDraft.findFirst({
    where: { id: draftId, storyProjectId: projectId },
    select: { id: true },
  });

  if (!draft) {
    return NextResponse.json({ error: "Draft not found or does not belong to this project." }, { status: 403 });
  }

  const optionTexts = [...new Set((scene.options ?? []).map((option) => option.trim()).filter(Boolean))];

  // 5. Upsert the generated scene. Its offered choices belong to this scene;
  // the selected choice that led here is persisted separately below.
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
      choices: optionTexts.length ? { create: optionTexts.map((choiceText) => ({ choiceText, choiceType: ChoiceType.AI_SUGGESTED })) } : undefined,
    },
    update: {
      title: scene.title,
      description: scene.text,
      location: scene.location,
      mood: scene.mood,
    },
    select: { id: true },
  });

  let sourceScene: { id: string } | null = null;
  if (choice && choiceSceneNumber) {
    sourceScene = await prisma.scene.findFirst({ where: { draftId, sceneNumber: choiceSceneNumber }, select: { id: true } });
    if (sourceScene) {
      await prisma.choice.updateMany({ where: { sceneId: sourceScene.id }, data: { selected: false } });
      const existingChoice = await prisma.choice.findFirst({ where: { sceneId: sourceScene.id, choiceText: choice.text }, select: { id: true } });
      const data = { selected: true, resultText: scene.resultSummary };
      if (existingChoice) await prisma.choice.update({ where: { id: existingChoice.id }, data });
      else await prisma.choice.create({ data: { sceneId: sourceScene.id, choiceText: choice.text,
        choiceType: choice.choiceType === "AI Suggested" ? ChoiceType.AI_SUGGESTED : ChoiceType.CUSTOM, ...data } });
    }
    if (!sourceScene) {
      // The queue preserves FIFO order; a retry can safely recover if an older
      // scene has not reached the database yet.
      return NextResponse.json({ error: "The scene that offered this choice is not saved yet. Please retry." }, { status: 409 });
    }
  }

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
        setup: (setup ?? null) as Prisma.InputJsonValue,
      },
    },
  });

  // 7. Store text facts before responding. Vector embedding remains optional.
  //    This is non-critical — a failure here must never fail the save.
  const sceneForMemory = {
    sceneNumber, title: scene.title, chapter: scene.chapter ?? "", location: scene.location ?? "", mood: scene.mood ?? "",
    text: scene.text, options: scene.options ?? [], resultSummary: scene.resultSummary, inventoryUpdate: scene.inventoryUpdate ?? null,
    cast: (scene.cast ?? []).map((character) => ({ name: character.name, role: character.role ?? "", emotionalState: character.emotionalState ?? "", visualAppearance: character.visualAppearance ?? "", traits: character.traits ?? [], relationships: character.relationships ?? [], imageLabel: character.imageLabel ?? "" })),
    media: { audioMoodPrompt: "", backgroundMusicMood: "", imageLabel: "", imagePrompt: "", narrationDuration: "", narrationLabel: "", playerState: "ready" as const },
  };
  let sceneMemories: Awaited<ReturnType<typeof persistSceneMemories>> = [];
  let choiceMemories: Awaited<ReturnType<typeof persistChoiceMemory>> = [];
  try {
    // The generated scene owns its own facts. A decision belongs to the
    // previous scene that presented it, not to the scene that followed it.
    sceneMemories = await persistSceneMemories(draftId, savedScene.id, sceneForMemory, "");
  } catch (err) {
    console.error("[Save] Scene memory fact persistence failed; story save will continue:", err);
  }
  if (choice?.text && sourceScene) {
    try {
      choiceMemories = await persistChoiceMemory(draftId, sourceScene.id, sceneForMemory, choice.text);
    } catch (err) {
      // Unlike optional embeddings, a selected decision is core persisted story
      // state. Return a retryable failure so the queue does not claim success.
      console.error("[Save] Choice memory persistence failed:", err);
      return NextResponse.json({ error: "The selected choice could not be saved yet. Please retry." }, { status: 503 });
    }
  }
  if (sceneMemories.length) setImmediate(async () => {
    try {
      await indexMemories(draftId, savedScene.id, user.id, sceneNumber, sceneMemories);
    } catch (err) {
      // Swallow silently — memory indexing is best-effort
      console.error("[Save] Background memory indexing failed:", err);
    }
  });

  if (choiceMemories.length && sourceScene && choiceSceneNumber) setImmediate(async () => {
    try {
      await indexMemories(draftId, sourceScene.id, user.id, choiceSceneNumber, choiceMemories);
    } catch (err) {
      console.error("[Save] Background choice-memory indexing failed:", err);
    }
  });

  // Return only persisted display-safe facts. This lets the active Memory
  // Board update after a confirmed save without inventing client-side facts.
  const memorySceneIds = [savedScene.id, sourceScene?.id].filter((id): id is string => Boolean(id));
  const persistedMemories = await prisma.storyMemory.findMany({
    where: { draftId, sceneId: { in: memorySceneIds } },
    orderBy: { createdAt: "asc" },
    select: { id: true, memoryType: true, content: true, importanceScore: true },
  });

  return NextResponse.json({ success: true, sceneId: savedScene.id, memories: persistedMemories }, { status: 200 });
}
