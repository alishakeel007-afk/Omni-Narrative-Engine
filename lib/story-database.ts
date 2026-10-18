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
import { evaluateCharacterRuntimeUpdate } from "@/lib/character-consistency";
import type { VideoLanguage } from "@/types/video";
import type { DialogueEmotion } from "@/lib/audio/emotion-informed-delivery";
import type { VideoMediaFreshness } from "@/lib/video-media-freshness";

export type CreateStoryProjectInput = {
  title: string;
  mode: StoryMode;
  draft: {
    title: string;
    genres: string[];
    tones: string[];
    numberOfScenes: number;
    includeNarration?: boolean;
    characters?: CreateCharacterInput[];
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
  const characters = normalizeInitialCharacters(input.draft.characters ?? []);
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
          characters: characters.length > 0 ? {
            create: characters.map((character) => ({
              name: character.name,
              role: character.role,
              personalityTone: character.personalityTone,
              traits: character.traits as Prisma.InputJsonValue,
              voiceStyle: character.voiceStyle,
              appearancePrompt: character.appearancePrompt,
              referenceImageUrl: character.referenceImageUrl,
              voiceSampleUrl: character.voiceSampleUrl,
              sourceType: character.sourceType ?? CharacterSource.TEXT,
            })),
          } : undefined,
        },
      },
    },
    include: {
      drafts: true,
    },
  });
}

