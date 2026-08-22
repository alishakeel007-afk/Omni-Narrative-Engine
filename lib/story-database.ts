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

/**
 * Fetch all characters for a draft with full identity fields.
 */
export function getCharactersForDraft(draftId: string) {
  return prisma.character.findMany({
    where: { draftId },
    select: {
      id: true,
      name: true,
      role: true,
      personalityTone: true,
      traits: true,
      voiceStyle: true,
      appearancePrompt: true,
      referenceImageUrl: true,
      voiceSampleUrl: true,
      sourceType: true,
      lastSeenScene: true,
      currentEmotionalState: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Update a character's runtime identity state after a scene is generated.
 * Matches by draftId + name (case-insensitive). Silently skips unknown characters.
 */
export async function upsertCharacterState(
  draftId: string,
  characterName: string,
  update: {
    emotionalState?: string;
    visualAppearance?: string;
    sceneNumber?: number;
  }
) {
  const existing = await prisma.character.findFirst({
    where: {
      draftId,
      name: { equals: characterName, mode: "insensitive" },
    },
    select: { id: true },
  });

  if (!existing) return null; // Character not in DB (e.g. one-off NPC) — skip silently

  return prisma.character.update({
    where: { id: existing.id },
    data: {
      ...(update.emotionalState ? { currentEmotionalState: update.emotionalState } : {}),
      ...(update.visualAppearance ? { appearancePrompt: update.visualAppearance } : {}),
      ...(update.sceneNumber !== undefined ? { lastSeenScene: update.sceneNumber } : {}),
    },
  });
}

/**
 * Build a formatted character context block for LLM prompt injection.
 * Includes known visual appearance and last emotional state.
 */
export async function getCharacterContextBlock(draftId: string): Promise<string> {
  const characters = await getCharactersForDraft(draftId);
  if (!characters.length) return "";

  const lines = characters.map((c) => {
    const traits = Array.isArray(c.traits) ? (c.traits as string[]).join(", ") : "";
    const appearance = c.appearancePrompt ? `Visual: ${c.appearancePrompt}.` : "";
    const emotion = c.currentEmotionalState ? `Last known state: ${c.currentEmotionalState}.` : "";
    const lastSeen = c.lastSeenScene ? `Last seen in Scene ${c.lastSeenScene}.` : "";
    return `- ${c.name} (${c.role}): Personality: ${c.personalityTone}. Traits: ${traits}. ${appearance} ${emotion} ${lastSeen}`.trim();
  });

  return `Established Characters (maintain strict consistency for these):\n${lines.join("\n")}`;
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

// ─── Phase 6: Full Draft State Loader ───────────────────────────────────────

export type DraftProgressState = {
  sceneIndex: number;
  health: number;
  mana: number;
  resolve: number;
  inventory: string[];
};

export type FullDraftState = {
  projectId: string;
  draftId: string;
  title: string;
  genres: string[];
  tones: string[];
  numberOfScenes: number;
  progressState: DraftProgressState | null;
  scenes: Array<{
    id: string;
    sceneNumber: number;
    title: string;
    description: string;
    location: string | null;
    mood: string | null;
    choices: Array<{
      id: string;
      choiceText: string;
      choiceType: string;
      selected: boolean;
      resultText: string | null;
    }>;
  }>;
  characters: Array<{
    id: string;
    name: string;
    role: string;
    personalityTone: string;
    traits: string[];
    voiceStyle: string | null;
  }>;
  memories: Array<{
    id: string;
    memoryType: string;
    content: string;
    importanceScore: number;
  }>;
};

/**
 * Assembles the complete, restorable story state for a given draft.
 * Keeps API routes thin by centralizing all query logic here.
 */
export async function loadFullDraftState(
  projectId: string,
  userId: string
): Promise<FullDraftState | null> {
  // Ownership check: find project AND active draft in one query
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true,
      drafts: {
        where: { isActive: true },
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          id: true,
          title: true,
          genres: true,
          tones: true,
          numberOfScenes: true,
          progressState: true,
          characters: {
            select: {
              id: true,
              name: true,
              role: true,
              personalityTone: true,
              traits: true,
              voiceStyle: true,
            },
          },
          scenes: {
            orderBy: { sceneNumber: "asc" },
            select: {
              id: true,
              sceneNumber: true,
              title: true,
              description: true,
              location: true,
              mood: true,
              choices: {
                select: {
                  id: true,
                  choiceText: true,
                  choiceType: true,
                  selected: true,
                  resultText: true,
                },
              },
            },
          },
          memories: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              memoryType: true,
              content: true,
              importanceScore: true,
            },
          },
        },
      },
    },
  });

  if (!project || project.drafts.length === 0) return null;

  const draft = project.drafts[0];
  const progressRaw = draft.progressState as Record<string, unknown> | null;

  const progressState: DraftProgressState | null = progressRaw
    ? {
        sceneIndex: Number(progressRaw.sceneIndex ?? 0),
        health: Number(progressRaw.health ?? 100),
        mana: Number(progressRaw.mana ?? 100),
        resolve: Number(progressRaw.resolve ?? 100),
        inventory: Array.isArray(progressRaw.inventory) ? progressRaw.inventory as string[] : [],
      }
    : null;

  return {
    projectId: project.id,
    draftId: draft.id,
    title: draft.title,
    genres: Array.isArray(draft.genres) ? draft.genres as string[] : [],
    tones: Array.isArray(draft.tones) ? draft.tones as string[] : [],
    numberOfScenes: draft.numberOfScenes,
    progressState,
    scenes: draft.scenes.map((s) => ({
      id: s.id,
      sceneNumber: s.sceneNumber,
      title: s.title,
      description: s.description,
      location: s.location,
      mood: s.mood,
      choices: s.choices.map((c) => ({
        id: c.id,
        choiceText: c.choiceText,
        choiceType: c.choiceType,
        selected: c.selected,
        resultText: c.resultText,
      })),
    })),
    characters: draft.characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      personalityTone: c.personalityTone,
      traits: Array.isArray(c.traits) ? c.traits as string[] : [],
      voiceStyle: c.voiceStyle,
    })),
    memories: draft.memories.map((m) => ({
      id: m.id,
      memoryType: m.memoryType,
      content: m.content,
      importanceScore: m.importanceScore,
    })),
  };
}

