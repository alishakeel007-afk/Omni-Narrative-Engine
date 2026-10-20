import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { loadStudio, saveStudio, StudioError } from "./store";
import {
  characterReferences,
  sceneRequirements,
  sceneImageRequirements,
  sceneHasCharacterReferences,
} from "./identity";
import { normalizeStudioState, type StudioState, type StudioTake } from "@/types/studio";
import { clipFrames, clipLengthProblem, generationLockMs, VALIDATED_MAX_FRAMES } from "@/lib/film/duration";
import { generationBlockedReason } from "@/lib/film/language";
import { clipProblem } from "@/lib/film/shots";
import { clipSeconds } from "@/lib/film/duration";
import { canResumeLtxSubmission, ltxRequest, nativeVideoEnabled, type LtxVideoInput } from "./ltx";
import { sceneReferenceProblem } from "@/lib/film/reference";

export const json = (value: unknown) => JSON.parse(JSON.stringify(value));
export const activeJobs = ["queued", "waiting", "running"];
export type JobInput = {
  instructions?: string;
  requestId: string;
  text: string;
  sceneId?: string;
  threadId?: string;
  parentTakeId?: string;
  parentJobId?: string;
  kind?: "chat" | "image" | "video";
  direct?: boolean;
  /**
   * Whether to run the director's prompt rewrite before submitting.
   *
   * The conversational studio needs it: its request is a sentence the user
   * typed. The four-step workflow does not: the scene already holds the visual
   * action, the cast, the dialogue and the length, and `buildFilmPrompt` turns
   * that into the prompt. Rewriting it again would cost a model call per scene
   * and risk restating the dialogue the structured prompt already carries.
   */
  plan?: boolean;
};
export type JobSnapshot = {
  instructions?: string;
  ltxSubmission?: LtxVideoInput;
  state: StudioState;
  requirements: string;
  key: string;
  direct: boolean;
  /** Absent or true keeps the director rewrite; false submits the scene as written. */
  plan?: boolean;
  parent?: StudioTake;
  history: { text: string; reply?: string }[];
};
export function resolveScene(
  state: StudioState,
  text: string,
  fallback?: string,
) {
  const match = text.match(
    /\bscene\s*(\d+)\b|\b(\d+)(?:st|nd|rd|th)?\s+scene\b|\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+scene\b/i,
  );
  if (match) {
    const n =
      Number(match[1] || match[2]) ||
      [
        "first",
        "second",
        "third",
        "fourth",
        "fifth",
        "sixth",
        "seventh",
        "eighth",
        "ninth",
        "tenth",
        "eleventh",
        "twelfth",
      ].indexOf(match[3].toLowerCase()) + 1;
    const scene = state.scenes[n - 1];
    if (!scene)
      throw new StudioError(
        `Scene ${n} isn't in this plan. Choose an approved scene.`,
      );
    return scene;
  }
  const titled = state.scenes.filter((scene) =>
    text.toLowerCase().includes(scene.title.toLowerCase()),
  );
  const scene =
    titled.length === 1
      ? titled[0]
      : state.scenes.find((scene) => scene.id === fallback) ||
        (state.scenes.length === 1 ? state.scenes[0] : undefined);
  if (!scene)
    throw new StudioError(
      "Choose a scene or mention its number, such as Scene 1.",
    );
  return scene;
}
export function requestedKind(text: string): "chat" | "image" | "video" {
  if (
    /\b(don't|do not|never|without)\s+(generate|render|create)|\b(how|explain|instructions|cost|pricing|voice|dialogue|music|audio)\b/i.test(
      text,
    )
  )
    return "chat";
  if (!/\b(generate|render|create|make|regenerate|animate)\b/i.test(text))
    return "chat";
  return /\b(image|photo|picture|portrait|illustration)\b/i.test(text)
    ? "image"
    : "video";
}
export async function listSceneJobs(userId: string, workspaceId: string, options: { loaded?: Awaited<ReturnType<typeof loadStudio>>; includeThreads?: boolean } = {}) {
  if (options.loaded?.project.id !== workspaceId || options.loaded.project.userId !== userId)
    await loadStudio(userId, workspaceId);
  const [jobs, threads] = await Promise.all([
    prisma.filmSceneJob.findMany({
      where: { workspaceId, userId },
      orderBy: { createdAt: "asc" },
      take: 300,
      select: {
        id: true,
        sceneId: true,
        threadId: true,
        kind: true,
        status: true,
        phase: true,
        text: true,
        error: true,
        result: true,
        dependsOnId: true,
        cancelRequested: true,
        createdAt: true,
      },
    }),
    options.includeThreads === false ? Promise.resolve([]) : prisma.filmSceneThread.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  // Only uncertain submissions need their private snapshots for recovery.
  // Completed jobs can contain a whole project snapshot each; never pull all
  // of those across the database connection on a progress poll.
  const uncertainIds = jobs.filter(job => job.phase === "submitting" && ["failed", "blocked", "needs_attention"].includes(job.status)).map(job => job.id);
  const uncertain = uncertainIds.length ? await prisma.filmSceneJob.findMany({
    where: { id: { in: uncertainIds }, workspaceId, userId },
    select: { id: true, kind: true, phase: true, snapshot: true },
  }) : [];
  return {
    jobs: jobs.map(job => ({
      id: job.id, sceneId: job.sceneId, threadId: job.threadId, kind: job.kind,
      status: job.status, phase: job.phase, text: job.text, error: job.error,
      result: job.result, dependsOnId: job.dependsOnId, cancelRequested: job.cancelRequested, createdAt: job.createdAt,
      retryable: ["failed", "blocked", "needs_attention"].includes(job.status) &&
        (job.phase !== "submitting" || uncertain.some(saved => saved.id === job.id && canResumeLtxSubmission(saved))),
    })),
    threads,
  };
}
export async function enqueueSceneJob(
  userId: string,
  workspaceId: string,
  input: JobInput,
) {
  const loaded = await loadStudio(userId, workspaceId);
  const existing = await prisma.filmSceneJob.findUnique({
    where: {
      workspaceId_requestId: { workspaceId, requestId: input.requestId },
    },
  });
  if (existing) {
    if (existing.userId !== userId || existing.text !== input.text)
      throw new StudioError(
        "This submission key belongs to another request.",
        409,
      );
    return existing;
  }
  if (
    (await prisma.filmSceneJob.count({
      where: { workspaceId, status: { in: activeJobs } },
    })) >= 24
  )
    throw new StudioError(
      "This project already has 24 pending jobs. Let a few finish first.",
      429,
    );
  let thread = input.threadId
    ? await prisma.filmSceneThread.findFirst({
        where: { id: input.threadId, workspaceId },
      })
    : null;
  if (input.threadId && !thread)
    throw new StudioError("Thread not found.", 404);
  let parentJob = input.parentJobId
    ? await prisma.filmSceneJob.findFirst({
        where: { id: input.parentJobId, workspaceId, userId },
      })
    : null;
  if (input.parentJobId && (!parentJob || parentJob.kind === "chat"))
    throw new StudioError("Generation not found.", 404);
  const scene = resolveScene(
    loaded.state,
    input.text,
    thread?.sceneId || parentJob?.sceneId || input.sceneId,
  );
  if (
    (thread && thread.sceneId !== scene.id) ||
    (parentJob && parentJob.sceneId !== scene.id)
  )
    throw new StudioError(
      "This thread belongs to a different scene. Return to all scenes to target another scene.",
    );
  const parentId = input.parentTakeId || thread?.parentTakeId;
  const parent = parentId
    ? scene.takes.find((take) => take.id === parentId)
    : undefined;
  if (parentId && !parent) throw new StudioError("Parent take not found.", 404);
  if (!parentJob && parent?.jobId)
    parentJob = await prisma.filmSceneJob.findFirst({
      where: { id: parent.jobId, workspaceId, userId },
    });
  if (!parentJob && thread?.parentJobId)
    parentJob = await prisma.filmSceneJob.findFirst({
      where: { id: thread.parentJobId, workspaceId, userId },
    });
  const kind =
    input.kind ||
    parent?.kind ||
    (parentJob?.kind as "image" | "video" | undefined) ||
    requestedKind(input.text);
  // Refused before a job row exists, so an unavailable language or clip length
  // never reaches the worker and never shows up as a queued job that will fail.
  if (kind !== "chat") {
    if (loaded.state.takeDeletions?.some(item => item.sceneId === scene.id && item.kind === kind && item.pending))
      throw new StudioError("Finish deleting the old take using Retry deletion before generating a replacement.", 409);
    const unavailable = generationBlockedReason(loaded.state.language);
    if (unavailable) throw new StudioError(unavailable, 503);
    if (kind === "video") {
      const problem = clipProblem({ scene, language: loaded.state.language ?? "en", clipSeconds: clipSeconds(scene.requestedSeconds ?? loaded.state.clipSeconds) });
      if (problem) throw new StudioError(problem);
    }
    const lengthProblem = clipLengthProblem(
      scene.requestedSeconds ?? loaded.state.clipSeconds,
    );
    if (lengthProblem)
      throw new StudioError(
        `${scene.title}: ${lengthProblem} Change the clip length in Setup, or for this scene, before generating.`,
      );
    if (kind === "video" && clipFrames(scene.requestedSeconds ?? loaded.state.clipSeconds) > VALIDATED_MAX_FRAMES) {
      if (!nativeVideoEnabled()) throw new StudioError("Longer clips require the validated Modal worker.");
      const health = await (await ltxRequest("/health")).json();
      if (health.frame_rate !== 24 || health.frame_step !== 8 || health.max_video_frames < clipFrames(scene.requestedSeconds ?? loaded.state.clipSeconds))
        throw new StudioError("The video worker does not support this clip length yet. Keep the request saved and choose an available length before generating.");
    }
  }
  const requirements = sceneRequirements(loaded.state, scene);
  const cast = loaded.state.characters.filter((character) =>
    scene.characterIds.includes(character.id),
  );
  if (kind !== "chat" && cast.some(character => !character.locked && characterReferences(character).length))
    throw new StudioError("Review and lock this scene's character references in Script & Characters before generating.");
  if (
    kind !== "chat" &&
    (cast.length !== scene.characterIds.length ||
      cast.some(
        (character) =>
          character.locked && !characterReferences(character).length,
      ))
  )
    throw new StudioError(
      "A locked character is missing its approved reference image. Add one or unlock that character to generate from its written description.",
    );
  if (kind === "video" && input.direct === true && sceneHasCharacterReferences(loaded.state, scene))
    throw new StudioError(
      "This scene uses a character reference. Select a scene image after its check, or skip the check and use that image, before generating video.",
    );
  if (kind === "video" && (input.direct !== true || sceneHasCharacterReferences(loaded.state, scene))) {
    const referenceProblem = sceneReferenceProblem(loaded.state, scene);
    if (referenceProblem) throw new StudioError(referenceProblem);
  }
  const key = createHash("sha256").update(requirements).digest("hex");
  if (
    parent?.stale ||
    (parent?.sourceRequirements && parent.sourceRequirements !== requirements)
  )
    throw new StudioError(
      "The parent take uses older requirements. Create a take from the current scene before refining it.",
    );
  try {
    return await prisma.$transaction(async (tx) => {
      // Share this short lock with take deletion: a render cannot capture a
      // reference while another request is reserving its removal.
      const current = await tx.$queryRaw<{ revision: number }[]>`SELECT "revision" FROM "FilmWorkspace" WHERE "id" = ${workspaceId} AND "userId" = ${userId} FOR UPDATE`;
      if (!current.length || current[0].revision !== loaded.state.revision)
        throw new StudioError("This project changed before generation was queued. Review the current scene and try again.", 409);
      const revision = await tx.filmSceneRevision.upsert({
        where: {
          workspaceId_sceneId_key: { workspaceId, sceneId: scene.id, key },
        },
        create: {
          workspaceId,
          sceneId: scene.id,
          key,
          snapshot: json({ state: loaded.state, requirements }),
        },
        update: {},
      });
      if (!thread)
        thread = await tx.filmSceneThread.create({
          data: {
            workspaceId,
            sceneId: scene.id,
            title: `${scene.title}${parent || parentJob ? " · Revision thread" : ""}`,
            parentTakeId: parent?.id,
            parentJobId: parentJob?.id,
          },
        });
      // Serialize only this thread's ordering; unrelated scene submissions proceed.
      await tx.$queryRaw`SELECT "id" FROM "FilmSceneThread" WHERE "id" = ${thread.id} FOR UPDATE`;
      const history = await tx.filmSceneJob.findMany({
        where: { threadId: thread.id },
        orderBy: { sequence: "asc" },
        take: 101,
      });
      if (history.length >= 100)
        throw new StudioError(
          "This thread has 100 requests. Start a new revision thread from its latest take.",
        );
      const last = history.at(-1);
      let dependsOnId =
        last && activeJobs.includes(last.status)
          ? last.id
          : parentJob && parentJob.status !== "complete"
            ? parentJob.id
            : undefined;
      const previous = [...history]
        .reverse()
        .find((job) => (job.result as { take?: StudioTake } | null)?.take)
        ?.result as { take?: StudioTake } | undefined;
      const inherited = parentJob
        ? [
            ...((parentJob.snapshot as unknown as JobSnapshot).history || []),
            {
              text: parentJob.text,
              reply: (parentJob.result as { reply?: string } | null)?.reply,
            },
          ]
        : [];
      const snapshot: JobSnapshot = {
        ...(input.instructions?.trim() ? { instructions: input.instructions.trim() } : {}),
        state: loaded.state,
        requirements,
        key,
        direct: input.direct ?? !scene.selectedImageId,
        ...(input.plan === false ? { plan: false } : {}),
        parent:
          previous?.take ||
          parent ||
          (parentJob?.result as { take?: StudioTake } | null)?.take,
        history: [
          ...inherited,
          ...history.map((job) => ({
            text: job.text,
            reply: (job.result as { reply?: string } | null)?.reply,
          })),
        ],
      };
      const sequence = (last?.sequence || 0) + 1;
      return tx.filmSceneJob.create({
        data: {
          workspaceId,
          userId,
          sceneId: scene.id,
          threadId: thread.id,
          sceneRevisionId: revision.id,
          requestId: input.requestId,
          kind,
          sequence,
          text: input.text,
          snapshot: json(snapshot),
          dependsOnId,
          status: dependsOnId ? "waiting" : "queued",
        },
      });
    }, { timeout: 30000, maxWait: 10000 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const replay = await prisma.filmSceneJob.findUnique({
        where: {
          workspaceId_requestId: { workspaceId, requestId: input.requestId },
        },
      });
      if (replay?.userId === userId && replay.text === input.text)
        return replay;
    }
    throw error;
  }
}
export async function changeSceneJob(
  userId: string,
  workspaceId: string,
  id: string,
  operation: "cancel" | "retry",
) {
  await loadStudio(userId, workspaceId);
  const job = await prisma.filmSceneJob.findFirst({
    where: { id, workspaceId, userId },
  });
  if (!job) throw new StudioError("Job not found.", 404);
  if (operation === "cancel") {
    await prisma.filmSceneJob.updateMany({
      where: { id, userId, status: { in: activeJobs } },
      data: {
        cancelRequested: true,
        ...(["queued", "waiting"].includes(job.status)
          ? { status: "cancelled" }
          : {}),
      },
    });
    if (job.dependsOnId) {
      const helper = await prisma.filmSceneJob.findFirst({
        where: {
          id: job.dependsOnId,
          workspaceId,
          userId,
          requestId: `${job.requestId}:reference`,
        },
      });
      if (
        helper &&
        !(await prisma.filmSceneJob.count({
          where: {
            dependsOnId: helper.id,
            id: { not: job.id },
            status: { in: activeJobs },
          },
        }))
      )
        await prisma.filmSceneJob.updateMany({
          where: { id: helper.id, status: { in: activeJobs } },
          data: {
            cancelRequested: true,
            ...(["queued", "waiting"].includes(helper.status)
              ? { status: "cancelled" }
              : {}),
          },
        });
    }
  } else {
    const resumable = canResumeLtxSubmission(job);
    if (
      !["failed", "blocked", ...(resumable ? ["needs_attention"] : [])].includes(job.status) ||
      (job.phase === "submitting" && !resumable)
    )
      throw new StudioError(
        "This job cannot be automatically retried. An unconfirmed submission needs a provider-account check before making another render.",
      );
    await prisma.$transaction(async tx => {
      const current = await tx.$queryRaw<{ state: unknown }[]>`SELECT "state" FROM "FilmWorkspace" WHERE "id" = ${workspaceId} AND "userId" = ${userId} FOR UPDATE`;
      if (!current.length) throw new StudioError("Project not found.", 404);
      const state = normalizeStudioState(current[0].state);
      const snapshot = job.snapshot as unknown as JobSnapshot;
      const oldScene = snapshot.state.scenes.find(scene => scene.id === job.sceneId);
      const required = [(job.providerTake as unknown as StudioTake | null)?.id, snapshot.parent?.id, oldScene?.selectedImageId];
      if (state.takeDeletions?.some(item => required.includes(item.takeId)))
        throw new StudioError("This generation uses deleted media and cannot be retried. Choose a remaining reference before starting another take.", 409);
      await tx.filmSceneJob.updateMany({
        where: { id, userId, status: job.status },
        data: {
          status: job.dependsOnId ? "waiting" : "queued",
          phase: job.providerTake ? "poll" : resumable ? "submitting" : "prepare",
          cancelRequested: false,
          error: null,
        },
      });
    });
  }
}
// Each attempt reloads the latest state and appends/replaces only this result.
export async function publishSceneTake(
  userId: string,
  workspaceId: string,
  sceneId: string,
  take: StudioTake,
) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const loaded = await loadStudio(userId, workspaceId);
    if (loaded.state.takeDeletions?.some(item => item.takeId === take.id)) return true;
    if (
      loaded.state.operation &&
      Date.now() - Date.parse(loaded.state.operation.startedAt) <
        generationLockMs(loaded.state.clipSeconds)
    )
      return false;
    const state = structuredClone(loaded.state);
    const scene = state.scenes.find((scene) => scene.id === sceneId);
    if (!scene) return false;
    take.stale = take.kind === "image" && take.sourceImageRequirements
      ? take.sourceImageRequirements !== sceneImageRequirements(state, scene)
      : take.sourceRequirements !== sceneRequirements(state, scene);
    const index = scene.takes.findIndex((item) => item.id === take.id);
    if (index < 0) scene.takes.push(take);
    else scene.takes[index] = { ...take,
      ...(scene.takes[index].savedForLater ? { savedForLater: true } : {}),
      ...(scene.takes[index].reviewOverride ? { reviewOverride: scene.takes[index].reviewOverride } : {}) };
    try {
      await saveStudio(loaded, state);
      return true;
    } catch (error) {
      if (!(error instanceof StudioError && error.status === 409)) throw error;
    }
  }
  return false;
}
