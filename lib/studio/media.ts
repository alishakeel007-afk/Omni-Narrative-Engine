import { getEnvValue } from "@/lib/env";
import { referenceData, StudioError } from "./store";
import { scenePrompt } from "./logic";
import type {
  StudioImageRequest,
  StudioState,
  StudioTake,
} from "@/types/studio";
import { uploadTtsAudioToStorage } from "@/lib/audio/tts-storage";
import { uploadToSupabaseStorage } from "@/lib/supabase-storage";
import {
  boundImagePrompt,
  characterReferences,
  conditioningReferences,
  continuityProblem,
  identityProfile,
} from "./identity";
import { startQwenImage } from "./qwen";
import { imageBackend } from "./image-backend";
import { nativeVideoEnabled, startLtxVideo } from "./ltx";

export async function magicHour(path: string, body?: object) {
  const key = getEnvValue(["MAGIC_HOUR_API_KEY"]);
  if (!key)
    throw new StudioError(
      "Configure MAGIC_HOUR_API_KEY to generate media.",
      503,
    );
  const response = await fetch(`https://api.magichour.ai/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw new StudioError(
      response.status === 402
        ? "Magic Hour has insufficient credits."
        : `Magic Hour could not process the request (${response.status}).`,
      response.status === 402 ? 402 : 502,
    );
  return response.json();
}
async function uploadReference(draftId: string, id: string) {
  const reference = await referenceData(draftId, id);
  const extension =
    reference.mimeType === "image/jpeg"
      ? "jpg"
      : reference.mimeType.split("/")[1];
  const uploads = await magicHour("/files/upload-urls", {
    items: [{ type: "image", extension }],
  });
  const item = uploads.items?.[0];
  if (!item?.upload_url || !item.file_path)
    throw new StudioError("Reference upload could not start.", 502);
  const response = await fetch(item.upload_url, {
    method: "PUT",
    headers: { "Content-Type": reference.mimeType },
    body: Buffer.from(reference.data, "base64"),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw new StudioError("Could not attach the character reference.", 502);
  return item.file_path as string;
}
export async function startChatImage(
  draftId: string,
  request: StudioImageRequest,
  name = "Director image",
): Promise<StudioTake> {
  const backend = imageBackend();
  if (backend.selfHosted && request.referenceIds.length)
    return startQwenImage(draftId, request);
  const ids = [...new Set(request.referenceIds)];
  if (ids.length > backend.referenceLimit)
    throw new StudioError(
      `This image model supports up to ${backend.referenceLimit === 6 ? "six" : "three"} character references. Reduce the cast for this image.`,
    );
  const references = await Promise.all(
    ids.map((id) => uploadReference(draftId, id)),
  );
  const prompt = boundImagePrompt({ ...request, referenceIds: ids });
  const result = references.length
    ? await magicHour("/ai-image-editor", {
        name,
        assets: { image_file_paths: references },
        style: { prompt },
        image_count: 1,
        model: backend.model,
        aspect_ratio: "16:9",
        resolution: "640px",
      })
    : await magicHour("/ai-image-generator", {
        name,
        style: { prompt: request.prompt, tool: "general" },
        image_count: 1,
        model: "z-image-turbo",
        aspect_ratio: "16:9",
        resolution: "640px",
      });
  if (!result.id)
    throw new StudioError(
      "The provider did not return an image generation ID.",
      502,
    );
  return {
    id: crypto.randomUUID(),
    providerId: result.id,
    kind: "image",
    provider: "magic-hour",
    identity: request.identity,
    ...(request.identity?.length
      ? { continuity: { status: "pending", method: "visual-review" } as const }
      : {}),
    status: "queued",
    prompt,
    createdAt: new Date().toISOString(),
  };
}
export async function startMedia(
  state: StudioState,
  draftId: string,
  sceneId: string,
  kind: "image" | "video",
  direct: boolean,
  options: { instructions?: string; parentReferenceId?: string; requestId?: string } = {},
): Promise<StudioTake> {
  const {
    scene,
    cast,
    prompt: basePrompt,
    continuityKey,
  } = scenePrompt(state, sceneId);
  const referenceLimit = imageBackend().referenceLimit;
  if (cast.length > referenceLimit)
    throw new StudioError(
      `Split this shot into groups of ${referenceLimit} characters or fewer so every character receives a reference input.`,
    );
  const failed = [...scene.takes]
    .reverse()
    .find((take) => take.kind === kind && take.continuity?.status === "failed");
  const corrections = failed?.continuity?.checks
    ?.filter((check) => check.verdict === "mismatch")
    .map((check) => check.notes)
    .join("; ");
  const prompt = `${basePrompt}${corrections ? `\nCorrect these observed defects from the last rejected take while preserving the approved reference views: ${corrections}` : ""}${options.instructions ? `\nDirector's complete take requirements:\n${options.instructions}` : ""}`;
  if (scene.characterIds.length !== cast.length)
    throw new StudioError(
      "A scene character is missing. Update the cast first.",
    );
  if (
    cast.some(
      (character) =>
        !character.locked || !characterReferences(character).length,
    )
  )
    throw new StudioError(
      "Add reference views and lock every scene character before generating. You can create a concept portrait in Plan first.",
    );
  if (kind === "video" && direct && cast.length)
    throw new StudioError(
      "Character scenes require a checked reference image. Text-only video cannot preserve character references.",
    );
  const identity = cast.map(identityProfile);
  let result;
  if (kind === "image") {
    return {
      ...(await startChatImage(
        draftId,
        {
          prompt,
          referenceIds: [
            ...conditioningReferences(
              identity,
              referenceLimit - (options.parentReferenceId ? 1 : 0),
            ),
            ...(options.parentReferenceId ? [options.parentReferenceId] : []),
          ],
          identity,
          variation: scene.takes.filter((take) => take.kind === kind).length,
        },
        scene.title,
      )),
      continuityKey,
    };
  } else {
    const image = scene.takes.find(
      (take) => take.id === scene.selectedImageId && take.status === "complete",
    );
    const lockedReferences = cast.filter(
      (character) => character.locked && character.referenceId,
    );
    if (nativeVideoEnabled()) {
      if (!direct && cast.length && !image?.url) throw new StudioError("Choose a checked scene image first.");
      if (image && !direct) {
        if (!image.url) throw new StudioError("The selected scene image is unavailable.");
        const problem = continuityProblem(state, scene, image);
        if (problem) throw new StudioError(problem);
        if (image.continuityKey ? image.continuityKey !== continuityKey : image.prompt !== basePrompt || lockedReferences.length > 0)
          throw new StudioError("The selected image uses an older scene or character profile. Generate a new scene image first.");
      }
      const dialogue = scene.dialogues.map((line) => `${line.character} says exactly: ${JSON.stringify(line.text)}`).join("\n");
      return startLtxVideo({ prompt: `${prompt}\nNative audio direction: Generate synchronized speech, environmental sound effects, and an appropriate quiet background score unless the director explicitly requests otherwise. Keep speech intelligible and music underneath it. Follow all requested voice delivery, music and sound cues. This is one short clip of about five seconds. Do not invent extra dialogue.\n${dialogue || "No spoken dialogue unless explicitly requested in the scene direction."}`, imageUrl: !direct ? image?.url : undefined, identity, continuityKey, requestId: options.requestId });
    }
    if (!direct && image) {
      const problem = continuityProblem(state, scene, image);
      if (problem) throw new StudioError(problem);
      if (
        image.continuityKey
          ? image.continuityKey !== continuityKey
          : image.prompt !== basePrompt || lockedReferences.length > 0
      )
        throw new StudioError(
          "The selected scene image uses an older plan or character profile. Generate and select a new image, or choose text-only video.",
        );
      const data = image.stored
        ? {}
        : await magicHour(
            `/image-projects/${encodeURIComponent(image.providerId)}`,
          );
      const imagePath = data.files?.[0]?.file_path;
      // Reuse the provider's signed output URL as the image input when no durable path is returned.
      const imageUrl = data.downloads?.[0]?.url || image.url;
      if (!imagePath && !imageUrl)
        throw new StudioError(
          "The scene image is unavailable. Refresh its status first.",
        );
      result = await magicHour("/image-to-video", {
        name: scene.title,
        assets: { image_file_path: imagePath || imageUrl },
        style: { prompt },
        end_seconds: 5,
        model: "ltx-2.5",
        resolution: "480p",
        audio: false,
      });
    } else if (!direct && lockedReferences.length) {
      throw new StudioError(
        "Generate and select a scene image first to carry the character reference into your video. Or choose text-only video in Adjust.",
      );
    } else {
      result = await magicHour("/text-to-video", {
        name: scene.title,
        style: { prompt },
        end_seconds: 5,
        model: "ltx-2.5",
        resolution: "480p",
        aspect_ratio: "16:9",
        audio: false,
      });
    }
  }
  if (!result.id)
    throw new StudioError("The provider did not return a generation ID.", 502);
  return {
    id: crypto.randomUUID(),
    providerId: result.id,
    kind,
    status: "queued",
    prompt,
    continuityKey,
    identity,
    ...(identity.length
      ? { continuity: { status: "pending", method: "visual-review" } as const }
      : {}),
    createdAt: new Date().toISOString(),
  };
}
export async function archiveTake(
  projectId: string,
  sceneId: string,
  take: StudioTake,
) {
  if (!take.url) return;
  const url = new URL(take.url);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".magichour.ai"))
    throw new StudioError("Unexpected provider media source.");
  const response = await fetch(take.url, {
    signal: AbortSignal.timeout(45000),
    redirect: "error",
  });
  if (!response.ok)
    throw new StudioError("Could not download the completed take.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 50 * 1024 * 1024)
    throw new StudioError("The take is too large to archive automatically.");
  const isVideo = take.kind === "video";
  const contentType =
    response.headers.get("content-type") ||
    (isVideo ? "video/mp4" : "image/png");
  const extension = isVideo
    ? "mp4"
    : contentType.includes("jpeg")
      ? "jpg"
      : contentType.includes("webp")
        ? "webp"
        : "png";
  const result = await uploadToSupabaseStorage({
    bucket: isVideo
      ? process.env.SUPABASE_VIDEO_BUCKET || "generated-videos"
      : process.env.SUPABASE_IMAGE_BUCKET || "generated-images",
    path: `studio/${projectId}/${sceneId}/${take.id}.${extension}`,
    body: bytes,
    contentType,
    upsert: true,
  });
  take.url = result.publicUrl;
  take.stored = true;
  delete take.error;
}
export async function generateVoices(
  state: StudioState,
  projectId: string,
  sceneId: string,
) {
  const scene = state.scenes.find((item) => item.id === sceneId);
  if (!scene) throw new StudioError("Scene not found.", 404);
  const key = getEnvValue(["DEEPGRAM_TTS_API_KEY", "DEEPGRAM_API_KEY"]);
  if (!key)
    throw new StudioError(
      "Configure DEEPGRAM_TTS_API_KEY to generate dialogue.",
      503,
    );
  if (!scene.dialogues.length)
    throw new StudioError(
      "Add dialogue to the scene before generating voices.",
    );
  const lines = [...scene.dialogues];
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].audioUrl) continue;
    const response = await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(getEnvValue(["DEEPGRAM_TTS_MODEL"]) || "aura-2-thalia-en")}`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: lines[index].text }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      throw new StudioError(
        `Dialogue generation failed (${response.status}).`,
        502,
      );
    lines[index] = {
      ...lines[index],
      audioUrl: await uploadTtsAudioToStorage({
        audioBuffer: await response.arrayBuffer(),
        contentType: response.headers.get("content-type") || "audio/mpeg",
        projectId,
        dialogueId: `${sceneId}-${index}`,
      }),
    };
  }
  return lines;
}