// ─── Video Studio Persistence ───────────────────────────────────────────────

export type VideoStudioStateInput = {
  stage: string;
  roughIdea: string;
  acceptedStory: string;
  generatedStory: string;
  logline: string;
  estimatedRuntime: string;
  scenesNeedRegeneration: boolean;
  voiceNeedsRegeneration: boolean;
  videoOutdated: boolean;
};

export function saveVideoStudioFlowMeta(draftId: string, state: VideoStudioStateInput) {
  return prisma.storyDraft.update({
    where: { id: draftId },
    data: { videoStudioState: state as unknown as Prisma.InputJsonValue },
  });
}

async function ensureVideoCharacter(draftId: string, name: string) {
  const existing = await prisma.character.findFirst({
    where: { draftId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.character.create({
    data: {
      draftId,
      name,
      role: "Character",
      personalityTone: "",
      traits: [] as Prisma.InputJsonValue,
      sourceType: CharacterSource.TEXT,
    },
    select: { id: true },
  });
  return created.id;
}

export async function upsertVideoCharacterVoice(draftId: string, name: string, voiceProfile: unknown) {
  const id = await ensureVideoCharacter(draftId, name);
  return prisma.character.update({
    where: { id },
    data: { voiceProfile: voiceProfile as Prisma.InputJsonValue },
  });
}

export type SaveMovieSceneInput = {
  sceneNumber: number;
  title: string;
  narration: string;
  location: string;
  mood: string;
  directorNotes: string;
  sceneGenre: string;
  sceneTone: string;
  soundDesign: string;
  visualPrompt: string;
  estimatedDuration: string;
  dialogues: Array<{
    character: string;
    line: string;
    delivery: string;
    audioUrl?: string;
  }>;
};

export async function saveMovieScene(draftId: string, input: SaveMovieSceneInput) {
  const scene = await prisma.scene.upsert({
    where: { draftId_sceneNumber: { draftId, sceneNumber: input.sceneNumber } },
    create: {
      draftId,
      sceneNumber: input.sceneNumber,
      title: input.title,
      description: input.narration,
      location: input.location,
      mood: input.mood,
      directorNotes: input.directorNotes,
      sceneGenre: input.sceneGenre,
      sceneTone: input.sceneTone,
      soundDesign: input.soundDesign,
      visualPrompt: input.visualPrompt,
      estimatedDuration: input.estimatedDuration,
    },
    update: {
      title: input.title,
      description: input.narration,
      location: input.location,
      mood: input.mood,
      directorNotes: input.directorNotes,
      sceneGenre: input.sceneGenre,
      sceneTone: input.sceneTone,
      soundDesign: input.soundDesign,
      visualPrompt: input.visualPrompt,
      estimatedDuration: input.estimatedDuration,
    },
    select: { id: true },
  });

  // Dialogue lines don't have a stable identity across regenerations, so each
  // save replaces the full set for this scene rather than trying to diff-upsert.
  await prisma.dialogue.deleteMany({ where: { sceneId: scene.id } });

  for (const dialogue of input.dialogues) {
    if (!dialogue.line.trim()) continue;
    const characterId = await ensureVideoCharacter(draftId, dialogue.character);
    await prisma.dialogue.create({
      data: {
        sceneId: scene.id,
        characterId,
        text: dialogue.line,
        delivery: dialogue.delivery,
        audioUrl: dialogue.audioUrl,
      },
    });
  }

  return scene;
}

async function upsertSceneMediaAsset(params: {
  draftId: string;
  sceneId: string;
  type: MediaType;
  url: string;
  prompt?: string;
  provider?: string;
}) {
  const existing = await prisma.mediaAsset.findFirst({
    where: { draftId: params.draftId, sceneId: params.sceneId, type: params.type },
    select: { id: true },
  });

  if (existing) {
    return prisma.mediaAsset.update({
      where: { id: existing.id },
      data: { url: params.url, prompt: params.prompt, provider: params.provider, status: MediaStatus.READY },
    });
  }

  return prisma.mediaAsset.create({
    data: {
      draftId: params.draftId,
      sceneId: params.sceneId,
      type: params.type,
      url: params.url,
      prompt: params.prompt,
      provider: params.provider,
      status: MediaStatus.READY,
    },
  });
}

export async function saveSceneImage(draftId: string, sceneNumber: number, params: { url: string; prompt?: string; provider?: string }) {
  const scene = await prisma.scene.findUnique({
    where: { draftId_sceneNumber: { draftId, sceneNumber } },
    select: { id: true },
  });
  if (!scene) return null;
  return upsertSceneMediaAsset({ draftId, sceneId: scene.id, type: MediaType.IMAGE, ...params });
}

export async function saveSceneMusic(draftId: string, sceneNumber: number, params: { url: string; prompt?: string; provider?: string }) {
  const scene = await prisma.scene.findUnique({
    where: { draftId_sceneNumber: { draftId, sceneNumber } },
    select: { id: true },
  });
  if (!scene) return null;
  return upsertSceneMediaAsset({ draftId, sceneId: scene.id, type: MediaType.MUSIC, ...params });
}

export type FullVideoStudioState = {
  projectId: string;
  draftId: string;
  videoStudioState: VideoStudioStateInput | null;
  genres: string[];
  tones: string[];
  scenes: Array<{
    sceneNumber: number;
    title: string;
    narration: string;
    location: string | null;
    mood: string | null;
    directorNotes: string | null;
    sceneGenre: string | null;
    sceneTone: string | null;
    soundDesign: string | null;
    visualPrompt: string | null;
    estimatedDuration: string | null;
    dialogues: Array<{ character: string; line: string; delivery: string | null; audioUrl: string | null }>;
    imageUrl: string | null;
    imagePrompt: string | null;
    musicUrl: string | null;
    musicPrompt: string | null;
  }>;
  characterVoices: Array<{ name: string; voiceProfile: unknown }>;
};

export async function loadFullVideoStudioState(
  projectId: string,
  userId: string
): Promise<FullVideoStudioState | null> {
  const project = await prisma.storyProject.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true,
      drafts: {
        where: { isActive: true },
        orderBy: { versionNumber: "desc" },
        take: 1,
        select: {
          id: true,
          genres: true,
          tones: true,
          videoStudioState: true,
          characters: { select: { name: true, voiceProfile: true } },
          scenes: {
            orderBy: { sceneNumber: "asc" },
            select: {
              sceneNumber: true,
              title: true,
              description: true,
              location: true,
              mood: true,
              directorNotes: true,
              sceneGenre: true,
              sceneTone: true,
              soundDesign: true,
              visualPrompt: true,
              estimatedDuration: true,
              dialogues: {
                select: {
                  text: true,
                  delivery: true,
                  audioUrl: true,
                  character: { select: { name: true } },
                },
              },
              mediaAssets: {
                select: { type: true, url: true, prompt: true },
              },
            },
          },
        },
      },
    },
  });

  if (!project || project.drafts.length === 0) return null;
  const draft = project.drafts[0];

  return {
    projectId: project.id,
    draftId: draft.id,
    videoStudioState: (draft.videoStudioState as unknown as VideoStudioStateInput) ?? null,
    genres: Array.isArray(draft.genres) ? (draft.genres as string[]) : [],
    tones: Array.isArray(draft.tones) ? (draft.tones as string[]) : [],
    scenes: draft.scenes.map((s) => {
      const image = s.mediaAssets.find((m) => m.type === MediaType.IMAGE);
      const music = s.mediaAssets.find((m) => m.type === MediaType.MUSIC);
      return {
        sceneNumber: s.sceneNumber,
        title: s.title,
        narration: s.description,
        location: s.location,
        mood: s.mood,
        directorNotes: s.directorNotes,
        sceneGenre: s.sceneGenre,
        sceneTone: s.sceneTone,
        soundDesign: s.soundDesign,
        visualPrompt: s.visualPrompt,
        estimatedDuration: s.estimatedDuration,
        dialogues: s.dialogues.map((d) => ({
          character: d.character?.name ?? "Unknown",
          line: d.text,
          delivery: d.delivery,
          audioUrl: d.audioUrl,
        })),
        imageUrl: image?.url ?? null,
        imagePrompt: image?.prompt ?? null,
        musicUrl: music?.url ?? null,
        musicPrompt: music?.prompt ?? null,
      };
    }),
    characterVoices: draft.characters.map((c) => ({ name: c.name, voiceProfile: c.voiceProfile })),
  };
}
