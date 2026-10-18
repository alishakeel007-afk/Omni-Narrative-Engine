

// ============================================================
// app/api/video/image/route.ts
// Next.js API route for visual image generation.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateSceneImage } from "@/lib/image/image-service";
import { prisma } from "@/lib/prisma";
import { getOwnedSceneMediaTarget, getOwnedSceneMediaTargetById, saveSceneImage, saveSceneImageById } from "@/lib/story-database";
import { deleteFromSupabaseStorage } from "@/lib/supabase-storage";
import { saveOwnedCustomSceneMedia } from "@/lib/custom-story-media";
import { buildSceneVisualContext, type SceneVisualDirection, type VisualCharacterProfile, type VisualSceneInput } from "@/lib/image/scene-visual-context";

export const runtime = "nodejs";

const MAX_PROMPT_CHARS = 3_000;
const MAX_CHARACTER_COUNT = 20;
const MAX_LIST_VALUE_CHARS = 1_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function boundedString(value: unknown, maximum: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maximum ? trimmed : undefined;
}

/** Blank optional fields are equivalent to omitted fields. Non-string and
 * oversized values remain invalid. This matters for Custom scenes, whose
 * visual planner legitimately has no separate visualPrompt. */
function isInvalidOptionalText(value: unknown, normalized: string | undefined) {
  return value !== undefined && (typeof value !== "string" || (value.trim().length > 0 && !normalized));
}

function boundedStringList(value: unknown, maximumItems: number, maximumItemChars: number): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximumItems) return null;
  const values = value.map((item) => boundedString(item, maximumItemChars));
  return values.some((item) => item === undefined) ? null : values as string[];
}

