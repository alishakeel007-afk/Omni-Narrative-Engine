import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import {
  saveVideoStudioFlowMeta,
  saveMovieScene,
  saveSceneImage,
  saveSceneMusic,
  upsertVideoCharacterVoice,
} from "@/lib/story-database";

export const runtime = "nodejs";

const dialogueSchema = z.object({
  character: z.string().min(1),
  line: z.string(),
  delivery: z.string().optional().default(""),
  audioUrl: z.string().optional(),
  voiceProfile: z.unknown().optional(),
});

const sceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  title: z.string(),
  narration: z.string().optional().default(""),
  location: z.string().optional().default(""),
  mood: z.string().optional().default(""),
  directorNotes: z.string().optional().default(""),
  sceneGenre: z.string().optional().default(""),
  sceneTone: z.string().optional().default(""),
  soundDesign: z.string().optional().default(""),
  visualPrompt: z.string().optional().default(""),
  estimatedDuration: z.string().optional().default(""),
  dialogues: z.array(dialogueSchema).default([]),
  generatedImageUrl: z.string().optional(),
  generatedImagePrompt: z.string().optional(),
  backgroundMusicUrl: z.string().optional(),
  backgroundMusicPrompt: z.string().optional(),
});

const saveSchema = z.object({
  draftId: z.string().min(1),
  flowState: z.object({
    stage: z.string(),
    roughIdea: z.string(),
    acceptedStory: z.string(),
    generatedStory: z.string(),
    logline: z.string().optional().default(""),
    estimatedRuntime: z.string().optional().default(""),
    scenesNeedRegeneration: z.boolean(),
    voiceNeedsRegeneration: z.boolean(),
    videoOutdated: z.boolean(),
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

  await saveVideoStudioFlowMeta(draftId, flowState);

  const seenVoiceProfiles = new Map<string, unknown>();

  for (const scene of scenes) {
    await saveMovieScene(draftId, scene);

    if (scene.generatedImageUrl) {
      await saveSceneImage(draftId, scene.sceneNumber, {
        url: scene.generatedImageUrl,
        prompt: scene.generatedImagePrompt,
        provider: "AI Visual Engine",
      });
    }

    if (scene.backgroundMusicUrl) {
      await saveSceneMusic(draftId, scene.sceneNumber, {
        url: scene.backgroundMusicUrl,
        prompt: scene.backgroundMusicPrompt,
        provider: "Stable Audio",
      });
    }

    for (const dialogue of scene.dialogues) {
      if (dialogue.voiceProfile && !seenVoiceProfiles.has(dialogue.character)) {
        seenVoiceProfiles.set(dialogue.character, dialogue.voiceProfile);
      }
    }
  }

  for (const [character, voiceProfile] of seenVoiceProfiles) {
    await upsertVideoCharacterVoice(draftId, character, voiceProfile);
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
