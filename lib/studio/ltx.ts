import { createHash, randomUUID } from "node:crypto";
import { getEnvValue } from "@/lib/env";
import { clipFrames, clipLengthProblem, framesToSeconds } from "@/lib/film/duration";
import { StudioError } from "./store";
import { uploadToSupabaseStorage } from "@/lib/supabase-storage";
import type { StudioIdentity, StudioTake } from "@/types/studio";

export function nativeVideoEnabled() {
  return getEnvValue(["STUDIO_VIDEO_BACKEND"]) === "modal-ltx";
}
export async function ltxRequest(path: string, body?: object) {
  const endpoint = getEnvValue(["STUDIO_LTX_URL"]);
  const token = getEnvValue(["STUDIO_LTX_TOKEN"]);
  if (!endpoint || !token)
    throw new StudioError(
      "Configure STUDIO_LTX_URL and STUDIO_LTX_TOKEN for video generation.",
      503,
    );
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    )
  )
    throw new StudioError("Use HTTPS for the video worker.");
  const response = await fetch(`${endpoint.replace(/\/$/, "")}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new StudioError(
      typeof data.detail === "string"
        ? data.detail
        : `Video worker request failed (${response.status}).`,
      response.status === 401 ? 503 : response.status === 422 ? 400 : response.status === 409 ? 409 : 502,
    );
  }
  return response;
}
export async function readBounded(response: Response, limit: number) {
  if (Number(response.headers.get("content-length")) > limit)
    throw new StudioError("Media exceeds the supported size.");
  const reader = response.body?.getReader();
  if (!reader) throw new StudioError("Media is unavailable.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const value = await reader.read();
      if (value.done) break;
      size += value.value.byteLength;
      if (size > limit)
        throw new StudioError("Media exceeds the supported size.");
      chunks.push(value.value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks);
}
export function mediaSource(url: string) {
  const parsed = new URL(url);
  const storage = getEnvValue(["NEXT_PUBLIC_SUPABASE_URL"]);
  const headers: Record<string, string> = {};
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    !(
      parsed.hostname.endsWith(".magichour.ai") ||
      (storage && parsed.host === new URL(storage).host)
    )
  )
    throw new StudioError("Unsupported media source.");
  const key = getEnvValue(["SUPABASE_SERVICE_ROLE_KEY"]);
  if (storage && parsed.host === new URL(storage).host && key) {
    if (!parsed.pathname.startsWith("/storage/v1/object/"))
      throw new StudioError("Unsupported storage source.");
    parsed.pathname = parsed.pathname.replace(
      "/object/public/",
      "/object/authenticated/",
    );
    headers.Authorization = `Bearer ${key}`;
    headers.apikey = key;
  }
  return { url: parsed.toString(), headers };
}
export async function imagePayload(url: string) {
  const source = mediaSource(url);
  const response = await fetch(source.url, {
    headers: source.headers,
    redirect: "error",
    signal: AbortSignal.timeout(45000),
  });
  if (
    !response.ok ||
    !["image/png", "image/jpeg", "image/webp"].includes(
      response.headers.get("content-type")?.split(";")[0] || "",
    )
  )
    throw new StudioError("The selected scene image could not be read.");
  return (await readBounded(response, 18 * 1024 * 1024)).toString("base64");
}
export async function exportSourceUrl(url: string) {
  const source = mediaSource(url);
  if (!source.headers.apikey) return url;
  const parsed = new URL(source.url);
  const objectPath = parsed.pathname.replace(
    /^\/storage\/v1\/object\/(?:authenticated|public)\//,
    "",
  );
  const response = await fetch(
    `${parsed.origin}/storage/v1/object/sign/${objectPath}`,
    {
      method: "POST",
      headers: { ...source.headers, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 3600 }),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    },
  );
  const data = await response.json();
  if (!response.ok || typeof data.signedURL !== "string")
    throw new StudioError(
      "Could not grant temporary access to an export source.",
      502,
    );
  return `${parsed.origin}/storage/v1${data.signedURL}`;
}
export async function startLtxVideo(input: {
  prompt: string;
  imageUrl?: string;
  identity: StudioIdentity[];
  continuityKey: string;
  requestId?: string;
  /**
   * Requested length in seconds. Unavailable choices are refused; supported
   * choices are snapped to the pipeline's frame grid. The resulting frame
   * count is what the worker is asked for. The take records both the request
   * and, once polled, the measured result.
   */
  seconds?: number;
}): Promise<StudioTake> {
  const problem = clipLengthProblem(input.seconds);
  if (problem) throw new StudioError(problem);
  const takeId = randomUUID();
  const numFrames = clipFrames(input.seconds);
  const response = await ltxRequest("/jobs", {
    request_id: input.requestId || takeId,
    prompt: input.prompt,
    ...(input.imageUrl
      ? { image_base64: await imagePayload(input.imageUrl) }
      : {}),
    seed: createHash("sha256")
      .update(input.requestId || takeId)
      .digest()
      .readUInt32BE(0),
    width: 1024,
    height: 576,
    num_frames: numFrames,
  });
  const data = await response.json();
  if (typeof data.id !== "string")
    throw new StudioError("The video worker returned no job ID.", 502);
  return {
    id: takeId,
    providerId: data.id,
    provider: "modal-ltx",
    kind: "video",
    status: "queued",
    nativeAudio: true,
    requestedFrames: numFrames,
    requestedSeconds: input.seconds ?? 5,
    prompt: input.prompt,
    identity: input.identity,
    continuityKey: input.continuityKey,
    createdAt: new Date().toISOString(),
    ...(input.identity.length
      ? { continuity: { status: "pending", method: "visual-review" } as const }
      : {}),
  };
}
export function audioVideoEnabled() {
  return nativeVideoEnabled() && getEnvValue(["STUDIO_LTX_AUDIO_PIPELINE"]) === "a2vid";
}

/**
 * Lip-synced generation from supplied speech. The clip length comes from the
 * audio, so the worker derives the frame count rather than taking one here.
 *
 * On THIS path a take carries one speaking turn: one supplied speech track
 * drives one mouth, so a scene with several turns is split into shots before
 * reaching here (`urduShotProblem` in `lib/film/shots.ts`). That restriction
 * belongs to lip-sync alone — native English generation can carry several
 * speakers across the cuts of a single clip.
 */
export async function startLtxAudioVideo(input: {
  prompt: string;
  audioUrl: string;
  imageUrl?: string;
  identity: StudioIdentity[];
  continuityKey: string;
  requestId?: string;
  /**
   * FINAL output size. The worker's audio pipeline renders stage 1 at half of
   * this, so 1536x1024 is the canonical choice: it puts stage 1 at the trained
   * 768x512. Smaller sizes run stage 1 below the trained resolution.
   */
  width?: 1536 | 1024 | 768;
  height?: 1024 | 576 | 512;
  /** Measured length of the supplied speech, recorded as the request. */
  audioSeconds?: number;
}): Promise<StudioTake> {
  if (!audioVideoEnabled())
    throw new StudioError(
      "Audio-conditioned video is not enabled. Set STUDIO_LTX_AUDIO_PIPELINE=a2vid once the worker is deployed with its audio weights.",
      503,
    );
  const takeId = randomUUID();
  const response = await ltxRequest("/jobs", {
    request_id: input.requestId || takeId,
    prompt: input.prompt,
    // The worker reads the speech itself; a signed URL keeps the service role
    // key server-side and the request body small.
    audio_url: await exportSourceUrl(input.audioUrl),
    ...(input.imageUrl ? { image_base64: await imagePayload(input.imageUrl) } : {}),
    seed: createHash("sha256")
      .update(input.requestId || takeId)
      .digest()
      .readUInt32BE(0),
    width: input.width ?? 1024,
    height: input.height ?? 576,
  });
  const data = await response.json();
  if (typeof data.id !== "string")
    throw new StudioError("The video worker returned no job ID.", 502);
  return {
    id: takeId,
    providerId: data.id,
    provider: "modal-ltx",
    kind: "video",
    status: "queued",
    nativeAudio: true,
    ...(input.audioSeconds ? { requestedSeconds: input.audioSeconds } : {}),
    prompt: input.prompt,
    identity: input.identity,
    continuityKey: input.continuityKey,
    createdAt: new Date().toISOString(),
    ...(input.identity.length
      ? { continuity: { status: "pending", method: "visual-review" } as const }
      : {}),
  };
}

export async function saveLtxArtifact(
  workspaceId: string,
  path: string,
  providerId: string,
) {
  const bytes = await readBounded(
    await ltxRequest(`/jobs/${encodeURIComponent(providerId)}/file`),
    100 * 1024 * 1024,
  );
  if (bytes.subarray(4, 8).toString() !== "ftyp")
    throw new StudioError("The worker output is not an MP4.", 502);
  return uploadToSupabaseStorage({
    bucket: process.env.SUPABASE_VIDEO_BUCKET || "generated-videos",
    path: `studio/${workspaceId}/${path}.mp4`,
    body: bytes,
    contentType: "video/mp4",
    upsert: true,
  });
}
export async function pollLtxVideo(
  workspaceId: string,
  sceneId: string,
  take: StudioTake,
) {
  const detail = await (
    await ltxRequest(`/jobs/${encodeURIComponent(take.providerId)}`)
  ).json();
  if (!["queued", "rendering", "complete", "error"].includes(detail.status))
    throw new StudioError("Invalid video job status.", 502);
  take.status = detail.status;
  if (detail.status === "error") {
    take.error = detail.error || "Video generation failed.";
    return;
  }
  if (detail.status === "complete" && !take.stored) {
    if (!detail.has_audio)
      throw new StudioError("The generated video has no native audio.", 502);
    const saved = await saveLtxArtifact(
      workspaceId,
      `${sceneId}/${take.id}`,
      take.providerId,
    );
    take.url = saved.publicUrl;
    take.stored = true;
    take.nativeAudio = true;
    take.duration = detail.duration;
  }
}
