import {
  CharacterSource,
  ChoiceType,
  JobStatus,
  MediaStatus,
  MediaType,
  Prisma,
  StoryMode,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type CreateStoryProjectInput = {
  title: string;
  mode: StoryMode;
  draft: {
    title: string;
    genres: string[];
    tones: string[];
    numberOfScenes: number;
    includeNarration?: boolean;
  };
};

export type CreateCharacterInput = {
  name: string;
  role: string;
  personalityTone: string;
  traits: string[];
  voiceStyle?: string;
  appearancePrompt?: string;
  referenceImageUrl?: string;
  voiceSampleUrl?: string;
  sourceType?: CharacterSource;
};

export type CreateSceneInput = {
  sceneNumber: number;
  title: string;
  description: string;
  location?: string;
  mood?: string;
  selectedSuggestion?: string;
  choices?: Array<{
    choiceText: string;
    choiceType?: ChoiceType;
    selected?: boolean;
    resultText?: string;
  }>;
  dialogues?: Array<{
    characterId?: string;
    text: string;
    delivery?: string;
    audioUrl?: string;
  }>;
};

export function createStoryProjectWithInitialDraft(userId: string, input: CreateStoryProjectInput) {
  return prisma.storyProject.create({
    data: {
      userId,
      title: input.title,
      mode: input.mode,
      drafts: {
        create: {
          title: input.draft.title,
          versionNumber: 1,
          genres: input.draft.genres as Prisma.InputJsonValue,
          tones: input.draft.tones as Prisma.InputJsonValue,
          numberOfScenes: input.draft.numberOfScenes,
          includeNarration: input.draft.includeNarration ?? true,
          isActive: true,
        },
      },
    },
    include: {
      drafts: true,
    },
  });
}

export async function createDraftVersion(storyProjectId: string, baseDraftId?: string) {
  const latestDraft = await prisma.storyDraft.findFirst({
    where: { storyProjectId },
    orderBy: { versionNumber: "desc" },
  });

  const baseDraft = baseDraftId
    ? await prisma.storyDraft.findUnique({ where: { id: baseDraftId } })
    : latestDraft;

  if (!baseDraft) {
    throw new Error("Cannot create a new draft version without an existing draft.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.storyDraft.updateMany({
      where: { storyProjectId },
      data: { isActive: false },
    });

    return tx.storyDraft.create({
      data: {
        storyProjectId,
        versionNumber: (latestDraft?.versionNumber ?? 0) + 1,
        title: baseDraft.title,
        genres: baseDraft.genres as Prisma.InputJsonValue,
        tones: baseDraft.tones as Prisma.InputJsonValue,
        numberOfScenes: baseDraft.numberOfScenes,
        includeNarration: baseDraft.includeNarration,
        isActive: true,
      },
    });
  });
}

export function addCharacterToDraft(draftId: string, input: CreateCharacterInput) {
  return prisma.character.create({
    data: {
      draftId,
      name: input.name,
      role: input.role,
      personalityTone: input.personalityTone,
      traits: input.traits as Prisma.InputJsonValue,
      voiceStyle: input.voiceStyle,
      appearancePrompt: input.appearancePrompt,
      referenceImageUrl: input.referenceImageUrl,
      voiceSampleUrl: input.voiceSampleUrl,
      sourceType: input.sourceType ?? CharacterSource.TEXT,
    },
  });
}

export function addSceneToDraft(draftId: string, input: CreateSceneInput) {
  return prisma.scene.create({
    data: {
      draftId,
      sceneNumber: input.sceneNumber,
      title: input.title,
      description: input.description,
      location: input.location,
      mood: input.mood,
      selectedSuggestion: input.selectedSuggestion,
      choices: input.choices?.length
        ? {
            create: input.choices.map((choice) => ({
              choiceText: choice.choiceText,
              choiceType: choice.choiceType ?? ChoiceType.AI_SUGGESTED,
              selected: choice.selected ?? false,
              resultText: choice.resultText,
            })),
          }
        : undefined,
      dialogues: input.dialogues?.length
        ? {
            create: input.dialogues.map((dialogue) => ({
              characterId: dialogue.characterId,
              text: dialogue.text,
              delivery: dialogue.delivery,
              audioUrl: dialogue.audioUrl,
            })),
          }
        : undefined,
    },
    include: {
      choices: true,
      dialogues: true,
    },
  });
}

export function recordStoryMemory(params: {
  draftId: string;
  sceneId?: string;
  memoryType: string;
  content: string;
  importanceScore?: number;
}) {
  return prisma.storyMemory.create({
    data: {
      draftId: params.draftId,
      sceneId: params.sceneId,
      memoryType: params.memoryType,
      content: params.content,
      importanceScore: params.importanceScore ?? 1,
    },
  });
}

export function recordMediaAsset(params: {
  draftId: string;
  sceneId?: string;
  characterId?: string;
  type: MediaType;
  url?: string;
  storagePath?: string;
  prompt?: string;
  provider?: string;
  status?: MediaStatus;
}) {
  return prisma.mediaAsset.create({
    data: {
      draftId: params.draftId,
      sceneId: params.sceneId,
      characterId: params.characterId,
      type: params.type,
      url: params.url,
      storagePath: params.storagePath,
      prompt: params.prompt,
      provider: params.provider,
      status: params.status ?? MediaStatus.PENDING,
    },
  });
}

export function createVideoGenerationJob(draftId: string) {
  return prisma.videoGenerationJob.create({
    data: {
      draftId,
      status: JobStatus.PENDING,
    },
  });
}

export function updateVideoGenerationJob(
  id: string,
  data: {
    status?: JobStatus;
    outputUrl?: string;
    outputStoragePath?: string;
    errorMessage?: string;
  },
) {
  return prisma.videoGenerationJob.update({
    where: { id },
    data,
  });
}
