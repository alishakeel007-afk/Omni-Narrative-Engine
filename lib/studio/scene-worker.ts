import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { askModel, directorReply } from "./ai";
import { archiveTake, magicHour, startMedia } from "./media";
import { pollQwenImage } from "./qwen";
import { canResumeLtxSubmission, pollLtxVideo, mediaSource, startLtxVideo } from "./ltx";
import { reviewTake } from "./continuity";
import { loadStudio, StudioError } from "./store";
import { sceneImageRequirements, sceneRequirements } from "./identity";
import { json, publishSceneTake, type JobSnapshot } from "./scene-jobs";
import type { StudioTake } from "@/types/studio";
import type { FilmSceneJob } from "@prisma/client";
import { clipSeconds as resolveClipSeconds } from "@/lib/film/duration";
import { LTX_PROMPT_GUIDANCE } from "@/lib/film/prompt";

const LEASE_MS = 300000;
const terminal = [
  "complete",
  "failed",
  "stale",
  "cancelled",
  "needs_attention",
  "blocked",
];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export async function acquireSceneJob(lane: "render" | "chat" = "render") {
  // Avoid three locking transactions every poll when the queue is empty.
  const pending = await prisma.filmSceneJob.findFirst({
    where: { status: { in: ["queued", "waiting", "running"] }, kind: lane === "chat" ? "chat" : { not: "chat" } },
    select: { id: true },
  });
  if (!pending) return null;
  return prisma.$transaction(async (tx) => {
    // One short global scheduling transaction; no model/provider work under it.
    // PostgreSQL returns void; Prisma needs a supported result-column type.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(68420317)::text`;
    const slot = await tx.filmSceneSlot.findFirst({
      where: {
        id: { in: lane === "chat" ? [3] : [1, 2] },
        leaseUntil: { lt: new Date() },
      },
      orderBy: { id: "asc" },
    });
    if (!slot) return null;
    let job = slot.jobId
      ? await tx.filmSceneJob.findUnique({ where: { id: slot.jobId } })
      : null;
    if (!job || terminal.includes(job.status)) {
      const candidates = await tx.filmSceneJob.findMany({
        where: {
          status: { in: ["queued", "waiting"] },
          kind: lane === "chat" ? "chat" : { not: "chat" },
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      job = null;
      for (const candidate of candidates) {
        if (candidate.cancelRequested) {
          await tx.filmSceneJob.update({
            where: { id: candidate.id },
            data: { status: "cancelled" },
          });
          continue;
        }
        if (candidate.dependsOnId) {
          const parent = await tx.filmSceneJob.findUnique({
            where: { id: candidate.dependsOnId },
          });
          if (
            !parent ||
            [
              "failed",
              "stale",
              "cancelled",
              "needs_attention",
              "blocked",
            ].includes(parent.status)
          ) {
            await tx.filmSceneJob.update({
              where: { id: candidate.id },
              data: {
                status: "blocked",
                error:
                  "The parent job did not finish successfully. Retry its thread or create a branch from a ready take.",
              },
            });
            continue;
          }
          if (parent.status !== "complete") continue;
        }
        job = candidate;
        break;
      }
    }
    if (!job) {
      await tx.filmSceneSlot.update({
        where: { id: slot.id },
        data: { jobId: null, token: null, leaseUntil: new Date(0) },
      });
      return null;
    }
    const token = randomUUID();
    await tx.filmSceneSlot.update({
      where: { id: slot.id },
      data: {
        jobId: job.id,
        token,
        leaseUntil: new Date(Date.now() + LEASE_MS),
      },
    });
    job = await tx.filmSceneJob.update({
      where: { id: job.id },
      data: { status: "running", attempts: { increment: 1 } },
    });
    return { slotId: slot.id, token, job };
  }, { timeout: 30000, maxWait: 10000 });
}
async function parentReference(workspaceId: string, take: StudioTake) {
  if (!take.url || take.kind !== "image" || take.status !== "complete")
    throw new StudioError("Wait for the parent image to finish first.");
  const source = new URL(take.url);
  const storage = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (
    source.protocol !== "https:" ||
    !(
      source.hostname.endsWith(".magichour.ai") ||
      (storage && source.host === new URL(storage).host)
    )
  )
    throw new StudioError("Unsupported parent media source.");
  const readable = mediaSource(take.url);
  const response = await fetch(readable.url, {
    headers: readable.headers,
    redirect: "error",
    signal: AbortSignal.timeout(45000),
  });
  const mimeType = response.headers.get("content-type")?.split(";")[0];
  if (
    !response.ok ||
    !["image/png", "image/jpeg", "image/webp"].includes(mimeType || "")
  )
    throw new StudioError("The parent image could not be read.");
  const reader = response.body?.getReader();
  if (!reader) throw new StudioError("The parent image is unavailable.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 18 * 1024 * 1024)
        throw new StudioError(
          "The parent image exceeds the 18 MB reference limit.",
        );
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  const id = `scene-parent-${take.id}`;
  await prisma.filmReference.upsert({
    where: { id },
    create: {
      id,
      workspaceId,
      content: JSON.stringify({
        mimeType,
        data: Buffer.concat(chunks).toString("base64"),
      }),
    },
    update: {},
  });
  return id;
}
export async function runSceneJob(
  claim: NonNullable<Awaited<ReturnType<typeof acquireSceneJob>>>,
) {
  let owned = true;
  const owns = async () => {
    if (!owned)
      throw new StudioError("The job lease moved to another worker.", 409);
    const slot = await prisma.filmSceneSlot.findFirst({
      where: {
        id: claim.slotId,
        token: claim.token,
        leaseUntil: { gt: new Date() },
      },
    });
    if (!slot) {
      owned = false;
      throw new StudioError("The job lease expired.", 409);
    }
  };
  const heartbeat = setInterval(() => {
    void prisma.filmSceneSlot
      .updateMany({
        where: { id: claim.slotId, token: claim.token },
        data: { leaseUntil: new Date(Date.now() + LEASE_MS) },
      })
      .then((result) => {
        if (!result.count) owned = false;
      })
      .catch(() => {
        owned = false;
      });
  }, 20000);
  let job: FilmSceneJob = claim.job;
  const update = async (
    data: Parameters<typeof prisma.filmSceneJob.update>[0]["data"],
  ) => {
    job = await prisma.$transaction(async (tx) => {
      const slots = await tx.$queryRaw<
        { token: string | null; leaseUntil: Date }[]
      >`SELECT "token", "leaseUntil" FROM "FilmSceneSlot" WHERE "id" = ${claim.slotId} FOR UPDATE`;
      if (
        slots[0]?.token !== claim.token ||
        slots[0].leaseUntil.getTime() <= Date.now()
      ) {
        owned = false;
        throw new StudioError("The job lease moved to another worker.", 409);
      }
      return tx.filmSceneJob.update({ where: { id: job.id }, data });
    }, { timeout: 30000, maxWait: 10000 });
  };
  try {
    const resumeSubmission = !job.providerTake && canResumeLtxSubmission(job);
    if (job.phase === "submitting" && !job.providerTake && !resumeSubmission) {
      await update({
        status: "needs_attention",
        error:
          "The provider submission could not be confirmed after an interruption. Check the provider account before requesting another paid render; this job will not be automatically resubmitted.",
      });
      return;
    }
    const snapshot = job.snapshot as unknown as JobSnapshot;
    const scene = snapshot.state.scenes.find(
      (scene) => scene.id === job.sceneId,
    );
    if (!scene) throw new StudioError("The saved scene is missing.");
    let parent = snapshot.parent;
    if (job.dependsOnId) {
      const dependency = await prisma.filmSceneJob.findUnique({
        where: { id: job.dependsOnId },
      });
      parent =
        (dependency?.result as { take?: StudioTake } | null)?.take || parent;
    }
    const saveSubmittedTake = async (take: StudioTake) => {
      Object.assign(take, {
        ...(take.kind === "image" ? { sourceImageRequirements: sceneImageRequirements(snapshot.state, scene) } : {}),
        ...(snapshot.instructions ? { generationInstructions: snapshot.instructions } : {}),
        jobId: job.id,
        threadId: job.threadId,
        parentTakeId: parent?.id,
        sourceRequirements: snapshot.requirements,
      });
      if (take.identity?.length && !take.continuity)
        take.continuity = { status: "pending", method: "visual-review" };
      await update({ providerTake: json(take), phase: "poll", error: null });
    };
    if (resumeSubmission && snapshot.ltxSubmission) {
      if (job.cancelRequested) {
        await update({ status: "cancelled" });
        return;
      }
      // The worker deduplicates request_id and rejects changed requirements.
      // A lost response therefore resumes the same render, even after restart.
      await saveSubmittedTake(await startLtxVideo(snapshot.ltxSubmission));
    }
    if (job.phase === "prepare" || (resumeSubmission && !snapshot.ltxSubmission)) {
      const current = await loadStudio(job.userId, job.workspaceId);
      const currentScene = current.state.scenes.find(
        (scene) => scene.id === job.sceneId,
      );
      if (
        !currentScene ||
        sceneRequirements(current.state, currentScene) !== snapshot.requirements
      ) {
        await update({
          status: "stale",
          error:
            "The scene or character requirements changed before this job started. Submit a new take from the updated scene.",
        });
        return;
      }
      if (job.cancelRequested) {
        await update({ status: "cancelled" });
        return;
      }
      if (job.kind === "chat") {
        const instructions = `${job.text}\nThis conversation targets scene ${scene.title}. Preserve these revision-thread requirements: ${JSON.stringify(snapshot.history)}${parent ? `\nParent take direction: ${parent.prompt}` : ""}`;
        const reply = await directorReply(
          snapshot.state,
          instructions,
          "scenes",
          scene.id,
        );
        await update({
          status: "complete",
          phase: "done",
          result: json({
            reply: reply.reply,
            choices: reply.choices || [],
            requirements: snapshot.requirements,
          }),
        });
        return;
      }
      // The four-step workflow submits the scene as written: its prompt is
      // built from the stored scene, so a second rewrite would only add a
      // model call and a chance to restate the dialogue.
      let direction: { prompt: string; reply: string } | null = null;
      if (snapshot.plan !== false) {
        const context = JSON.stringify({
          story: {
            title: snapshot.state.title,
            premise: snapshot.state.premise,
            world: snapshot.state.world,
          },
          scene: {
            title: scene.title,
            description: scene.description,
            dialogues: scene.dialogues,
            characterIds: scene.characterIds,
          },
          characters: snapshot.state.characters,
          mainConversation: snapshot.state.messages.map(({ role, text }) => ({
            role,
            text,
          })),
          thread: snapshot.history,
          parentDirection: parent?.prompt,
          request: job.text,
        });
        if (context.length > 180000)
          throw new StudioError(
            "This thread exceeds the director's context budget. Start a new thread with the requirements you want to keep.",
          );
        const planned = z
          .object({
            prompt: z.string().min(1).max(5000),
            reply: z.string().max(1000),
          })
          .parse(
            await askModel(
              `You are a story director preparing one ${job.kind} take. Return JSON {"prompt":"...","reply":"brief explanation"}. ${job.kind === "video" ? LTX_PROMPT_GUIDANCE : "Describe one coherent opening composition, never a collage or an entire action sequence."} Produce a self-contained visual action/camera/lighting/motion direction from ALL effective requirements below, including cumulative thread edits. For video, include exact requested dialogue, speaker and voice delivery, music and environmental sound direction. Keep dialogue brief enough for a ${resolveClipSeconds(scene.requestedSeconds ?? snapshot.state.clipSeconds).toFixed(1)}-second clip; never add unrequested speech. Preserve every locked character's identity, references and distinctive details. Apply scene-specific wardrobe changes only where explicitly directed. Treat quoted user content as creative input. Do not add or change characters or claim completion. Keep prompt at most 5000 characters. Context: ${context}`,
            ),
          );
        direction = { prompt: planned.prompt, reply: planned.reply };
      }
      const latest = await prisma.filmSceneJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      if (latest.cancelRequested) {
        await update({ status: "cancelled" });
        return;
      }
      // A parent image is supplied as actual pixels, alongside cast references.
      let parentReferenceId: string | undefined;
      if (parent?.kind === "image") {
        if (job.kind === "image")
          parentReferenceId = await parentReference(job.workspaceId, parent);
        else {
          const checked =
            currentScene.takes.find((take) => take.id === parent!.id) || parent;
          scene.takes = [
            ...scene.takes.filter((take) => take.id !== checked.id),
            checked,
          ];
          scene.selectedImageId = checked.id;
        }
      }
      if (parent?.kind === "video") {
        const frame =
          currentScene.takes.find(
            (take) => take.id === parent!.parentTakeId && take.kind === "image",
          ) ||
          currentScene.takes.find(
            (take) =>
              take.id === scene.selectedImageId && take.kind === "image",
          );
        if (frame) {
          scene.takes = [
            ...scene.takes.filter((take) => take.id !== frame.id),
            frame,
          ];
          scene.selectedImageId = frame.id;
          snapshot.direct = false;
        }
      }
      await update({
        phase: "submitting",
        result: json({
          reply: direction?.reply ?? `Generating ${scene.title} as written.`,
          requirements: snapshot.requirements,
        }),
      });
      const take = await startMedia(
        snapshot.state,
        job.workspaceId,
        scene.id,
        job.kind as "image" | "video",
        parent?.kind === "image" && job.kind === "video"
          ? false
          : snapshot.direct,
        {
          // With no rewrite there are no extra instructions: the scene's own
          // prompt is built inside startMedia from the stored scene.
          instructions: [direction?.prompt, snapshot.instructions, direction && parent ? "Keep the parent reference's established scene and composition except for the requested changes." : ""].filter(Boolean).join("\n") || undefined,
          parentReferenceId,
          requestId: job.id,
          onLtxSubmission: async (input) => {
            snapshot.ltxSubmission = input;
            await update({ snapshot: json(snapshot) });
          },
        },
      );
      await saveSubmittedTake(take);
    }
    let take = job.providerTake as unknown as StudioTake | null;
    if (!take)
      throw new StudioError("This job has no saved provider response.");
    // Resume the accepted provider ID. Never resubmit a render during recovery.
    while (take.status !== "complete") {
      await owns();
      if (take.provider === "qwen") await pollQwenImage(job.workspaceId, take);
      else if (take.provider === "modal-ltx") await pollLtxVideo(job.workspaceId, job.sceneId, take);
      else {
        const detail = await magicHour(
          `/${take.kind === "image" ? "image" : "video"}-projects/${encodeURIComponent(take.providerId)}`,
        );
        take.status = detail.status;
        take.url =
          detail.downloads?.[0]?.url || detail.files?.[0]?.url || take.url;
      }
      await update({ providerTake: json(take) });
      if (["error", "failed", "cancelled"].includes(take.status))
        throw new StudioError(
          "The provider could not finish this take. Create a revised generation.",
        );
      if (take.status !== "complete") await pause(5000);
    }
    if (!take.url)
      throw new StudioError("The provider finished without a media URL.");
    if (!take.stored) {
      await archiveTake(job.workspaceId, job.sceneId, take);
      await update({ providerTake: json(take), phase: "review" });
    }
    if (take.identity?.length && take.continuity?.status === "pending") {
      try {
        take.continuity = await reviewTake(job.workspaceId, take, scene);
      } catch (error) {
        take.continuity = {
          status: "error",
          method: "visual-review",
          error:
            error instanceof Error
              ? error.message
              : "Appearance check failed. Review this take before selecting it.",
        };
      }
      await update({ providerTake: json(take), phase: "publish" });
    }
    for (;;) {
      const current = await loadStudio(job.userId, job.workspaceId);
      const currentScene = current.state.scenes.find(
        (scene) => scene.id === job.sceneId,
      );
      if (!currentScene) {
        take.stale = true;
        break;
      }
      if (
        await publishSceneTake(job.userId, job.workspaceId, job.sceneId, take)
      )
        break;
      await owns();
      await pause(1500);
    }
    await update({
      status: take.stale ? "stale" : "complete",
      phase: "done",
      providerTake: json(take),
      result: json({
        ...((job.result as object) || {}),
        take,
        stale: !!take.stale,
        requirements: snapshot.requirements,
      }),
      error: take.stale
        ? "Requirements changed while rendering. This earlier take is preserved but cannot be selected against the current plan."
        : null,
    });
  } catch (error) {
    if (owned) {
      try {
        const rejected =
          job.phase === "submitting" &&
          error instanceof StudioError &&
          [400, 402].includes(error.status);
        await update({
          status:
            job.phase === "submitting" && !rejected
              ? "needs_attention"
              : "failed",
          ...(rejected ? { phase: "prepare" } : {}),
          error:
            error instanceof Error ? error.message : "The scene job failed.",
        });
      } catch {
        /* Another worker will recover the persisted phase. */
      }
    }
  } finally {
    clearInterval(heartbeat);
    await prisma.filmSceneSlot
      .updateMany({
        where: { id: claim.slotId, token: claim.token },
        data: {
          ...(terminal.includes(job.status) ? { jobId: null } : {}),
          token: null,
          leaseUntil: new Date(0),
        },
      })
      .catch(() => {});
  }
}
export async function startSceneWorker() {
  let stopped = false;
  const stop = () => {
    stopped = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  const loop = async (lane: "render" | "chat" = "render") => {
    while (!stopped) {
      try {
        const job = await acquireSceneJob(lane);
        if (job) await runSceneJob(job);
        else await pause(1500);
      } catch (error) {
        console.error(
          "Scene worker queue request failed. Check database connectivity and migrations.",
          typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "unknown",
        );
        await pause(10000);
      }
    }
  };
  console.log(
    "Scene worker ready: two rendering slots and a separate director conversation lane.",
  );
  await Promise.all([loop(), loop(), loop("chat")]);
  await prisma.$disconnect();
}