function profileAppearance(voiceProfile: unknown): string | undefined {
  if (!voiceProfile || typeof voiceProfile !== "object") return undefined;
  const value = (voiceProfile as { appearance?: unknown }).appearance;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function approvedDirection(value: unknown) {
  const record = asRecord(value);
  return record ? {
    primaryLocation: text(record.primaryLocation), composition: text(record.composition), requiredEvent: text(record.requiredEvent),
    visibleCharacterIds: Array.isArray(record.visibleCharacterIds) ? record.visibleCharacterIds.filter((id): id is string => typeof id === "string") : undefined,
  } : undefined;
}

function boundedVisualDirection(value: unknown): SceneVisualDirection | null | undefined {
  if (value === undefined) return undefined;
  const raw = approvedDirection(value);
  if (!raw) return null;
  const primaryLocation = raw.primaryLocation === undefined ? undefined : boundedString(raw.primaryLocation, 500);
  const composition = raw.composition === undefined ? undefined : boundedString(raw.composition, 1_000);
  const requiredEvent = raw.requiredEvent === undefined ? undefined : boundedString(raw.requiredEvent, 1_000);
  const visibleCharacterIds = raw.visibleCharacterIds === undefined
    ? undefined
    : boundedStringList(raw.visibleCharacterIds, MAX_CHARACTER_COUNT, 200);
  if ((raw.primaryLocation !== undefined && !primaryLocation) || (raw.composition !== undefined && !composition) ||
    (raw.requiredEvent !== undefined && !requiredEvent) || !visibleCharacterIds) return null;
  return { primaryLocation, composition, requiredEvent, visibleCharacterIds };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const session = user ? { userId: user.id } : null;

    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid image generation request." }, { status: 400 });
    }
    const {
      sceneId,
      imagePrompt,
      visualPrompt,
      sceneTitle,
      narration,
      storyDescription,
      selectedSuggestion,
      location,
      mood,
      genres,
      existingHash,
      characterNames,
      characterAppearances,
      continuityNotes,
      artStyle,
      draftId,
      sceneNumber,
      projectId,
      transient,
      persistenceSceneId,
      customSceneId,
      visualDirection,
    } = body;

    const hasDraftId = typeof draftId === "string" && Boolean(draftId.trim());
    const hasProjectId = typeof projectId === "string" && UUID_PATTERN.test(projectId);
    const hasSceneNumber = Number.isInteger(sceneNumber) && sceneNumber > 0;
    const hasPersistenceSceneId = typeof persistenceSceneId === "string" && UUID_PATTERN.test(persistenceSceneId);
    const hasCustomSceneId = typeof customSceneId === "string" && Boolean(customSceneId.trim()) && customSceneId.length <= 200;
    const hasAnyPersistentIdentifier = draftId !== undefined || sceneNumber !== undefined || projectId !== undefined;
    const isTransient = transient === true;
    if (hasAnyPersistentIdentifier && (!hasDraftId || (!hasSceneNumber && !hasPersistenceSceneId && !hasCustomSceneId) || isTransient)) {
      return NextResponse.json({ error: "Provide a valid draft and scene target for saved scene media." }, { status: 400 });
    }
    if (!hasAnyPersistentIdentifier && !isTransient) {
      return NextResponse.json({ error: "A saved scene target is required. Browser-local previews must explicitly request transient media." }, { status: 400 });
    }
    if (hasCustomSceneId && !hasProjectId) {
      return NextResponse.json({ error: "Custom scene media requires a valid saved project." }, { status: 400 });
    }

    const safeImagePrompt = boundedString(imagePrompt, MAX_PROMPT_CHARS);
    const safeVisualPrompt = boundedString(visualPrompt, MAX_PROMPT_CHARS);
    const safeSceneTitle = boundedString(sceneTitle, 300);
    const safeNarration = boundedString(narration, MAX_PROMPT_CHARS);
    const safeStoryDescription = boundedString(storyDescription, MAX_PROMPT_CHARS);
    const safeSelectedSuggestion = boundedString(selectedSuggestion, MAX_PROMPT_CHARS);
    const safeLocation = boundedString(location, 500);
    const safeMood = boundedString(mood, 200);
    const safeSceneId = boundedString(sceneId, 200);
    const safeArtStyle = boundedString(artStyle, 300);
    const safeExistingHash = boundedString(existingHash, 256);
    const safeGenres = boundedStringList(genres, 10, 100);
    const safeNames = boundedStringList(characterNames, MAX_CHARACTER_COUNT, 160);
    const safeAppearances = boundedStringList(characterAppearances, MAX_CHARACTER_COUNT, MAX_LIST_VALUE_CHARS);
    const safeContinuityNotes = boundedStringList(continuityNotes, 12, 800);
    const safeVisualDirection = boundedVisualDirection(visualDirection);
    if (!safeGenres || !safeNames || !safeAppearances || !safeContinuityNotes ||
      safeVisualDirection === null ||
      isInvalidOptionalText(imagePrompt, safeImagePrompt) || isInvalidOptionalText(visualPrompt, safeVisualPrompt) ||
      isInvalidOptionalText(narration, safeNarration) || isInvalidOptionalText(storyDescription, safeStoryDescription) ||
      isInvalidOptionalText(selectedSuggestion, safeSelectedSuggestion) ||
      (sceneTitle !== undefined && !safeSceneTitle)) {
      return NextResponse.json({ error: "Image generation fields are invalid or exceed their allowed size." }, { status: 400 });
    }

    // Every caller, including browser-local Interactive Story previews, is
    // normalized through the same visual planner. Persisted targets below
    // replace this request context with the server-owned scene record.
    const requestSceneSource: VisualSceneInput = {
      id: safeSceneId,
      title: safeSceneTitle ?? "Untitled scene",
      narration: safeNarration,
      storyDescription: safeStoryDescription,
      selectedSuggestion: safeSelectedSuggestion,
      imagePrompt: safeImagePrompt,
      visualPrompt: safeVisualPrompt,
      location: safeLocation,
      mood: safeMood,
      dialogueCharacterNames: safeNames,
      visualDirection: safeVisualDirection,
    };
    const requestCharacters: VisualCharacterProfile[] = safeNames.map((name, index) => ({
      name,
      appearance: safeAppearances[index],
    }));

    const target = hasDraftId && (hasSceneNumber || hasPersistenceSceneId)
      ? hasPersistenceSceneId
        ? await getOwnedSceneMediaTargetById(draftId, persistenceSceneId, session.userId)
        : await getOwnedSceneMediaTarget(draftId, sceneNumber, session.userId)
      : null;

    if (hasDraftId && (hasSceneNumber || hasPersistenceSceneId) && !target) {
      return NextResponse.json({ error: "Saved scene not found or access denied." }, { status: 404 });
    }
    if (target && typeof projectId === "string" && projectId !== target.draft.storyProjectId) {
      return NextResponse.json({ error: "Project does not match the requested draft." }, { status: 400 });
    }
    // Custom Mode stores stable browser scene IDs in its account-owned draft
    // snapshot rather than the Guided Scene table. Verify that identity before
    // any provider call or Storage upload.
    let customSceneSource: VisualSceneInput | null = null;
    let customCharacters: VisualCharacterProfile[] = [];
    if (hasDraftId && hasCustomSceneId) {
      const customDraft = await prisma.storyDraft.findFirst({
        where: { id: draftId, storyProjectId: projectId, project: { userId: session.userId }, isActive: true },
        select: { progressState: true },
      });
      const progress = customDraft?.progressState;
      const state = progress && typeof progress === "object" && !Array.isArray(progress)
        ? (progress as Record<string, unknown>).customBuilder : null;
      const snapshot = state && typeof state === "object" && !Array.isArray(state)
        ? (state as Record<string, unknown>).state : null;
      const scenes = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
        ? (snapshot as { scenes?: unknown }).scenes : null;
      const sourceScene = Array.isArray(scenes)
        ? scenes.find((scene) => asRecord(scene)?.id === customSceneId)
        : null;
      if (!sourceScene) {
        return NextResponse.json({ error: "Custom scene not found or access denied." }, { status: 404 });
      }
      const record = asRecord(sourceScene)!;
      customSceneSource = {
        id: customSceneId,
        title: text(record.title) ?? "Untitled scene",
        storyDescription: text(record.storyDescription),
        selectedSuggestion: text(record.selectedSuggestion),
        visualPrompt: text(record.visualPrompt),
        imagePrompt: text(record.imagePrompt),
        location: text(record.location),
        mood: text(record.sceneTone),
        dialogueCharacterNames: Array.isArray(record.dialogues)
          ? record.dialogues.flatMap((dialogue) => text(asRecord(dialogue)?.characterName) ? [text(asRecord(dialogue)?.characterName)!] : [])
          : [],
        activeCharacterIds: Array.isArray(record.activeCharacterIds) ? record.activeCharacterIds.filter((id): id is string => typeof id === "string") : [],
        visualDirection: approvedDirection(record.visualDirection),
      };
      const snapshotRecord = snapshot as Record<string, unknown>;
      const storedCharacters: unknown[] = Array.isArray(snapshotRecord.characters)
        ? snapshotRecord.characters
        : [];
      customCharacters = storedCharacters.flatMap((character) => {
        const candidate = asRecord(character);
        const name = text(candidate?.name);
        return name ? [{ id: text(candidate?.id), name, appearance: text(candidate?.appearance), role: text(candidate?.role), personalityTone: text(candidate?.personalityTone) }] : [];
      });
    }

    const requestedNames = [...new Set(safeNames.map((name) => name.trim()))];
    const suppliedAppearances = safeAppearances;
    const persistedByName = new Map((target?.draft.characters ?? []).map((character) => [character.name.toLocaleLowerCase(), character]));
    // Only characters explicitly present in the scene are included. For those
    // characters, the owned draft is authoritative over stale browser state.
    const resolvedAppearances = requestedNames.map((name, index) => {
      const persisted = persistedByName.get(name.toLocaleLowerCase());
      const appearance = persisted?.appearancePrompt || profileAppearance(persisted?.voiceProfile) || suppliedAppearances[index];
      return appearance ? `${name}: ${appearance.replace(/^\s*[^:]{1,80}:\s*/, "")}` : name;
    });

    if (!safeImagePrompt && !safeVisualPrompt && !safeSceneTitle && !safeNarration && !safeStoryDescription && !safeSelectedSuggestion) {
      return NextResponse.json(
        { error: "Please provide an image prompt or scene visual description." },
        { status: 400 }
      );
    }

    const canonicalContext = target
      ? buildSceneVisualContext({
        scene: {
          id: target.id, title: target.title, narration: target.description, location: target.location ?? undefined,
          mood: target.mood ?? undefined, directorNotes: target.directorNotes ?? undefined,
          visualPrompt: target.visualPrompt ?? undefined, imagePrompt: target.imagePrompt ?? undefined,
          dialogueCharacterNames: target.dialogues.flatMap((dialogue) => dialogue.character?.name ? [dialogue.character.name] : []),
          visualDirection: approvedDirection(asRecord(target.draft.videoStudioState)?.visualDirections && asRecord(asRecord(target.draft.videoStudioState)?.visualDirections)?.[target.id]),
        },
        characters: target.draft.characters.map((character) => ({
          id: character.id, name: character.name, appearance: character.appearancePrompt ?? profileAppearance(character.voiceProfile), role: character.role, personalityTone: character.personalityTone,
        })),
      })
      : customSceneSource
        ? buildSceneVisualContext({ scene: customSceneSource, characters: customCharacters })
        : buildSceneVisualContext({ scene: requestSceneSource, characters: requestCharacters });

    try {
      const result = await generateSceneImage({
        sceneId: target?.id || (hasCustomSceneId ? customSceneId : safeSceneId) || `preview-${crypto.randomUUID()}`,
        // Saved project targets always derive from the server-owned scene
        // source. Browser values remain only for explicitly transient previews.
        imagePrompt: canonicalContext?.imagePrompt ?? safeImagePrompt ?? "",
        visualPrompt: canonicalContext?.visualPrompt ?? safeVisualPrompt,
        sceneTitle: canonicalContext?.brief.sceneTitle ?? safeSceneTitle,
        location: canonicalContext?.location ?? safeLocation,
        mood: canonicalContext?.mood ?? safeMood,
        genres: safeGenres,
        existingHash: safeExistingHash,
        projectId: target?.draft.storyProjectId || (hasCustomSceneId ? projectId : undefined),
        persist: !isTransient,
        characterNames: canonicalContext?.characterNames ?? requestedNames,
        characterAppearances: canonicalContext?.characterAppearances ?? resolvedAppearances,
        continuityNotes: canonicalContext?.continuityNotes ?? safeContinuityNotes,
        artStyle: safeArtStyle,
        visualBrief: canonicalContext?.brief,
      });

      if (hasDraftId && hasCustomSceneId && hasProjectId) {
        const saved = await saveOwnedCustomSceneMedia({
          draftId,
          projectId,
          sceneId: customSceneId,
          userId: session.userId,
          patch: {
            generatedImageError: undefined,
            generatedImagePrompt: result.prompt,
            generatedImageStatus: "ready",
            generatedImageUrl: result.url,
          },
        }).catch(() => false);
        if (!saved) {
          // Only remove the just-uploaded, server-created object. Existing
          // project media is never derived from a client URL or deleted here.
          if (result.storagePath) {
            await deleteFromSupabaseStorage({ bucket: "images", path: result.storagePath.replace(/^images\//, "") }).catch(() => undefined);
          }
          return NextResponse.json({ error: "Could not attach this image to the Custom project. No image was saved." }, { status: 409 });
        }
      }

      if (hasDraftId && (hasSceneNumber || hasPersistenceSceneId)) {
        const saveParams = {
          url: result.url,
          prompt: result.prompt,
          provider: result.provider,
          storagePath: result.storagePath,
        };
        if (hasPersistenceSceneId) await saveSceneImageById(draftId, persistenceSceneId, saveParams);
        else await saveSceneImage(draftId, sceneNumber, saveParams);
      }

      return NextResponse.json({
        success: true,
        imageUrl: result.url,
        prompt: result.prompt,
        hash: result.hash,
        provider: result.provider,
        visualBrief: canonicalContext?.brief,
      });
    } catch (error: any) {
      if (error.message === "DUPLICATE") {
        return NextResponse.json({
          success: true,
          duplicate: true,
          hash: existingHash,
        });
      }
      throw error;
    }
  } catch {
    // Do not reflect provider response bodies or request detail to clients.
    console.error("Visual image generation error");
    return NextResponse.json(
      { success: false, error: "Visual generation could not be completed. Please try again." },
      { status: 500 }
    );
  }
}
