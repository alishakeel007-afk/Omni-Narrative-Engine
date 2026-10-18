import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
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
import { DEFAULT_STUDIO_EDIT, sceneEdit, type StudioMessage } from "@/types/studio";
import { characterReferences, continuityProblem } from "@/lib/studio/identity";
import { reviewTake } from "@/lib/studio/continuity";
import { pollQwenImage } from "@/lib/studio/qwen";
import { pollLtxVideo, nativeVideoEnabled } from "@/lib/studio/ltx";
import { studioEditSchema } from "@/lib/studio/edits";
import type { StudioTake } from "@/types/studio";

export const runtime = "nodejs";
export const maxDuration = 180;
type Context = { params: Promise<{ id: string }> };
const editSchema = studioEditSchema;
const actionSchema = z.discriminatedUnion("action", [
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
    name: z.string().trim().min(1).max(100),
    appearance: z.string().min(10).max(5000),
    locked: z.boolean(),
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
    });
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
      loaded.state.operation &&
      Date.now() - Date.parse(loaded.state.operation.startedAt) < 240000
    )
      throw new StudioError(
        "A generation is being submitted for this project. Wait for it to finish before making another change.",
        409,
      );
    let state = structuredClone(loaded.state);
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
    if ("sceneId" in body && body.action !== "chat" && !scene)
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
      Object.assign(character, {
        name: body.name,
        appearance: body.appearance,
        locked: body.locked,
      });
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
              estimatedDuration: "5 seconds",
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
      else scene!.selectedVideoId = take.id;
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
    return NextResponse.json({ state });
  } catch (error) {
    return failure(error);
  }
}
