import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { getEnvValue } from "@/lib/env";
import { uploadToSupabaseStorage } from "@/lib/supabase-storage";
import { referenceData, StudioError } from "./store";
import type { StudioImageRequest, StudioTake } from "@/types/studio";

export const CLOUDFLARE_IMAGE_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
export const CLOUDFLARE_REFERENCE_LIMIT = 4;

/** One image call, with real reference pixels. Never fall back to another paid provider. */
export async function startCloudflareImage(workspaceId: string, request: StudioImageRequest): Promise<StudioTake> {
  const account = getEnvValue(["CLOUDFLARE_ACCOUNT_ID"]);
  const token = getEnvValue(["CLOUDFLARE_API_TOKEN"]);
  if (!account || !token) throw new StudioError("Cloudflare image generation is not configured. Save CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN on the server.", 503);
  if (!/^[a-f0-9]{32}$/i.test(account)) throw new StudioError("Check CLOUDFLARE_ACCOUNT_ID: use the account ID from your Cloudflare dashboard.", 503);
  const ids = [...new Set(request.referenceIds)];
  if (ids.length > CLOUDFLARE_REFERENCE_LIMIT) throw new StudioError("Cloudflare supports four reference images per scene. Reduce the cast or reference views.");
  const form = new FormData();
  const mapping: string[] = [];
  const references = await Promise.all(ids.map(id => referenceData(workspaceId, id)));
  for (const [index, id] of ids.entries()) {
    // referenceData is scoped to this workspace; arbitrary URLs are never fetched.
    const reference = references[index];
    const bytes = await sharp(Buffer.from(reference.data, "base64"), { limitInputPixels: 40_000_000 }).rotate().resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    form.set(`input_image_${index}`, new Blob([new Uint8Array(bytes)], { type: "image/png" }), `reference-${index}.png`);
    mapping.push(`image ${index} = ${request.identity?.find(identity => identity.referenceIds.includes(id))?.name ?? "scene composition reference"}`);
  }
  const prompt = `${request.prompt}${mapping.length ? `\nReference mapping, zero-based: ${mapping.join("; ")}. Preserve each person's identity; do not blend people. Multiple views with the same name are one person.` : ""}`;
  form.set("prompt", prompt);
  form.set("width", "1024"); form.set("height", "576");
  form.set("seed", String(createHash("sha256").update(JSON.stringify([request.identity?.map(identity => identity.key) ?? ids, request.variation ?? 0])).digest().readUInt32BE(0)));
  let response: Response;
  try {
    response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${CLOUDFLARE_IMAGE_MODEL}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(120000), redirect: "error",
    });
  } catch { throw new StudioError("Cloudflare did not confirm the image result. Check the generation status before starting another request.", 502); }
  if (!response.ok) throw new StudioError(response.status === 401 || response.status === 403
    ? "Cloudflare denied image generation. Check that the API token has Workers AI permission for this account."
    : response.status === 429 ? "Cloudflare image generation is busy or its allowance is exhausted. Please try later."
    : `Cloudflare could not finish this image (${response.status}). No other image provider was used.`, response.status === 429 ? 429 : 502);
  let bytes: Buffer;
  if ((response.headers.get("content-type") ?? "").includes("json")) {
    const data = await response.json();
    const encoded = data.result?.image ?? data.image;
    if (data.success === false || typeof encoded !== "string" || !encoded || encoded.length > 28_000_000) throw new StudioError("Cloudflare returned no usable image.", 502);
    bytes = Buffer.from(encoded.replace(/^data:image\/\w+;base64,/, ""), "base64");
  } else {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 20_000_000) throw new StudioError("Cloudflare returned an image larger than the supported limit.", 502);
    bytes = Buffer.from(buffer);
  }
  let png: Buffer;
  try { png = await sharp(bytes, { limitInputPixels: 40_000_000 }).png().toBuffer(); }
  catch { throw new StudioError("Cloudflare returned invalid image data.", 502); }
  const id = randomUUID();
  const saved = await uploadToSupabaseStorage({ bucket: getEnvValue(["SUPABASE_IMAGE_BUCKET"]) || "generated-images", path: `studio/${workspaceId}/cloudflare/${id}.png`, body: new Uint8Array(png), contentType: "image/png" });
  return { id, providerId: id, provider: "cloudflare", kind: "image", status: "complete", stored: true, url: saved.publicUrl,
    prompt, identity: request.identity, ...(request.identity?.length ? { continuity: { status: "pending", method: "visual-review" } as const } : {}), createdAt: new Date().toISOString() };
}