/** Keeps one stable persisted identity for each setup character. */
export function normalizeInitialCharacters(characters: CreateCharacterInput[]): CreateCharacterInput[] {
  const seen = new Set<string>();
  return characters.flatMap((character) => {
    const name = character.name.trim();
    const role = character.role.trim();
    const key = name.toLocaleLowerCase();
    if (!name || !role || seen.has(key)) return [];
    seen.add(key);
    return [{ ...character, name, role }];
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
    select: { id: true, appearancePrompt: true, lastSeenScene: true },
  });

  if (!existing) return null; // Character not in DB (e.g. one-off NPC) — skip silently

  const policy = evaluateCharacterRuntimeUpdate({
    existingAppearance: existing.appearancePrompt,
    lastSeenScene: existing.lastSeenScene,
    nextSceneNumber: update.sceneNumber,
  });

  return prisma.character.update({
    where: { id: existing.id },
    data: {
      // A setup-defined appearance is authoritative. The model may fill a
      // blank appearance once, but cannot rewrite an established identity.
      ...(update.visualAppearance && policy.canSetAppearance ? { appearancePrompt: update.visualAppearance } : {}),
      ...(policy.canUpdateState
        ? {
            ...(update.emotionalState ? { currentEmotionalState: update.emotionalState } : {}),
            ...(update.sceneNumber !== undefined ? { lastSeenScene: update.sceneNumber } : {}),
          }
        : {}),
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
  setup?: unknown;
};

export type FullDraftState = {
  projectId: string;
  draftId: string;
  draftVersion: number;
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
    imageUrl: string | null;
    narrationAudioUrl: string | null;
    musicUrl: string | null;
  }>;
  characters: Array<{
    id: string;
    name: string;
    role: string;
    personalityTone: string;
    traits: string[];
    voiceStyle: string | null;
    appearancePrompt: string | null;
    lastSeenScene: number | null;
    currentEmotionalState: string | null;
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
          versionNumber: true,
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
              appearancePrompt: true,
              lastSeenScene: true,
              currentEmotionalState: true,
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
              mediaAssets: {
                select: { type: true, url: true },
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
        setup: progressRaw.setup,
      }
    : null;

  return {
    projectId: project.id,
    draftId: draft.id,
    draftVersion: draft.versionNumber,
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
      imageUrl: s.mediaAssets.find((m) => m.type === MediaType.IMAGE)?.url ?? null,
      narrationAudioUrl: s.mediaAssets.find((m) => m.type === MediaType.AUDIO)?.url ?? null,
      musicUrl: s.mediaAssets.find((m) => m.type === MediaType.MUSIC)?.url ?? null,
    })),
    characters: draft.characters.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      personalityTone: c.personalityTone,
      traits: Array.isArray(c.traits) ? c.traits as string[] : [],
      voiceStyle: c.voiceStyle,
      appearancePrompt: c.appearancePrompt,
      lastSeenScene: c.lastSeenScene,
      currentEmotionalState: c.currentEmotionalState,
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
  returnStage?: string;
  roughIdea: string;
  acceptedStory: string;
  generatedStory: string;
  language: VideoLanguage;
  /** Language that generated the current script; used to prevent cross-language TTS. */
  scriptLanguage?: VideoLanguage;
  /** Editable Video Studio film title; older saved states simply omit it. */
  title?: string;
  logline: string;
  estimatedRuntime: string;
  scenesNeedRegeneration: boolean;
  voiceNeedsRegeneration: boolean;
  videoOutdated: boolean;
  dialogueEmotions?: Record<string, DialogueEmotion>;
  musicDecisions?: Record<string, { outcome: "silence" | "music"; category?: "ambient" | "suspense" | "emotional" | "action" | "hopeful"; reason: string }>;
  mediaFreshness?: VideoMediaFreshness;
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
  const requestedId = typeof voiceProfile === "object" && voiceProfile && "characterId" in voiceProfile
    ? (voiceProfile as { characterId?: unknown }).characterId : undefined;
  const ownedCharacter = typeof requestedId === "string"
    ? await prisma.character.findFirst({ where: { id: requestedId, draftId }, select: { id: true, voiceProfile: true } })
    : null;
  const id = ownedCharacter?.id ?? await ensureVideoCharacter(draftId, name);
  const existing = ownedCharacter ?? await prisma.character.findUnique({ where: { id }, select: { voiceProfile: true } });
  const appearance = typeof voiceProfile === "object" && voiceProfile && "appearance" in voiceProfile
    ? (voiceProfile as { appearance?: unknown }).appearance
    : undefined;

  return prisma.character.update({
    where: { id },
    data: {
      // Keep identity bound to Character.id, never to a mutable display name.
      voiceProfile: { ...(existing?.voiceProfile as Record<string, unknown> ?? {}), ...(voiceProfile as Record<string, unknown>), characterId: id } as Prisma.InputJsonValue,
      ...(typeof appearance === "string" && appearance ? { appearancePrompt: appearance } : {}),
    },
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
  imagePrompt: string;
  estimatedDuration: string;
  dialogues: Array<{
    character: string;
    line: string;
    delivery: string;
    audioUrl?: string;
    position?: number;
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
      imagePrompt: input.imagePrompt,
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
      imagePrompt: input.imagePrompt,
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

/**
 * Saves the Video Studio document as one unit. Scene.id, rather than the
 * mutable sceneNumber, is the reconciliation key so a reorder never moves
 * existing media onto different story content.
 */
export type ReconcileVideoStudioSceneInput = SaveMovieSceneInput & {
  persistenceSceneId?: string;
  generatedImageUrl?: string;
  generatedImagePrompt?: string;
  backgroundMusicUrl?: string;
  backgroundMusicPrompt?: string;
  backgroundMusicProvider?: string;
  narrationAudioUrl?: string;
};

export async function reconcileVideoStudioScenes(params: {
  draftId: string;
  flowState: VideoStudioStateInput;
  scenes: ReconcileVideoStudioSceneInput[];
  voiceProfiles: Map<string, unknown>;
}) {
  const submittedNumbers = new Set<number>();
  const submittedIds = new Set<string>();
  for (const scene of params.scenes) {
    if (submittedNumbers.has(scene.sceneNumber)) throw new Error("Each submitted scene must have a unique scene number.");
    submittedNumbers.add(scene.sceneNumber);
    if (scene.persistenceSceneId) {
      if (submittedIds.has(scene.persistenceSceneId)) throw new Error("A submitted scene identity was used more than once.");
      submittedIds.add(scene.persistenceSceneId);
    }
  }

  return prisma.$transaction(async (tx) => {
    const existingScenes = await tx.scene.findMany({ where: { draftId: params.draftId }, select: { id: true, sceneNumber: true } });
    const existingById = new Map(existingScenes.map((scene) => [scene.id, scene]));
    for (const id of submittedIds) {
      if (!existingById.has(id)) throw new Error("A submitted scene does not belong to this draft.");
    }

    // Release the unique (draftId, sceneNumber) slots before assigning the
    // requested display order. Negative values are only visible inside this
    // transaction and never reach the client.
    await Promise.all(existingScenes.map((scene, index) => tx.scene.update({ where: { id: scene.id }, data: { sceneNumber: -1_000_000 - index } })));
    await tx.storyDraft.update({ where: { id: params.draftId }, data: { videoStudioState: params.flowState as unknown as Prisma.InputJsonValue } });

    const keptSceneIds = new Set<string>();
    const sceneIds: Record<number, string> = {};
    const savedScenes = await Promise.all(params.scenes.map(async (input) => {
      const data = {
        sceneNumber: input.sceneNumber, title: input.title, description: input.narration, location: input.location, mood: input.mood,
        directorNotes: input.directorNotes, sceneGenre: input.sceneGenre, sceneTone: input.sceneTone, soundDesign: input.soundDesign,
        visualPrompt: input.visualPrompt, imagePrompt: input.imagePrompt, estimatedDuration: input.estimatedDuration,
      };
      const scene = input.persistenceSceneId
        ? await tx.scene.update({ where: { id: input.persistenceSceneId }, data, select: { id: true } })
        : await tx.scene.create({ data: { draftId: params.draftId, ...data }, select: { id: true } });
      keptSceneIds.add(scene.id);
      sceneIds[input.sceneNumber] = scene.id;
      return { input, sceneId: scene.id };
    }));

    // This used to perform one lookup and one insert for every dialogue line
    // while the interactive transaction was open. On a remote Supabase
    // connection, that can exceed Prisma's transaction deadline before the
    // next scene's deleteMany runs (P2028). Resolve characters once and write
    // all replacement dialogue rows in batches instead.
    const requestedCharacters = new Map<string, string>();
    for (const { input } of savedScenes) {
      for (const dialogue of input.dialogues) {
        const name = dialogue.character.trim();
        if (dialogue.line.trim() && name) requestedCharacters.set(name.toLocaleLowerCase(), name);
      }
    }
    for (const [name] of params.voiceProfiles) {
      const trimmed = name.trim();
      if (trimmed) requestedCharacters.set(trimmed.toLocaleLowerCase(), trimmed);
    }

    const existingCharacters = await tx.character.findMany({
      where: { draftId: params.draftId },
      select: { id: true, name: true, voiceProfile: true },
    });
    const charactersByName = new Map(existingCharacters.map((character) => [character.name.toLocaleLowerCase(), character]));
    const missingCharacterNames = [...requestedCharacters.entries()]
      .filter(([key]) => !charactersByName.has(key))
      .map(([, name]) => name);
    const createdCharacters = await Promise.all(missingCharacterNames.map((name) => tx.character.create({
      data: { draftId: params.draftId, name, role: "Character", personalityTone: "", traits: [] as Prisma.InputJsonValue, sourceType: CharacterSource.TEXT },
      select: { id: true, name: true, voiceProfile: true },
    })));
    for (const character of createdCharacters) charactersByName.set(character.name.toLocaleLowerCase(), character);

    const activeSceneIds = savedScenes.map(({ sceneId }) => sceneId);
    await tx.dialogue.deleteMany({ where: { sceneId: { in: activeSceneIds } } });
    const replacementDialogues = savedScenes.flatMap(({ input, sceneId }) => input.dialogues
      .filter((dialogue) => dialogue.line.trim())
      .map((dialogue, position) => ({
        sceneId,
        characterId: charactersByName.get(dialogue.character.trim().toLocaleLowerCase())?.id,
        text: dialogue.line,
        delivery: dialogue.delivery,
        audioUrl: dialogue.audioUrl,
        position: Number.isSafeInteger(dialogue.position) && (dialogue.position ?? -1) >= 0
          ? dialogue.position!
          : position,
      })));
    if (replacementDialogues.length) await tx.dialogue.createMany({ data: replacementDialogues });

    const mediaRequests = savedScenes.flatMap(({ input, sceneId }) => [
      input.generatedImageUrl ? { sceneId, type: MediaType.IMAGE, url: input.generatedImageUrl, prompt: input.generatedImagePrompt, provider: "AI Visual Engine" } : null,
      input.backgroundMusicUrl ? { sceneId, type: MediaType.MUSIC, url: input.backgroundMusicUrl, prompt: input.backgroundMusicPrompt, provider: input.backgroundMusicProvider ?? "Saved music asset" } : null,
      input.narrationAudioUrl ? { sceneId, type: MediaType.AUDIO, url: input.narrationAudioUrl, prompt: input.narration.slice(0, 300), provider: params.flowState.scriptLanguage === "ur" ? "ElevenLabs Eleven v3" : "Deepgram TTS" } : null,
    ].filter((request): request is NonNullable<typeof request> => Boolean(request)));
    if (mediaRequests.length) {
      const existingMedia = await tx.mediaAsset.findMany({
        where: { draftId: params.draftId, sceneId: { in: activeSceneIds }, type: { in: [MediaType.IMAGE, MediaType.MUSIC, MediaType.AUDIO] } },
        select: { id: true, sceneId: true, type: true },
      });
      const mediaBySceneAndType = new Map(existingMedia.map((media) => [`${media.sceneId}:${media.type}`, media]));
      await Promise.all(mediaRequests.map((request) => {
        const existing = mediaBySceneAndType.get(`${request.sceneId}:${request.type}`);
        const data = { url: request.url, prompt: request.prompt, provider: request.provider, status: MediaStatus.READY };
        return existing
          ? tx.mediaAsset.update({ where: { id: existing.id }, data })
          : tx.mediaAsset.create({ data: { draftId: params.draftId, sceneId: request.sceneId, type: request.type, ...data } });
      }));
    }

    const removedIds = existingScenes.filter((scene) => !keptSceneIds.has(scene.id)).map((scene) => scene.id);
    if (removedIds.length) {
      // Preserve storage objects and detached database records for recovery;
      // only their active-scene association is removed before deleting scenes.
      await tx.mediaAsset.updateMany({ where: { sceneId: { in: removedIds } }, data: { sceneId: null } });
      await tx.storyMemory.updateMany({ where: { sceneId: { in: removedIds } }, data: { sceneId: null } });
      await tx.scene.deleteMany({ where: { id: { in: removedIds }, draftId: params.draftId } });
    }

    await Promise.all([...params.voiceProfiles].flatMap(([name, voiceProfile]) => {
      const character = charactersByName.get(name.trim().toLocaleLowerCase());
      if (!character) return [];
      return [tx.character.update({
        where: { id: character.id },
        data: { voiceProfile: { ...(character.voiceProfile as Record<string, unknown> ?? {}), ...(voiceProfile as Record<string, unknown>), characterId: character.id } as Prisma.InputJsonValue },
      })];
    }));
    return { sceneIds };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
}

async function upsertSceneMediaAsset(params: {
  draftId: string;
  sceneId: string;
  type: MediaType;
  url: string;
  prompt?: string;
  provider?: string;
  storagePath?: string;
}) {
  const existing = await prisma.mediaAsset.findFirst({
    where: { draftId: params.draftId, sceneId: params.sceneId, type: params.type },
    select: { id: true },
  });

  if (existing) {
    return prisma.mediaAsset.update({
      where: { id: existing.id },
      data: {
        url: params.url,
        prompt: params.prompt,
        provider: params.provider,
        ...(params.storagePath ? { storagePath: params.storagePath } : {}),
        status: MediaStatus.READY,
      },
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
      storagePath: params.storagePath,
      status: MediaStatus.READY,
    },
  });
}

export async function saveSceneImage(draftId: string, sceneNumber: number, params: { url: string; prompt?: string; provider?: string; storagePath?: string }) {
  const scene = await prisma.scene.findUnique({
    where: { draftId_sceneNumber: { draftId, sceneNumber } },
    select: { id: true },
  });
  if (!scene) return null;
  return upsertSceneMediaAsset({ draftId, sceneId: scene.id, type: MediaType.IMAGE, ...params });
}

/** Saves media against the immutable Scene.id after an owned target was resolved. */
export async function saveSceneImageById(draftId: string, sceneId: string, params: { url: string; prompt?: string; provider?: string; storagePath?: string }) {
  const scene = await prisma.scene.findFirst({ where: { id: sceneId, draftId }, select: { id: true } });
  if (!scene) return null;
  return upsertSceneMediaAsset({ draftId, sceneId: scene.id, type: MediaType.IMAGE, ...params });
}

export async function saveSceneMusic(draftId: string, sceneNumber: number, params: { url: string; prompt?: string; provider?: string; storagePath?: string }) {
  const scene = await prisma.scene.findUnique({
    where: { draftId_sceneNumber: { draftId, sceneNumber } },
    select: { id: true },
  });
  if (!scene) return null;
  return upsertSceneMediaAsset({ draftId, sceneId: scene.id, type: MediaType.MUSIC, ...params });
}

/**
 * Atomically replaces a scene's music record. The caller deletes the returned
 * old storage objects only after this transaction has committed successfully.
 */
export async function replaceSceneMusic(
  draftId: string,
  sceneNumber: number,
  params: { url: string; prompt?: string; provider?: string; storagePath: string },
) {
  return prisma.$transaction(async (tx) => {
    const scene = await tx.scene.findUnique({
      where: { draftId_sceneNumber: { draftId, sceneNumber } },
      select: { id: true },
    });
    if (!scene) return null;

    const existing = await tx.mediaAsset.findMany({
      where: { draftId, sceneId: scene.id, type: MediaType.MUSIC },
      select: { id: true, storagePath: true },
      orderBy: { createdAt: "asc" },
    });
    const active = existing[0];
    const asset = active
      ? await tx.mediaAsset.update({
          where: { id: active.id },
          data: { ...params, status: MediaStatus.READY },
        })
      : await tx.mediaAsset.create({
          data: { draftId, sceneId: scene.id, type: MediaType.MUSIC, ...params, status: MediaStatus.READY },
        });

    if (existing.length > 1) {
      await tx.mediaAsset.deleteMany({ where: { id: { in: existing.slice(1).map((item) => item.id) } } });
    }
    return { asset, replacedStoragePaths: existing.map((item) => item.storagePath).filter((path): path is string => Boolean(path)) };
  }, { isolationLevel: "Serializable" });
}

export async function saveSceneNarration(draftId: string, sceneNumber: number, params: { url: string; prompt?: string; provider?: string; storagePath?: string }) {
  const scene = await prisma.scene.findUnique({
    where: { draftId_sceneNumber: { draftId, sceneNumber } },
    select: { id: true },
  });
  if (!scene) return null;
  return upsertSceneMediaAsset({ draftId, sceneId: scene.id, type: MediaType.AUDIO, ...params });
}

/** Resolves a persisted scene only when its project belongs to the caller. */
export function getOwnedSceneMediaTarget(draftId: string, sceneNumber: number, userId: string) {
  return prisma.scene.findFirst({
    where: {
      draftId,
      sceneNumber,
      draft: { project: { userId } },
    },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      mood: true,
      directorNotes: true,
      visualPrompt: true,
      imagePrompt: true,
      dialogues: { select: { character: { select: { name: true } } } },
      draft: {
        select: {
          storyProjectId: true,
          videoStudioState: true,
          characters: { select: { id: true, name: true, appearancePrompt: true, role: true, personalityTone: true, voiceProfile: true } },
        },
      },
    },
  });
}

/** Like getOwnedSceneMediaTarget, but independent from the mutable display order. */
export function getOwnedSceneMediaTargetById(draftId: string, sceneId: string, userId: string) {
  return prisma.scene.findFirst({
    where: { id: sceneId, draftId, draft: { project: { userId } } },
    select: {
      id: true,
      title: true,
      description: true,
      location: true,
      mood: true,
      directorNotes: true,
      visualPrompt: true,
      imagePrompt: true,
      dialogues: { select: { character: { select: { name: true } } } },
      draft: {
        select: {
          storyProjectId: true,
          videoStudioState: true,
          characters: { select: { id: true, name: true, appearancePrompt: true, role: true, personalityTone: true, voiceProfile: true } },
        },
      },
    },
  });
}

export type FullVideoStudioState = {
  projectId: string;
  draftId: string;
  videoStudioState: VideoStudioStateInput | null;
  genres: string[];
  tones: string[];
  scenes: Array<{
    id: string;
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
    authoredImagePrompt: string | null;
    estimatedDuration: string | null;
    dialogues: Array<{ id: string; position: number; character: string; line: string; delivery: string | null; audioUrl: string | null }>;
    imageUrl: string | null;
    imagePrompt: string | null;
    musicUrl: string | null;
    musicPrompt: string | null;
    musicProvider: string | null;
  }>;
  characterVoices: Array<{ name: string; voiceProfile: unknown; currentEmotionalState: string | null }>;
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
          characters: { select: { name: true, voiceProfile: true, currentEmotionalState: true } },
          scenes: {
            orderBy: { sceneNumber: "asc" },
            select: {
              id: true,
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
              imagePrompt: true,
              estimatedDuration: true,
              dialogues: {
                orderBy: [{ position: "asc" }, { createdAt: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  position: true,
                  text: true,
                  delivery: true,
                  audioUrl: true,
                  character: { select: { name: true } },
                },
              },
              mediaAssets: {
                select: { type: true, url: true, prompt: true, provider: true },
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
        id: s.id,
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
        authoredImagePrompt: s.imagePrompt,
        estimatedDuration: s.estimatedDuration,
        dialogues: s.dialogues.map((d) => ({
          id: d.id,
          position: d.position,
          character: d.character?.name ?? "Unknown",
          line: d.text,
          delivery: d.delivery,
          audioUrl: d.audioUrl,
        })),
        imageUrl: image?.url ?? null,
        narrationAudioUrl: s.mediaAssets.find((m) => m.type === MediaType.AUDIO)?.url ?? null,
        imagePrompt: image?.prompt ?? null,
        musicUrl: music?.url ?? null,
        musicPrompt: music?.prompt ?? null,
        musicProvider: music?.provider ?? null,
      };
    }),
    characterVoices: draft.characters.map((c) => ({ name: c.name, voiceProfile: c.voiceProfile, currentEmotionalState: c.currentEmotionalState })),
  };
}
