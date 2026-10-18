import { getEnvValue } from "@/lib/env";
import { referenceData, StudioError } from "./store";
import { uploadToSupabaseStorage } from "@/lib/supabase-storage";
import type { StudioImageRequest, StudioTake } from "@/types/studio";
import { createHash } from "node:crypto";
import { boundImagePrompt } from "./identity";

async function worker(path: string, body?: object) {
  const endpoint = getEnvValue(["STUDIO_QWEN_URL"]);
  const token = getEnvValue(["STUDIO_QWEN_TOKEN"]);
  if (!endpoint || !token)
    throw new StudioError(
      "Configure STUDIO_QWEN_URL and STUDIO_QWEN_TOKEN to use the Qwen worker.",
      503,
    );
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    )
  )
    throw new StudioError(
      "Use HTTPS for a cloud worker, or HTTP on localhost.",
    );
  const response = await fetch(`${endpoint.replace(/\/$/, "")}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
    signal: AbortSignal.timeout(45000),
  });
  if (response.status === 404 && !body) return { status: "error" };
  if (!response.ok)
    throw new StudioError(
      `The Qwen worker could not process this request (${response.status}).`,
      502,
    );
  return response.json();
}
export async function startQwenImage(
  workspaceId: string,
  request: StudioImageRequest,
): Promise<StudioTake> {
  if (!request.referenceIds.length)
    throw new StudioError(
      "Qwen editing needs a character reference first. Generate or upload a portrait, then lock it.",
    );
  const images = await Promise.all(
    request.referenceIds.map((id) => referenceData(workspaceId, id)),
  );
  const seed = createHash("sha256")
    .update(
      JSON.stringify({
        identity:
          request.identity?.map((item) => item.key) || request.referenceIds,
        variation: request.variation || 0,
      }),
    )
    .digest()
    .readUInt32BE(0);
  const result = await worker("/jobs", {
    prompt: boundImagePrompt(request),
    images,
    seed,
  });
  if (typeof result.id !== "string")
    throw new StudioError("The Qwen worker returned no job ID.", 502);
  return {
    id: crypto.randomUUID(),
    providerId: result.id,
    provider: "qwen",
    kind: "image",
    status: "queued",
    prompt: request.prompt,
    identity: request.identity,
    ...(request.identity?.length
      ? { continuity: { status: "pending", method: "visual-review" } as const }
      : {}),
    createdAt: new Date().toISOString(),
  };
}
export async function pollQwenImage(workspaceId: string, take: StudioTake) {
  const result = await worker(`/jobs/${encodeURIComponent(take.providerId)}`);
  if (!["queued", "rendering", "complete", "error"].includes(result.status))
    throw new StudioError("The Qwen worker returned an invalid status.", 502);
  take.status = result.status;
  if (result.status === "error") {
    take.error =
      "The Qwen worker could not render this image. Revise the prompt or check worker logs.";
    return;
  }
  if (result.status !== "complete") return;
  if (
    typeof result.data !== "string" ||
    result.data.length > 16 * 1024 * 1024 ||
    result.mimeType !== "image/png"
  )
    throw new StudioError("The Qwen worker returned an invalid image.", 502);
  const bytes = Buffer.from(result.data, "base64");
  if (
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    throw new StudioError("The worker result is not a PNG image.", 502);
  const saved = await uploadToSupabaseStorage({
    bucket: getEnvValue(["SUPABASE_IMAGE_BUCKET"]) || "generated-images",
    path: `studio/${workspaceId}/qwen/${take.id}.png`,
    body: bytes,
    contentType: "image/png",
    upsert: true,
  });
  take.url = saved.publicUrl;
  take.stored = true;
  delete take.error;
}
