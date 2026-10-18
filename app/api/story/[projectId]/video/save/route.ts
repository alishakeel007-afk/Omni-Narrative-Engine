import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { reconcileVideoStudioScenes } from "@/lib/story-database";
import { DIALOGUE_EMOTIONS } from "@/lib/audio/emotion-informed-delivery";

export const runtime = "nodejs";

const dialogueSchema = z.object({
  position: z.number().int().min(0).optional(),
  character: z.string().min(1),
  line: z.string(),
  delivery: z.string().optional().default(""),
  audioUrl: z.string().optional(),
  voiceProfile: z.unknown().optional(),
});

const sceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  persistenceSceneId: z.string().uuid().optional(),
  title: z.string(),
  narration: z.string().optional().default(""),
  narrationAudioUrl: z.string().optional(),
  location: z.string().optional().default(""),
  mood: z.string().optional().default(""),
  directorNotes: z.string().optional().default(""),
  sceneGenre: z.string().optional().default(""),
  sceneTone: z.string().optional().default(""),
  soundDesign: z.string().optional().default(""),
  visualPrompt: z.string().optional().default(""),
  imagePrompt: z.string().optional().default(""),
  estimatedDuration: z.string().optional().default(""),
  dialogues: z.array(dialogueSchema).default([]),
  generatedImageUrl: z.string().optional(),
  generatedImagePrompt: z.string().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicPrompt: z.string().optional(),
  backgroundMusicProvider: z.string().optional(),
});

const musicDecisionSchema = z.object({
  outcome: z.enum(["silence", "music"]),
  category: z.enum(["ambient", "suspense", "emotional", "action", "hopeful"]).optional(),
  reason: z.string(),
});

const saveSchema = z.object({
  draftId: z.string().min(1),
  flowState: z.object({
    stage: z.string(),
    returnStage: z.string().optional(),
    roughIdea: z.string(),
    acceptedStory: z.string(),
    generatedStory: z.string(),
    language: z.enum(["en", "ur"]).default("en"),
    scriptLanguage: z.enum(["en", "ur"]).optional(),
    title: z.string().min(1).max(300).optional(),
    logline: z.string().optional().default(""),
    estimatedRuntime: z.string().optional().default(""),
    scenesNeedRegeneration: z.boolean(),
    voiceNeedsRegeneration: z.boolean(),
    videoOutdated: z.boolean(),
    dialogueEmotions: z.record(z.string(), z.enum(DIALOGUE_EMOTIONS)).optional().default({}),
    musicDecisions: z.record(z.string(), musicDecisionSchema).optional().default({}),
    mediaFreshness: z.record(z.string(), z.object({
      image: z.literal(true).optional(), narration: z.literal(true).optional(), music: z.literal(true).optional(),
      dialogueIndices: z.array(z.number().int().min(0)).max(500).optional(),
    })).optional().default({}),
    visualDirections: z.record(z.string(), z.object({
      primaryLocation: z.string().max(300).optional(), composition: z.string().max(500).optional(),
      requiredEvent: z.string().max(1000).optional(), visibleCharacterIds: z.array(z.string().max(200)).max(30).optional(),
    })).optional().default({}),
  }),
  scenes: z.array(sceneSchema).default([]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found or access denied." }, { status: 403 });
  }

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

  const { draftId, flowState, scenes } = result.data;

  const draft = await prisma.storyDraft.findFirst({
    where: { id: draftId, storyProjectId: projectId },
    select: { id: true },
  });
  if (!draft) {
    return NextResponse.json({ error: "Draft not found or does not belong to this project." }, { status: 403 });
  }

  const seenVoiceProfiles = new Map<string, unknown>();
  for (const scene of scenes) {
    for (const dialogue of scene.dialogues) {
      if (dialogue.voiceProfile && !seenVoiceProfiles.has(dialogue.character)) {
        seenVoiceProfiles.set(dialogue.character, dialogue.voiceProfile);
      }
    }
  }

  try {
    const saved = await reconcileVideoStudioScenes({ draftId, flowState, scenes, voiceProfiles: seenVoiceProfiles });
    return NextResponse.json({ success: true, sceneIds: saved.sceneIds }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const isInvalidSceneSet = message === "Each submitted scene must have a unique scene number."
      || message === "A submitted scene identity was used more than once."
      || message === "A submitted scene does not belong to this draft.";
    if (!isInvalidSceneSet) console.error("[video-save] transactional reconciliation failed", error);
    return NextResponse.json(
      { error: isInvalidSceneSet ? message : "Could not save Video Studio scenes. No changes were saved." },
      { status: isInvalidSceneSet ? 400 : 500 },
    );
  }
}
