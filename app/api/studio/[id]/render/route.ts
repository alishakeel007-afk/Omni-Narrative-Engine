import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { loadStudio, saveStudio, StudioError } from "@/lib/studio/store";
import { filmContinuityProblem } from "@/lib/studio/identity";
import { ltxRequest, exportSourceUrl, saveLtxArtifact } from "@/lib/studio/ltx";
import {
  sceneEdit,
  type StudioState,
  type StudioRenderJob,
} from "@/types/studio";

export const runtime = "nodejs";
export const maxDuration = 180;
type Context = { params: Promise<{ id: string }> };
const pending = ["submitting", "queued", "rendering", "needs_attention"];
function failure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof StudioError
          ? error.message
          : error instanceof z.ZodError
            ? "Invalid export request."
            : "The export could not finish. Your edit remains saved; retry with the same request.",
    },
    {
      status:
        error instanceof StudioError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 502,
    },
  );
}
async function owned(context: Context) {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  if (!user) throw new StudioError("Unauthorized", 401);
  return { user, loaded: await loadStudio(user.id, (await context.params).id) };
}
async function merge(
  userId: string,
  id: string,
  apply: (state: StudioState) => void,
) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const loaded = await loadStudio(userId, id);
    const state = structuredClone(loaded.state);
    apply(state);
    try {
      return await saveStudio(loaded, state);
    } catch (error) {
      if (
        !(error instanceof StudioError) ||
        error.status !== 409 ||
        attempt === 7
      )
        throw error;
    }
  }
  throw new StudioError("The project changed. Retry export status.", 409);
}
async function submit(userId: string, projectId: string, job: StudioRenderJob) {
  if (!job.snapshot)
    throw new StudioError("The export snapshot is unavailable.");
  const clips = await Promise.all(
    job.snapshot.clips.map(async (clip) => ({
      ...clip,
      url: await exportSourceUrl(clip.url),
      voices: await Promise.all(clip.voices.map(exportSourceUrl)),
      music: clip.music ? await exportSourceUrl(clip.music) : null,
    })),
  );
  let result;
  try {
    result = await (await ltxRequest("/exports", { request_id: job.requestId, clips })).json();
  } catch (error) {
    if (!(error instanceof StudioError) || error.status !== 409) throw error;
    return merge(userId, projectId, state => {
      const item = state.renderJobs?.find(value => value.requestId === job.requestId);
      if (item && item.status === "submitting") {
        item.status = "needs_attention";
        item.error = "Export submission needs operator review. Check Modal logs before submitting another render.";
      }
    });
  }
  const providerId = z.string().uuid().parse(result.id);
  return merge(userId, projectId, (state) => {
    const item = state.renderJobs?.find(
      (value) => value.requestId === job.requestId,
    );
    if (item && item.status === "submitting") {
      item.providerId = providerId;
      item.status = "queued";
      delete item.snapshot;
    }
  });
}
export async function POST(req: Request, context: Context) {
  try {
    const { user, loaded } = await owned(context);
    const { requestId } = z
      .object({ requestId: z.string().uuid() })
      .parse(await req.json());
    const existing = loaded.state.renderJobs?.find(
      (item) => item.requestId === requestId,
    );
    if (existing)
      return NextResponse.json({ job: existing, state: loaded.state });
    const problem = filmContinuityProblem(loaded.state);
    if (problem) throw new StudioError(problem);
    if (!loaded.state.timeline.length || loaded.state.timeline.length > 12)
      throw new StudioError("Choose 1–12 scenes to export.");
    const clips = loaded.state.timeline.map((id) => {
      const scene = loaded.state.scenes.find((item) => item.id === id)!;
      const take = scene.takes.find(
        (item) => item.id === scene.selectedVideoId,
      );
      if (!take?.url || take.status !== "complete")
        throw new StudioError("A selected clip is unavailable.");
      const edit = sceneEdit(loaded.state, id);
      return {
        url: take.url,
        start: edit.start,
        end: edit.end,
        volume: edit.videoVolume,
        fade_in: edit.fadeIn || 0,
        fade_out: edit.fadeOut || 0,
        texts: edit.texts || [],
        voices: take.nativeAudio
          ? []
          : scene.dialogues.flatMap((line) =>
              line.audioUrl ? [line.audioUrl] : [],
            ),
        music: !take.nativeAudio && scene.musicUrl ? scene.musicUrl : null,
        voice_delay: edit.voiceDelay,
        voice_volume: edit.voiceVolume,
        music_volume: edit.musicVolume,
      };
    });
    const snapshotKey = createHash("sha256")
      .update(JSON.stringify(clips))
      .digest("hex");
    const job: StudioRenderJob = {
      id: requestId,
      providerId: "",
      requestId,
      status: "submitting",
      snapshotKey,
      snapshot: { clips },
      createdAt: new Date().toISOString(),
    };
    // Reserve an immutable snapshot with optimistic concurrency BEFORE billing.
    let state = await merge(user.id, loaded.project.id, (state) => {
      if (state.renderJobs?.some((item) => item.requestId === requestId))
        return;
      if (state.renderJobs?.some((item) => pending.includes(item.status)))
        throw new StudioError(
          "An export is already running. Check its status before starting another.",
          409,
        );
      if ((state.exports?.length || 0) >= 30)
        throw new StudioError(
          "This project has reached its saved export limit.",
        );
      state.renderJobs = [...(state.renderJobs || []).slice(-19), job];
    });
    const reserved = state.renderJobs!.find(
      (item) => item.requestId === requestId,
    )!;
    if (reserved.status === "submitting")
      state = await submit(user.id, loaded.project.id, reserved);
    return NextResponse.json(
      {
        job: state.renderJobs!.find((item) => item.requestId === requestId),
        state,
      },
      { status: 202 },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function GET(req: Request, context: Context) {
  try {
    const { user, loaded } = await owned(context);
    const requestId = new URL(req.url).searchParams.get("requestId");
    const job = loaded.state.renderJobs?.find(
      (item) => item.requestId === requestId,
    );
    if (!job) throw new StudioError("Export job not found.", 404);
    if (job.status === "submitting") {
      // Modal deduplicates this same request, including after a lost response.
      const state = await submit(user.id, loaded.project.id, job);
      return NextResponse.json({
        job: state.renderJobs!.find((item) => item.requestId === requestId),
        state,
      });
    }
    if (["complete", "error", "needs_attention"].includes(job.status))
      return NextResponse.json({ job, state: loaded.state });
    const result = await (
      await ltxRequest(`/jobs/${encodeURIComponent(job.providerId)}`)
    ).json();
    const status = z
      .enum(["queued", "rendering", "complete", "error"])
      .parse(result.status);
    const next = {
      ...job,
      status,
      ...(typeof result.error === "string" ? { error: result.error } : {}),
    };
    let item: NonNullable<StudioState["exports"]>[number] | undefined;
    if (status === "complete") {
      if (!result.has_audio)
        throw new StudioError("The exported film has no audio track.", 502);
      const saved = await saveLtxArtifact(
        loaded.project.id,
        `exports/${job.id}`,
        job.providerId,
      );
      next.url = saved.publicUrl;
      item = {
        id: job.id,
        url: saved.publicUrl,
        name: `${loaded.state.title}.mp4`,
        createdAt: new Date().toISOString(),
      };
    }
    const state = await merge(user.id, loaded.project.id, (state) => {
      state.renderJobs = state.renderJobs?.map((value) =>
        value.id === job.id && value.status !== "complete" ? next : value,
      );
      if (item && !state.exports?.some((value) => value.id === item!.id))
        state.exports = [...(state.exports || []), item];
    });
    return NextResponse.json({
      job: state.renderJobs!.find((item) => item.id === job.id),
      state,
    });
  } catch (error) {
    return failure(error);
  }
}
