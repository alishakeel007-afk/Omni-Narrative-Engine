import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { loadStudio, saveStudio, StudioError } from "@/lib/studio/store";
import { directorReply } from "@/lib/studio/ai";
import { approvePlan, chatImageRequest } from "@/lib/studio/logic";
import {
  archiveTake,
  generateVoices,
  magicHour,
  startMedia,
  startChatImage,
} from "@/lib/studio/media";
import { generateSceneMusic } from "@/lib/audio/music-service";
import { DEFAULT_STUDIO_EDIT, MAX_STORY_CHARACTERS, MAX_STORY_SCENES, sceneEdit, type StudioMessage } from "@/types/studio";
import {
  characterReferences,
  continuityProblem,
  sceneSetContinuityProblem,
} from "@/lib/studio/identity";
import { reviewTake } from "@/lib/studio/continuity";
import { pollQwenImage } from "@/lib/studio/qwen";
import { pollLtxVideo, nativeVideoEnabled } from "@/lib/studio/ltx";
import { studioEditSchema, textOverlaySchema } from "@/lib/studio/edits";
import {
  applyFilmScript,
  assistTurn,
  detectScriptCast,
  directScenes,
  fillSceneDirection,
  generateFilmScript,
  type AssistReply,
} from "@/lib/film/ai";
import {
  clipCapability,
  clipLengthProblem,
  clipSeconds as resolveClipSeconds,
  generationLockMs,
} from "@/lib/film/duration";
import { beatProblem } from "@/lib/film/shots";
import { assembleClips, filmGeneration } from "@/lib/film/generate";
import { generationBlockedReason } from "@/lib/film/language";
import {
  deleteClip,
  markStaleClips,
  moveClip,
  patchClip,
  pushHistory,
  redo as redoEdit,
  relinkClips,
  splitClip,
  trimClip,
  undo as undoEdit,
} from "@/lib/film/edit";
import { listSceneJobs } from "@/lib/studio/scene-jobs";
import type { SceneJob, StudioTake } from "@/types/studio";

export const runtime = "nodejs";
export const maxDuration = 180;
type Context = { params: Promise<{ id: string }> };
const editSchema = studioEditSchema;
const creativeBriefSchema = z.object({
  audience: z.string().max(500).optional(), purpose: z.string().max(500).optional(),
  tone: z.string().max(500).optional(), genre: z.string().max(500).optional(), ending: z.string().max(1500).optional(),
}).strict();
const directionSchema = z.object({
  location: z.string().max(1000).optional(), timeOfDay: z.string().max(200).optional(),
  lighting: z.string().max(1000).optional(), props: z.string().max(1000).optional(),
  camera: z.string().max(1000).optional(), delivery: z.string().max(1000).optional(),
  music: z.string().max(1000).optional(), ambience: z.string().max(1000).optional(), soundEffects: z.string().max(1000).optional(),
  background: z.string().max(1000).optional(),
  wardrobe: z.record(z.string().max(100), z.string().max(1000)).optional(),
  expression: z.record(z.string().max(100), z.string().max(1000)).optional(),
}).strict();
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("detectCast") }),
  z.object({ action: z.literal("autoDirect"), requestId: z.string().uuid() }),
  z.object({ action: z.literal("answerGenerateAll"), offerId: z.string().uuid() }),
  z.object({ action: z.literal("createCharacter"), name: z.string().trim().min(1).max(100), appearance: z.string().max(5000).default("") }),
  z.object({ action: z.literal("removeCharacter"), characterId: z.string().max(100) }),
  z.object({ action: z.literal("lockCharacters") }),
  z.object({ action: z.literal("generatePortrait"), characterId: z.string().max(100), requestId: z.string().uuid() }),
  z.object({ action: z.literal("sceneList"), operation: z.enum(["add", "remove", "move", "undo"]),
    sceneId: z.string().max(100).optional(), toIndex: z.number().int().min(0).max(23).optional() }),
  z.object({ action: z.literal("undoScript") }),
  z.object({
    action: z.literal("chat"),
    text: z.string().trim().min(1).max(24000),
    tab: z.enum(["plan", "scenes", "assemble"]),
    mode: z.enum(["discover", "develop"]).optional(),
    sceneId: z.string().optional(),
  }),
  z.object({ action: z.literal("approve"), messageId: z.string() }),
  z.object({ action: z.literal("generateChatImage"), messageId: z.string() }),
  z.object({
    action: z.literal("reviewTake"),
    sceneId: z.string(),
    takeId: z.string(),
  }),
  z.object({ action: z.literal("reviewChatImage"), messageId: z.string() }),
  z.object({
    action: z.literal("reference"),
    characterId: z.string(),
    referenceId: z.string(),
    operation: z.enum(["primary", "remove"]),
  }),
  z.object({ action: z.literal("applyEdits"), messageId: z.string() }),
  z.object({ action: z.literal("undoEdits") }),
  z.object({
    action: z.literal("character"),
    characterId: z.string(),
    name: z.string().trim().min(1, "Give this character a name.").max(100),
    // Step 2 shows this field directly, so the message has to read as advice.
    appearance: z
      .string()
      .min(10, "Describe how this character looks before saving — hair, build, clothing and one distinctive detail.")
      .max(5000),
    locked: z.boolean(),
    motivation: z.string().max(1500).optional(),
    relationships: z.string().max(1500).optional(),
  }),
  z.object({
    action: z.literal("scene"),
    sceneId: z.string(),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(6000),
    characterIds: z.array(z.string()).max(12),
    dialogues: z
      .array(
        z.object({
          character: z.string().max(100),
          text: z.string().min(1).max(1500),
        }),
      )
      .max(12),
  }),
  z.object({
    action: z.literal("generate"),
    sceneId: z.string(),
    kind: z.enum(["image", "video", "voice", "music"]),
    direct: z.boolean().default(false),
  }),
  z.object({ action: z.literal("poll") }),
  z.object({
    action: z.literal("select"),
    sceneId: z.string(),
    takeId: z.string(),
  }),
  z.object({
    action: z.literal("timeline"),
    sceneIds: z.array(z.string()).max(12),
  }),
  z.object({
    action: z.literal("edit"),
    sceneId: z.string(),
    edit: editSchema,
  }),
  // Four-step workflow. Every field is optional so a step can save just what
  // it owns without resending the rest of the project.
  // Generate or replace the whole script from the idea / pasted script.
  z.object({ action: z.literal("script") }),
  // One scoped assistant turn. Never writes to the project by itself.
  z.object({
    action: z.literal("assist"),
    field: z.enum([
      "idea",
      "title",
      "premise",
      "visualStyle",
      "sceneTitle",
      "visualAction",
      "dialogue",
      "characterAppearance",
      "audience", "purpose", "tone", "genre", "ending",
      "characterName", "motivation", "relationships",
      "location", "timeOfDay", "lighting", "props", "camera", "delivery", "music", "ambience", "soundEffects", "wardrobe", "background", "expression",
      "editAdvice", "overlayText",
    ]),
    sceneId: z.string().max(100).optional(),
    dialogueId: z.string().max(100).optional(),
    characterId: z.string().max(100).optional(),
    message: z.string().max(4000).optional(),
    currentValue: z.string().max(6000).optional(),
    context: z.object({ title: z.string().max(160).optional(), premise: z.string().max(5000).optional(),
      sourceScript: z.string().max(24000).optional(), visualStyle: z.string().max(4000).optional(), creativeBrief: creativeBriefSchema.optional() }).strict().optional(),
  }),
  // Scene and dialogue editing, addressed by stable id.
  z.object({
    action: z.literal("scenePatch"),
    sceneId: z.string().max(100),
    patch: z
      .object({
        title: z.string().trim().max(160).optional(),
        visualAction: z.string().max(6000).optional(),
        characterIds: z.array(z.string().max(100)).max(12).optional(),
        direction: directionSchema.optional(),
        // Per-scene clip length. Clamped to what this deployment allows.
        requestedSeconds: z.number().positive().max(60).nullable().optional(),
      })
      .strict(),
  }),
  // Builds the starting timeline from the generated scenes and opens Step 4.
  z.object({ action: z.literal("assemble") }),
  // Step 4 editing. Every operation is named, so the server validates the
  // intent rather than accepting an arbitrary clip list from the browser.
  z.object({
    action: z.literal("clipEdit"),
    operation: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("trim"),
        clipId: z.string().max(100),
        sourceIn: z.number().min(0).max(600).optional(),
        sourceOut: z.number().min(0).max(600).optional(),
      }),
      z.object({
        kind: z.literal("split"),
        clipId: z.string().max(100),
        filmSeconds: z.number().min(0).max(600),
      }),
      z.object({ kind: z.literal("delete"), clipId: z.string().max(100) }),
      z.object({
        kind: z.literal("move"),
        clipId: z.string().max(100),
        toIndex: z.number().int().min(0).max(23),
      }),
      z.object({
        kind: z.literal("patch"),
        clipId: z.string().max(100),
        patch: z
          .object({
            clipVolume: z.number().min(0).max(1).optional(),
            musicVolume: z.number().min(0).max(1).optional(),
            fadeIn: z.number().min(0).max(5).optional(),
            fadeOut: z.number().min(0).max(5).optional(),
            texts: z.array(textOverlaySchema).max(8).optional(),
          })
          .strict(),
      }),
      // Replacing a clip's source is only ever this, never a side effect.
      z.object({ kind: z.literal("relink") }),
      z.object({ kind: z.literal("removeStale") }),
      z.object({ kind: z.literal("undo") }),
      z.object({ kind: z.literal("redo") }),
    ]),
  }),
  // Internal cuts for one scene. The scene is still generated as ONE video.
  z.object({
    action: z.literal("beats"),
    sceneId: z.string().max(100),
    beats: z
      .array(
        z.object({
          id: z.string().max(100).optional(),
          visualAction: z.string().trim().min(1).max(4000),
          dialogueIds: z.array(z.string().max(100)).max(12).default([]),
        }),
      )
      .max(8)
      .nullable(),
  }),
  z.object({
    action: z.literal("dialogue"),
    sceneId: z.string().max(100),
    operation: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("add"), character: z.string().trim().min(1).max(100), text: z.string().max(1500).default("") }),
      z.object({ kind: z.literal("update"), dialogueId: z.string().max(100), character: z.string().trim().min(1).max(100).optional(), text: z.string().max(1500).optional() }),
      z.object({ kind: z.literal("remove"), dialogueId: z.string().max(100) }),
      z.object({ kind: z.literal("reorder"), dialogueIds: z.array(z.string().max(100)).max(12) }),
    ]),
  }),
  // Urdu only: English speech is generated natively and is not selectable.
  z.object({
    action: z.literal("voice"),
    characterId: z.string().max(100),
    voice: z
      .object({
        archetype: z.string().trim().min(1).max(60),
        gender: z.string().trim().max(30),
        label: z.string().trim().max(100),
      })
      .nullable(),
  }),
  z.object({
    action: z.literal("workflow"),
    patch: z
      .object({
        step: z.enum(["setup", "script", "generate", "edit"]).optional(),
        language: z.enum(["en", "ur"]).optional(),
        assist: z.enum(["guided", "custom"]).optional(),
        format: z.literal("landscape").optional(),
        title: z.string().trim().min(1).max(160).optional(),
        premise: z.string().max(5000).optional(),
        visualStyle: z.string().max(4000).optional(),
        sourceScript: z.string().max(24000).optional(),
        creativeBrief: creativeBriefSchema.optional(),
        directionMode: z.enum(["omni", "director"]).optional(),
        // null clears a count so Omni decides it again.
        storyPlan: z
          .object({
            sceneCount: z.number().int().min(1).max(MAX_STORY_SCENES).nullable().optional(),
            characterCount: z.number().int().min(1).max(MAX_STORY_CHARACTERS).nullable().optional(),
          })
          .strict()
          .optional(),
        // Default clip length for the project. Resolved through
        // lib/film/duration.ts, which clamps it to this deployment's cap.
        clipSeconds: z.number().positive().max(60).optional(),
      })
      .strict(),
  }),
]);
function failure(error: unknown) {
  if (error instanceof z.ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message || "Invalid request." },
      { status: 400 },
    );
  return NextResponse.json(
    {
      error:
        error instanceof StudioError
          ? error.message
          : "The request could not be completed. Please reload and try again.",
    },
    { status: error instanceof StudioError ? error.status : 500 },
  );
}
export async function GET(_req: Request, context: Context) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) throw new StudioError("Unauthorized", 401);
    return NextResponse.json({
      state: (await loadStudio(user.id, (await context.params).id)).state,
      // The browser cannot read the deployment's limits itself, and guessing
      // them is how a UI offers a length the worker will refuse.
      capability: clipCapability(),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(_req: Request, context: Context) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) throw new StudioError("Unauthorized", 401);
    const id = (await context.params).id;
    // Scoped to the owner, so a wrong-owner delete reports not-found rather
    // than removing someone else's project. Cascades clear jobs and references.
    const removed = await prisma.filmWorkspace.deleteMany({
      where: { id, userId: user.id },
    });
    if (!removed.count) throw new StudioError("Project not found.", 404);
    return NextResponse.json({ deleted: id });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(req: Request, context: Context) {
  try {
    const {
      data: { user },
    } = await (await createClient()).auth.getUser();
    if (!user) throw new StudioError("Unauthorized", 401);
    const body = actionSchema.parse(await req.json());
    let loaded = await loadStudio(user.id, (await context.params).id);
    if (
      body.action !== "assist" && loaded.state.operation &&
      Date.now() - Date.parse(loaded.state.operation.startedAt) <
        generationLockMs(loaded.state.clipSeconds)
    )
      throw new StudioError(
        "A generation is being submitted for this project. Wait for it to finish before making another change.",
        409,
      );
    let state = structuredClone(loaded.state);
    // An assistant turn returns a proposal alongside the unchanged project.
    let assist: AssistReply | undefined;
    // Things the user must be told but which are not failures.
    const notices: string[] = [];
    const makeMessage = (
      text: string,
      role: "user" | "assistant",
      tab: StudioMessage["tab"],
    ): StudioMessage => ({
      id: randomUUID(),
      role,
      text,
      tab,
      createdAt: new Date().toISOString(),
    });
    const scene =
      "sceneId" in body
        ? state.scenes.find((item) => item.id === body.sceneId)
        : undefined;
    if ("sceneId" in body && body.sceneId && body.action !== "chat" && !scene)
      throw new StudioError("Scene not found.", 404);
    const submitChatImage = async (message: StudioMessage) => {
      if (!message.imageRequest)
        throw new StudioError("Image request not found.", 404);
      if (
        message.image &&
        ["queued", "rendering", "complete"].includes(message.image.status)
      )
        throw new StudioError(
          "This image is already being generated or is ready.",
          409,
        );
      state.operation = {
        id: randomUUID(),
        startedAt: new Date().toISOString(),
      };
      // Persist the conversation and reserve the revision before a billable call.
      await saveStudio(loaded, state);
      loaded = await loadStudio(user.id, loaded.project.id);
      state.revision = loaded.state.revision;
      delete message.imageError;
      message.imageRequest.variation =
        (message.imageRequest.variation || 0) + 1;
      try {
        message.image = await startChatImage(
          loaded.project.id,
          message.imageRequest,
        );
      } catch (cause) {
        message.imageError =
          cause instanceof StudioError
            ? cause.message
            : "Image generation could not start. Please try again.";
      }
      delete state.operation;
    };
    const checkAppearance = async (take: StudioTake) => {
      if (take.status !== "complete" || !take.identity?.length)
        throw new StudioError(
          "Complete a reference-based render before checking its appearance.",
        );
      state.operation = {
        id: randomUUID(),
        startedAt: new Date().toISOString(),
      };
      await saveStudio(loaded, state);
      loaded = await loadStudio(user.id, loaded.project.id);
      state.revision = loaded.state.revision;
      try {
        take.continuity = await reviewTake(loaded.project.id, take);
      } catch (cause) {
        take.continuity = {
          method: "visual-review",
          status: "error",
          error:
            cause instanceof StudioError
              ? cause.message
              : "Appearance checking is unavailable. Retry the check before using this take.",
        };
      }
      delete state.operation;
    };
    if (body.action === "chat") {
      state.mode = body.mode || state.mode || "discover";
      if (state.messages.length >= 200)
        throw new StudioError(
          "This conversation has reached its limit. Start another project to continue.",
        );
      const latestPlan = [...state.messages]
        .reverse()
        .find((message) => message.plan && !message.approved);
      if (
        body.tab === "plan" &&
        latestPlan?.plan &&
        /^(use this( plan)?|approve( this)?( plan)?)[.!]?$/i.test(
          body.text.trim(),
        )
      ) {
        state = approvePlan(state, latestPlan.plan);
        state.messages = state.messages.map((message) =>
          message.id === latestPlan.id
            ? { ...message, approved: true }
            : message,
        );
        state.messages.push(
          makeMessage(body.text, "user", body.tab),
          makeMessage(
            "Your latest proposed plan is approved. Open Scenes when you’re ready to create the first take.",
            "assistant",
            body.tab,
          ),
        );
        return NextResponse.json({ state: await saveStudio(loaded, state) });
      }
      const result = await directorReply(
        state,
        body.text,
        body.tab,
        body.sceneId,
      );
      const assistant: StudioMessage = {
        ...makeMessage(result.reply, "assistant", body.tab),
        ...(result.plan ? { plan: result.plan } : {}),
        ...(result.choices?.length
          ? {
              choices: result.choices.map((choice) => ({
                label: choice.label,
                message: choice.message,
                ...(choice.description
                  ? { description: choice.description }
                  : {}),
              })),
            }
          : {}),
        ...(body.tab === "assemble" && result.edits?.length
          ? { editProposal: result.edits }
          : {}),
      };
      state.messages.push(makeMessage(body.text, "user", body.tab), assistant);
      const image = chatImageRequest(
        state,
        body.text,
        result.image,
        body.sceneId,
      );
      if (image.request) {
        assistant.imageRequest = image.request;
        assistant.text =
          "Here's the image you requested. Its generation status appears below.";
        delete assistant.choices;
        await submitChatImage(assistant);
      } else if (image.choices) {
        assistant.text = "Which character would you like a portrait of?";
        assistant.choices = image.choices;
      } else if (image.blockedReason) {
        assistant.text = image.blockedReason;
        delete assistant.choices;
      }
    } else if (body.action === "generateChatImage") {
      const message = state.messages.find(
        (item) => item.id === body.messageId && item.role === "assistant",
      );
      if (!message) throw new StudioError("Image request not found.", 404);
      await submitChatImage(message);
    } else if (
      body.action === "reviewTake" ||
      body.action === "reviewChatImage"
    ) {
      const take =
        body.action === "reviewTake"
          ? scene!.takes.find((item) => item.id === body.takeId)
          : state.messages.find((item) => item.id === body.messageId)?.image;
      if (!take) throw new StudioError("Take not found.", 404);
      await checkAppearance(take);
    } else if (body.action === "reference") {
      const character = state.characters.find(
        (item) => item.id === body.characterId,
      );
      if (!character) throw new StudioError("Character not found.", 404);
      const refs = characterReferences(character);
      if (!refs.some((item) => item.id === body.referenceId))
        throw new StudioError("Reference not found.", 404);
      if (body.operation === "primary")
        character.referenceId = body.referenceId;
      else {
        character.references = refs.filter(
          (item) => item.id !== body.referenceId,
        );
        if (character.referenceId === body.referenceId)
          character.referenceId = character.references[0]?.id;
      }
      character.locked = false;
      state.scenes
        .filter((item) => item.characterIds.includes(character.id))
        .forEach((item) => {
          item.outdated = true;
        });
    } else if (body.action === "approve") {
      const message = state.messages.find((item) => item.id === body.messageId);
      if (!message?.plan) throw new StudioError("Plan not found.");
      if (message.approved) return NextResponse.json({ state });
      state = approvePlan(state, message.plan);
      state.messages = state.messages.map((item) =>
        item.id === message.id ? { ...item, approved: true } : item,
      );
      state.messages.push(
        makeMessage(
          "Your plan is approved and saved to the project board. Open Scenes to choose a scene and generate its first take.",
          "assistant",
          "plan",
        ),
      );
    } else if (body.action === "applyEdits") {
      const message = state.messages.find((item) => item.id === body.messageId);
      if (!message?.editProposal?.length)
        throw new StudioError("Edit proposal not found.");
      if (message.approved) return NextResponse.json({ state });
      state.undoEdits = structuredClone(state.edits);
      state.undoTimeline = [...state.timeline];
      for (const proposed of message.editProposal) {
        if (!state.scenes.some((item) => item.id === proposed.sceneId))
          throw new StudioError(
            "The proposed scene no longer exists. Ask for a fresh edit.",
          );
        state.edits[proposed.sceneId] = editSchema.parse({
          ...sceneEdit(state, proposed.sceneId),
          ...proposed.changes,
        });
      }
      message.approved = true;
    } else if (body.action === "undoEdits") {
      if (!state.undoEdits) throw new StudioError("No edit to undo.");
      state.edits = state.undoEdits;
      if (state.undoTimeline) state.timeline = state.undoTimeline;
      delete state.undoTimeline;
      delete state.undoEdits;
    } else if (body.action === "autoDirect") {
      if (!state.scenes.length) throw new StudioError("Build the script first, then Omni can fill in the scene details.");
      if (state.autoDirected?.requestId === body.requestId) {
        notices.push("Omni already filled in these scene details.");
      } else {
        const reply = await directScenes(state);
        // The model call is slow and blur-saves keep landing meanwhile, so
        // the details are written onto the latest saved project, not the
        // snapshot the model was shown. Fill-only keeps the writer's edits.
        loaded = await loadStudio(user.id, loaded.project.id);
        state = structuredClone(loaded.state);
        if (state.autoDirected?.requestId !== body.requestId) {
          const filled = fillSceneDirection(state, reply);
          state.directionMode = "omni";
          state.autoDirected = { requestId: body.requestId, at: new Date().toISOString(), filled };
          // Asked once on the Generate step. Ids are fixed now so a repeated
          // Yes resolves to the same durable jobs instead of new paid ones.
          state.generateAllOffer = { id: randomUUID(), createdAt: new Date().toISOString(),
            requestIds: Object.fromEntries(state.scenes.map((item) => [item.id, randomUUID()])) };
          notices.push(filled
            ? `Omni filled in ${filled} scene detail${filled === 1 ? "" : "s"}. Anything you had already written was kept.`
            : "Every scene detail was already filled in, so nothing changed.");
        }
      }
    } else if (body.action === "answerGenerateAll") {
      // Yes submits through the jobs route first; either answer then closes
      // the question for good. A stale offer id changes nothing.
      if (state.generateAllOffer?.id === body.offerId) delete state.generateAllOffer;
    } else if (body.action === "detectCast") {
      if ((state.sourceScript ?? "").trim().length < 40) throw new StudioError("Paste your script first, then Omni can find its characters.");
      const found = await detectScriptCast(state.sourceScript as string);
      const taken = new Set(state.characters.map((item) => item.name.toLowerCase()));
      const added: string[] = [];
      for (const item of found) {
        if (taken.has(item.name.toLowerCase())) continue;
        if (state.characters.length >= MAX_STORY_CHARACTERS) {
          notices.push(`A story supports up to ${MAX_STORY_CHARACTERS} characters, so some names from your script were not added.`);
          break;
        }
        // Named in the writer's own script, so they are the writer's cast.
        state.characters.push({ id: randomUUID(), name: item.name, appearance: item.appearance, locked: false, origin: "user" });
        taken.add(item.name.toLowerCase());
        added.push(item.name);
      }
      if (state.storyPlan?.characterCount !== undefined && state.storyPlan.characterCount < state.characters.length)
        state.storyPlan.characterCount = state.characters.length;
      notices.push(added.length ? `Found ${added.join(", ")} in your script. Check how each one looks, or add a photo.` : "No new characters were found in your script.");
    } else if (body.action === "createCharacter") {
      if (state.characters.length >= 12) throw new StudioError("A story supports up to 12 characters.");
      if (state.characters.some(item => item.name.toLowerCase() === body.name.toLowerCase())) throw new StudioError("Choose a unique character name.");
      state.characters.push({ id: randomUUID(), name: body.name, appearance: body.appearance, locked: false, origin: "user" });
      // A named character is part of the cast, so the planned count grows with it.
      if (state.storyPlan?.characterCount !== undefined && state.storyPlan.characterCount < state.characters.length)
        state.storyPlan.characterCount = state.characters.length;
    } else if (body.action === "removeCharacter") {
      const character = state.characters.find(item => item.id === body.characterId);
      if (!character) throw new StudioError("Character not found.", 404);
      if (state.scenes.some(item => item.characterIds.includes(character.id) || item.dialogues.some(line => line.character === character.name)))
        throw new StudioError("Remove this character from scene casts and dialogue first. Existing takes and references are preserved.");
      state.scriptUndo = { kind: "character", scenes: structuredClone(state.scenes), characters: structuredClone(state.characters), title: state.title, premise: state.premise, world: state.world };
      state.characters = state.characters.filter(item => item.id !== character.id);
      notices.push("Character removed. Undo script change restores the character and references.");
    } else if (body.action === "generatePortrait") {
      const character = state.characters.find(item => item.id === body.characterId);
      if (!character) throw new StudioError("Character not found.", 404);
      const existing = state.messages.find(item => item.requestId === body.requestId);
      if (!existing) {
        if (character.appearance.trim().length < 10) throw new StudioError("Describe the character before generating a portrait.");
        const message = makeMessage(`Concept portrait for ${character.name}. Review it before adding it as a reference.`, "assistant", "plan");
        message.requestId = body.requestId;
        message.portraitCharacterId = character.id;
        message.imageRequest = { prompt: `Character reference portrait, clear face and silhouette, neutral background, no text. ${character.name}: ${character.appearance}. Visual style: ${state.visualStyle || state.world}.`,
          referenceIds: characterReferences(character).map(item => item.id) };
        state.messages.push(message);
        await submitChatImage(message);
      }
    } else if (body.action === "character") {
      const character = state.characters.find(
        (item) => item.id === body.characterId,
      );
      if (!character) throw new StudioError("Character not found.", 404);
      if (body.locked && !characterReferences(character).length)
        throw new StudioError(
          "Add at least one reference image before locking this character.",
        );
      if (
        state.characters.some(
          (item) =>
            item.id !== character.id &&
            item.name.toLowerCase() === body.name.toLowerCase(),
        )
      )
        throw new StudioError(
          "Another character already uses that name. Choose a unique name for reliable retrieval.",
        );
      if (
        character.appearance !== body.appearance ||
        character.name !== body.name
      )
        state.scenes
          .filter((item) => item.characterIds.includes(character.id))
          .forEach((item) => {
            item.outdated = true;
          });
      if (character.name !== body.name) {
        for (const item of state.scenes) if (item.characterIds.includes(character.id)) {
          item.dialogues = item.dialogues.map(line => line.character === character.name ? { ...line, character: body.name } : line);
        }
      }
      Object.assign(character, {
        name: body.name,
        appearance: body.appearance,
        locked: body.locked,
        // Saved by the writer, so a rebuild keeps this character and its look.
        origin: "user",
        ...(body.motivation !== undefined ? { motivation: body.motivation } : {}),
        ...(body.relationships !== undefined ? { relationships: body.relationships } : {}),
      });
    } else if (body.action === "lockCharacters") {
      const referenced = state.characters.filter((character) => characterReferences(character).length);
      const missing = state.characters.filter((character) => !characterReferences(character).length);
      if (!referenced.length)
        throw new StudioError("Add and approve at least one character reference before locking settings.");
      for (const character of referenced) character.locked = true;
      notices.push(`Locked ${referenced.length} character ${referenced.length === 1 ? "appearance" : "appearances"} with their current reference images.`);
      if (missing.length)
        notices.push(`${missing.map((character) => character.name).join(", ")} will generate from their written descriptions until you add a reference image.`);
    } else if (body.action === "scene") {
      if (
        body.characterIds.some(
          (id) => !state.characters.some((character) => character.id === id),
        )
      )
        throw new StudioError("Unknown character.");
      const changed =
        JSON.stringify(
          scene!.dialogues.map(({ character, text }) => ({ character, text })),
        ) !== JSON.stringify(body.dialogues);
      Object.assign(scene!, {
        title: body.title,
        description: body.description,
        characterIds: body.characterIds,
        dialogues: body.dialogues.map((line, index) => ({
          ...line,
          ...(!changed ? { audioUrl: scene!.dialogues[index]?.audioUrl } : {}),
        })),
        outdated: true,
      });
    } else if (body.action === "generate") {
      if (nativeVideoEnabled() && ["voice", "music"].includes(body.kind))
        throw new StudioError("Videos now include their own speech, music and sound effects. Describe the sound in your scene request.");
      // Reserve this project before any billable request. A simultaneous request
      // loses the revision check and never reaches the provider.
      state.operation = {
        id: randomUUID(),
        startedAt: new Date().toISOString(),
      };
      await saveStudio(loaded, state);
      loaded = await loadStudio(user.id, loaded.project.id);
      state.revision = loaded.state.revision;
      try {
        if (body.kind === "voice")
          scene!.dialogues = await generateVoices(
            state,
            loaded.project.id,
            scene!.id,
          );
        else if (body.kind === "music")
          scene!.musicUrl = (
            await generateSceneMusic({
              sceneId: scene!.id,
              mood: "cinematic",
              soundDesign: scene!.description,
              sceneTitle: scene!.title,
              projectId: loaded.project.id,
              estimatedDuration: `${resolveClipSeconds(
                scene!.requestedSeconds ?? state.clipSeconds,
              ).toFixed(1)} seconds`,
            })
          ).url;
        else {
          if (
            scene!.takes.some(
              (take) =>
                take.kind === body.kind &&
                ["queued", "rendering"].includes(take.status),
            )
          )
            throw new StudioError(
              "This scene already has a generation in progress.",
            );
          if (scene!.takes.length >= 30)
            throw new StudioError("This scene has reached its take limit.");
          const take = await startMedia(
            state,
            loaded.project.id,
            scene!.id,
            body.kind,
            body.direct,
          );
          scene!.takes.push(take);
          scene!.outdated = false;
        }
      } catch (cause) {
        const recovery = structuredClone(loaded.state);
        delete recovery.operation;
        await saveStudio(loaded, recovery);
        throw cause;
      }
      delete state.operation;
    } else if (body.action === "poll") {
      // Refresh completed URLs too: provider download links can expire.
      const pending = [
        ...state.scenes.flatMap((item) =>
          item.takes.map((take) => ({ sceneId: item.id, take })),
        ),
        ...state.messages.flatMap((message) =>
          message.image
            ? [{ sceneId: `chat-${message.id}`, take: message.image }]
            : [],
        ),
      ].filter(
        ({ take }) =>
          !take.jobId &&
          ["queued", "rendering", "complete"].includes(take.status) &&
          !take.stored,
      );
      await Promise.all(
        pending.map(async ({ sceneId, take }) => {
          if (take.provider === "modal-ltx") {
            await pollLtxVideo(loaded.project.id, sceneId, take);
            return;
          }
          if (take.provider === "qwen") {
            await pollQwenImage(loaded.project.id, take);
            return;
          }
          const details = await magicHour(
            `/${take.kind === "video" ? "video" : "image"}-projects/${encodeURIComponent(take.providerId)}`,
          );
          take.status = details.status;
          take.url =
            details.downloads?.[0]?.url || details.files?.[0]?.url || take.url;
          if (details.status === "error")
            take.error =
              "The provider could not generate this take. Please try a revised prompt.";
          if (take.status === "complete" && take.url) {
            try {
              await archiveTake(loaded.project.id, sceneId, take);
            } catch {
              take.error =
                "This take is ready, but a permanent copy could not be saved. Refresh media status to retry storage.";
            }
          }
        }),
      );
      const unchecked = [
        ...state.scenes.flatMap((item) => item.takes),
        ...state.messages.flatMap((message) =>
          message.image ? [message.image] : [],
        ),
      ].find(
        (take) =>
          take.status === "complete" &&
          take.url &&
          take.identity?.length &&
          take.continuity?.status === "pending",
      );
      if (unchecked) await checkAppearance(unchecked);
    } else if (body.action === "select") {
      const take = scene!.takes.find(
        (item) => item.id === body.takeId && item.status === "complete",
      );
      if (!take) throw new StudioError("This take is not ready.");
      const problem = continuityProblem(state, scene!, take);
      if (problem) throw new StudioError(problem);
      if (take.kind === "image") scene!.selectedImageId = take.id;
      else {
        scene!.selectedVideoId = take.id;
        scene!.outdated = false;
        // Choosing a different take does not move the edits built on the old
        // one. They are flagged, and Relink is the explicit action that moves
        // them — so a selection can never silently rewrite someone's timeline.
        if (state.clips?.length) state.clips = markStaleClips(state, state.clips);
      }
    } else if (body.action === "timeline") {
      if (new Set(body.sceneIds).size !== body.sceneIds.length)
        throw new StudioError("Each scene can appear once in the timeline.");
      for (const id of body.sceneIds) {
        const item = state.scenes.find((scene) => scene.id === id);
        const take = item?.takes.find(
          (take) => take.id === item.selectedVideoId,
        );
        if (item && take) {
          const problem = continuityProblem(state, item, take);
          if (problem) throw new StudioError(`${item.title}: ${problem}`);
        }
      }
      if (
        body.sceneIds.some(
          (id) =>
            !state.scenes.some(
              (item) =>
                item.id === id &&
                item.takes.some(
                  (take) =>
                    take.id === item.selectedVideoId &&
                    take.status === "complete",
                ),
            ),
        )
      )
        throw new StudioError(
          "Select a completed video take for each scene first.",
        );
      state.undoEdits = structuredClone(state.edits);
      state.undoTimeline = [...state.timeline];
      state.timeline = body.sceneIds;
    } else if (body.action === "edit") {
      state.undoEdits = structuredClone(state.edits);
      state.undoTimeline = [...state.timeline];
      state.edits[body.sceneId] = { ...DEFAULT_STUDIO_EDIT, ...body.edit };
    } else if (body.action === "undoScript" || (body.action === "sceneList" && body.operation === "undo")) {
      if (!state.scriptUndo) throw new StudioError("There is no script change to undo.");
      const previous = state.scriptUndo;
      const current = { kind: previous.kind, scenes: state.scenes, characters: state.characters, title: state.title, premise: state.premise, world: state.world };
      const archive = new Map((state.archivedScenes ?? []).map(scene => [scene.id, scene]));
      for (const scene of state.scenes) archive.set(scene.id, structuredClone(scene));
      state.archivedScenes = [...archive.values()];
      const existingCharacters = new Map(state.characters.map(character => [character.id, character]));
      const restoredIds = new Set(previous.characters.map(character => character.id));
      Object.assign(state, previous.kind === "sceneList" ? { scenes: previous.scenes } : previous.kind === "character" ? {} : previous,
        { scriptUndo: current, ...(previous.kind === "sceneList" ? {} : { characters: [
        ...previous.characters.map(character => existingCharacters.get(character.id) ?? character),
        ...state.characters.filter(character => !restoredIds.has(character.id)),
      ] }) });
      notices.push("Restored the previous script. Timeline edits and source takes are preserved.");
    } else if (body.action === "sceneList") {
      state.scriptUndo = { kind: "sceneList", scenes: structuredClone(state.scenes), characters: structuredClone(state.characters),
        title: state.title, premise: state.premise, world: state.world };
      if (body.operation === "add") {
        if (state.scenes.length >= 24) throw new StudioError("A story supports up to 24 scenes.");
        state.scenes.push({ id: randomUUID(), title: `Scene ${state.scenes.length + 1}`, description: "", visualAction: "", characterIds: [], dialogues: [], takes: [] });
      } else {
        const index = state.scenes.findIndex(item => item.id === body.sceneId);
        if (index < 0) throw new StudioError("Scene not found.", 404);
        if (body.operation === "remove") {
          const [removed] = state.scenes.splice(index, 1);
          state.archivedScenes = [...(state.archivedScenes ?? []).filter(item => item.id !== removed.id), removed];
          notices.push("Scene removed from the script; its takes and timeline edits are preserved. Undo restores it.");
        } else {
          const [moved] = state.scenes.splice(index, 1);
          state.scenes.splice(Math.min(body.toIndex ?? index, state.scenes.length), 0, moved);
          notices.push("Scene order updated. Your existing edit keeps its own order; reassemble explicitly to use script order.");
        }
      }
    } else if (body.action === "script") {
      const script = await generateFilmScript({
        state,
        idea: state.premise || state.title,
        sourceScript: state.sourceScript,
      });
      // Shared with the landing page's preview, so a visitor sees the same
      // structure the signed-in product builds.
      notices.push(...applyFilmScript(state, script));
      // The offer named the old scenes; a rebuilt script must be directed again.
      delete state.generateAllOffer;
        } else if (body.action === "assist") {
      const scene = body.sceneId
        ? state.scenes.find((item) => item.id === body.sceneId)
        : undefined;
      const character = body.characterId
        ? state.characters.find((item) => item.id === body.characterId)
        : undefined;
      const line = scene?.dialogues.find((item) => item.id === body.dialogueId);
      if (body.sceneId && !scene) throw new StudioError("Scene not found.", 404);
      if (body.characterId && !character) throw new StudioError("Character not found.", 404);
      if (body.dialogueId && !line) throw new StudioError("Dialogue not found.", 404);
      assist = await assistTurn({
        state: { ...state, ...body.context, roughIdea: body.context?.premise ?? state.roughIdea ?? state.premise, creativeBrief: { ...state.creativeBrief, ...body.context?.creativeBrief } },
        assist: state.assist ?? "guided",
        field: body.field,
        message: body.message,
        currentValue:
          body.currentValue ?? line?.text ?? character?.appearance ?? scene?.visualAction,
        subject: [scene ? `Scene ${state.scenes.indexOf(scene) + 1}: ${scene.title} — ${scene.visualAction ?? scene.description}` : "",
          character ? `Character: ${character.name}` : "", line ? `Speaker: ${line.character}; line: ${line.text}` : ""].filter(Boolean).join("\n"),
      });
      // A proposal only. Nothing is written until the user accepts it.
      // Do not save this old snapshot after a slow model turn: blur-saves and
      // scene jobs may have advanced the revision while the assistant thought.
      return NextResponse.json({ assist, state: (await loadStudio(user.id, loaded.project.id)).state, capability: clipCapability() });
    } else if (body.action === "scenePatch") {
      const scene = state.scenes.find((item) => item.id === body.sceneId);
      if (!scene) throw new StudioError("Scene not found.", 404);
      if (body.patch.title !== undefined) scene.title = body.patch.title;
      if (body.patch.visualAction !== undefined) {
        scene.visualAction = body.patch.visualAction;
        // Kept in step so the generation prompt and the legacy UI agree.
        scene.description = body.patch.visualAction;
      }
      if (body.patch.characterIds) {
        const known = new Set(state.characters.map((item) => item.id));
        if (new Set(body.patch.characterIds).size !== body.patch.characterIds.length) throw new StudioError("List each scene character once.");
        if (body.patch.characterIds.some((id) => !known.has(id)))
          throw new StudioError("That character is not in this project.");
        const removed = state.characters.filter(character => scene.characterIds.includes(character.id) && !body.patch.characterIds!.includes(character.id));
        if (removed.some(character => scene.dialogues.some(line => line.character === character.name)))
          throw new StudioError("Remove or reassign this character's dialogue before removing them from the scene cast.");
        scene.characterIds = body.patch.characterIds;
      }
      if (body.patch.direction) {
        const incoming = body.patch.direction;
        if (incoming.wardrobe && Object.keys(incoming.wardrobe).some(id => !scene.characterIds.includes(id)))
          throw new StudioError("Wardrobe must belong to a character in this scene.");
        if (incoming.expression && Object.keys(incoming.expression).some(id => !scene.characterIds.includes(id)))
          throw new StudioError("An expression must belong to a character in this scene.");
        scene.direction = { ...scene.direction, ...incoming,
          ...(incoming.wardrobe ? { wardrobe: { ...scene.direction?.wardrobe, ...incoming.wardrobe } } : {}),
          ...(incoming.expression ? { expression: { ...scene.direction?.expression, ...incoming.expression } } : {}) };
      }
      if (body.patch.requestedSeconds !== undefined) {
        if (body.patch.requestedSeconds === null) delete scene.requestedSeconds;
        else {
          // Refused rather than shortened, and stored as REQUESTED. The frame
          // count the worker receives is derived at submission, so the user's
          // choice and the pipeline's grid stay separate values.
          const problem = clipLengthProblem(body.patch.requestedSeconds);
          if (problem) throw new StudioError(`${scene.title}: ${problem}`);
          scene.requestedSeconds = body.patch.requestedSeconds;
        }
      }
      if (JSON.stringify(scene) !== JSON.stringify(loaded.state.scenes.find(item => item.id === scene.id))) scene.outdated = true;
    } else if (body.action === "assemble") {
      // One clip per scene, in scene order. A scene with internal cuts stays a
      // single clip here; splitting it is the editor's job, not generation's.
      //
      // Readiness is judged against the SAME rules the step shows, including
      // the live queue: without it a scene with a render in flight would
      // assemble its older take, and the user would export something they were
      // not looking at.
      // Enforced on the server as well as in the interface, so the rule cannot
      // be bypassed by calling the API directly.
      const unavailable = generationBlockedReason(state.language);
      if (unavailable) throw new StudioError(unavailable, 503);
      const { jobs } = await listSceneJobs(user.id, loaded.project.id);
      // Prisma widens the enum columns to `string`; the shape is otherwise the
      // one the client sees, so this narrows rather than reinterprets.
      const generation = filmGeneration(state, jobs as unknown as SceneJob[]);
      // Work in flight is reported first: a scene mid-render is not "missing a
      // video", and saying so would read as though nothing were happening.
      if (generation.working)
        throw new StudioError(
          `${generation.working} scene${generation.working > 1 ? "s are" : " is"} still generating. Wait for them to finish, or stop them first.`,
        );
      if (generation.problem) throw new StudioError(generation.problem);
      const clips = assembleClips(state);
      if (!clips.length)
        throw new StudioError("No finished videos to assemble yet.");
      const appearance = sceneSetContinuityProblem(
        state,
        clips.map((clip) => clip.sceneId),
      );
      // A failed appearance check gates assembly; it is not bypassed to let the
      // user get to export.
      if (appearance) throw new StudioError(appearance);
      // Re-assembling is an edit like any other, so it is undoable and does not
      // discard the history that came before it.
      state = pushHistory(state, clips);
      state.timeline = clips.map((clip) => clip.sceneId);
      state.step = "edit";
    } else if (body.action === "clipEdit") {
      const operation = body.operation;
      // Always judged against what the scenes now hold, so a take that arrived
      // while the editor was open shows as stale instead of being used.
      const current = markStaleClips(state, state.clips ?? []);

      if (operation.kind === "undo" || operation.kind === "redo") {
        const moved = operation.kind === "undo" ? undoEdit(state) : redoEdit(state);
        if ("problem" in moved) throw new StudioError(moved.problem);
        state = moved;
        // Re-checked after the jump: an undone clip may point at a take that
        // has since been superseded.
        state.clips = markStaleClips(state, state.clips ?? []);
      } else if (operation.kind === "relink") {
        const outcome = relinkClips(state, current);
        if (!outcome.relinked && !outcome.notes.length)
          throw new StudioError("Nothing needs relinking.");
        state = pushHistory(state, outcome.clips);
        notices.push(...outcome.notes);
        if (outcome.relinked)
          notices.push(
            `${outcome.relinked} clip${outcome.relinked > 1 ? "s" : ""} now use the current video.`,
          );
      } else if (operation.kind === "removeStale") {
        const removed = current.filter((clip) => clip.stale);
        if (!removed.length) throw new StudioError("No clips are out of date.");
        state = pushHistory(state, current.filter((clip) => !clip.stale));
        notices.push(
          `Removed ${removed.length} clip${removed.length > 1 ? "s" : ""} whose video is gone. The scenes are untouched.`,
        );
      } else {
        const result =
          operation.kind === "trim"
            ? trimClip(state, current, operation.clipId, operation)
            : operation.kind === "split"
              ? splitClip(state, current, operation.clipId, operation.filmSeconds)
              : operation.kind === "delete"
                ? deleteClip(current, operation.clipId)
                : operation.kind === "move"
                  ? moveClip(current, operation.clipId, operation.toIndex)
                  : patchClip(current, operation.clipId, operation.patch);
        if ("problem" in result) throw new StudioError(result.problem);
        state = pushHistory(state, result.clips);
      }
      // Kept in step so the legacy export path and the scene list agree.
      state.timeline = [...new Set((state.clips ?? []).map((clip) => clip.sceneId))];
    } else if (body.action === "beats") {
      const scene = state.scenes.find((item) => item.id === body.sceneId);
      if (!scene) throw new StudioError("Scene not found.", 404);
      if (!body.beats?.length) delete scene.beats;
      else {
        if ((state.language ?? "en") === "ur")
          throw new StudioError(
            "Urdu clips are lip-synced from one supplied speech track and cannot cut inside themselves. Split the scene instead.",
          );
        scene.beats = body.beats.map((beat, index) => ({
          id: beat.id || `${scene.id}-beat-${index + 1}`,
          visualAction: beat.visualAction,
          dialogueIds: beat.dialogueIds,
        }));
        const problem = beatProblem(scene);
        if (problem) throw new StudioError(problem);
      }
      scene.outdated = true;
    } else if (body.action === "dialogue") {
      const scene = state.scenes.find((item) => item.id === body.sceneId);
      if (!scene) throw new StudioError("Scene not found.", 404);
      const operation = body.operation;
      if ((operation.kind === "add" || operation.kind === "update") && operation.character !== undefined) {
        const speaker = state.characters.find(character => character.name === operation.character);
        if (!speaker) throw new StudioError("Choose a named project character for spoken dialogue. Scene descriptions are never spoken.");
        if (!scene.characterIds.includes(speaker.id)) scene.characterIds.push(speaker.id);
      }
      if (operation.kind === "add") {
        if (scene.dialogues.length >= 12)
          throw new StudioError("A scene supports up to 12 dialogue lines.");
        scene.dialogues.push({
          id: randomUUID(),
          character: operation.character,
          text: operation.text,
        });
      } else if (operation.kind === "update") {
        const line = scene.dialogues.find((item) => item.id === operation.dialogueId);
        if (!line) throw new StudioError("Dialogue line not found.", 404);
        if (operation.character !== undefined) line.character = operation.character;
        if (operation.text !== undefined) line.text = operation.text;
      } else if (operation.kind === "remove") {
        scene.dialogues = scene.dialogues.filter((item) => item.id !== operation.dialogueId);
        scene.beats = scene.beats?.map(beat => ({ ...beat, dialogueIds: beat.dialogueIds?.filter(id => id !== operation.dialogueId) }));
      } else {
        // Reordering may only permute what is already there, never add or drop.
        const existing = new Map(scene.dialogues.map((item) => [item.id, item]));
        if (
          operation.dialogueIds.length !== scene.dialogues.length ||
          new Set(operation.dialogueIds).size !== scene.dialogues.length ||
          operation.dialogueIds.some((id) => !existing.has(id))
        )
          throw new StudioError("Reordering must list each existing line exactly once.");
        scene.dialogues = operation.dialogueIds.map((id) => existing.get(id)!);
      }
      scene.outdated = true;
    } else if (body.action === "voice") {
      if ((state.language ?? "en") !== "ur")
        throw new StudioError(
          "Voices are selectable only for Urdu. English speech is generated with each clip.",
        );
      const character = state.characters.find((item) => item.id === body.characterId);
      if (!character) throw new StudioError("Character not found.", 404);
      if (body.voice) character.voice = body.voice;
      else delete character.voice;
    } else if (body.action === "workflow") {
      const { patch } = body;
      if (patch.premise !== undefined) state.roughIdea = patch.premise;
      // Changing language invalidates authored dialogue and any voice mapping,
      // so existing scenes are flagged rather than silently carried over.
      if (patch.language && patch.language !== state.language && state.scenes.length) {
        state.scenes = state.scenes.map((scene) => ({ ...scene, outdated: true }));
      }
      // `world` is the stored field the generation prompt already reads.
      if (patch.visualStyle !== undefined) state.world = patch.visualStyle;
      if (patch.clipSeconds !== undefined) {
        // An unavailable length is REFUSED, not quietly shortened: a project
        // that asked for 20s and silently received 5s is worse than being told
        // 20s is not ready. The stored value stays the requested one, and the
        // frame count the worker receives is derived from it at submission.
        const problem = clipLengthProblem(patch.clipSeconds);
        if (problem) throw new StudioError(problem);
      }
      const brief = patch.creativeBrief ? { ...state.creativeBrief, ...patch.creativeBrief } : state.creativeBrief;
      const { storyPlan, ...rest } = patch;
      Object.assign(state, rest);
      if (brief) state.creativeBrief = brief;
      if (storyPlan) {
        const plan = { ...state.storyPlan };
        for (const key of ["sceneCount", "characterCount"] as const) {
          if (storyPlan[key] === null) delete plan[key];
          else if (storyPlan[key] !== undefined) plan[key] = storyPlan[key];
        }
        // The user's named characters always count towards the cast.
        if (plan.characterCount !== undefined && plan.characterCount < state.characters.length)
          throw new StudioError(`You already have ${state.characters.length} characters. Remove one before lowering the count.`);
        state.storyPlan = plan;
      }
    }
    const appended =
      body.action === "chat"
        ? state.messages.filter(
            (message) =>
              !loaded.state.messages.some(
                (existing) => existing.id === message.id,
              ),
          )
        : [];
    if (appended.length) {
      // A scene job may finish while a Plan reply is being written. Merge the
      // new messages into the latest revision rather than losing either result.
      for (let attempt = 0; ; attempt++) {
        const latest = await loadStudio(user.id, loaded.project.id);
        const merged = {
          ...latest.state,
          mode: state.mode,
          messages: [
            ...latest.state.messages,
            ...appended.filter(
              (message) =>
                !latest.state.messages.some(
                  (existing) => existing.id === message.id,
                ),
            ),
          ],
        };
        try {
          state = await saveStudio(latest, merged);
          break;
        } catch (error) {
          if (
            !(error instanceof StudioError && error.status === 409) ||
            attempt >= 7
          )
            throw error;
        }
      }
    } else state = await saveStudio(loaded, state);
    return NextResponse.json({
      state,
      capability: clipCapability(),
      ...(assist ? { assist } : {}),
      ...(notices.length ? { notices } : {}),
    });
  } catch (error) {
    return failure(error);
  }
}
