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
import { startCloudflareImage } from "./cloudflare";
import { imageBackend } from "./image-backend";
import { audioVideoEnabled, nativeVideoEnabled, startLtxVideo } from "./ltx";
import { generationBlockedReason } from "@/lib/film/language";
import { clipLengthProblem, clipSeconds as resolveClipSeconds } from "@/lib/film/duration";
import { buildFilmPrompt } from "@/lib/film/prompt";
import { clipProblem } from "@/lib/film/shots";

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
  if (backend.cloudflare) return startCloudflareImage(draftId, request);
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
  if (kind === "video") {
    const unavailable = generationBlockedReason(state.language);
    if (unavailable) throw new StudioError(unavailable, 503);
    const lengthProblem = clipLengthProblem(state.scenes.find(item => item.id === sceneId)?.requestedSeconds ?? state.clipSeconds);
    if (lengthProblem) throw new StudioError(lengthProblem);
    if (!nativeVideoEnabled() && (state.scenes.find(item => item.id === sceneId)?.requestedSeconds ?? state.clipSeconds ?? 5) > 5.05)
      throw new StudioError("Longer clips require the validated Modal worker. This video backend supports only 5s.");
  }
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
        character.locked && !characterReferences(character).length,
    )
  )
    throw new StudioError(
      "A locked character is missing its approved reference image. Add one or unlock that character to generate from its written description.",
    );
  const anchoredCast = cast.filter(
    (character) => character.locked && characterReferences(character).length,
  );
  if (kind === "video" && direct && anchoredCast.length)
    throw new StudioError(
      "A scene with locked character references needs a checked scene image first.",
    );
  const identity = anchoredCast.map(character => ({ ...identityProfile(character),
    ...(scene.direction?.wardrobe?.[character.id] ? { sceneWardrobe: scene.direction.wardrobe[character.id] } : {}) }));
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
    const lockedReferences = anchoredCast;
    if (nativeVideoEnabled()) {
      if (!direct && cast.length && !image?.url) throw new StudioError("Choose a checked scene image first.");
      if (image && !direct) {
        if (!image.url) throw new StudioError("The selected scene image is unavailable.");
        const problem = continuityProblem(state, scene, image);
        // An unavailable or uncertain visual check should not discard a
        // legitimate render request. Keep a confirmed mismatch blocked, but
        // allow the video to proceed and require review before selection/export.
        const reviewPending = ["pending", "review", "error"].includes(
          image.continuity?.status || "",
        );
        if (problem && !reviewPending) throw new StudioError(problem);
        if (image.continuityKey ? image.continuityKey !== continuityKey : image.prompt !== basePrompt || lockedReferences.length > 0)
          throw new StudioError("The selected image uses an older scene or character profile. Generate a new scene image first.");
      }
      // One source video, however many internal cuts it carries. The prompt is
      // chronological prose with explicit cut markers, and the length asked for
      // is whatever this deployment is configured and validated for.
      const language = state.language ?? "en";
      // Urdu speech has to be synthesised and sent to the audio-conditioned
      // pipeline. Submitting Urdu text to the native-audio path would produce a
      // clip whose speech is not the authored line, so it is refused outright
      // rather than generated and left for the user to discover.
      // One wording, from lib/film/language.ts, so the interface, the queue and
      // this last line of defence all say the same thing.
      const unavailable = generationBlockedReason(language);
      if (unavailable) throw new StudioError(unavailable, 503);
      const seconds = resolveClipSeconds(scene.requestedSeconds ?? state.clipSeconds);
      const problem = clipProblem({ scene, language, clipSeconds: seconds });
      if (problem) throw new StudioError(problem);
      const direction = [
        corrections
          ? `Correct these observed defects from the last rejected take while preserving the approved reference views: ${corrections}`
          : "",
        options.instructions || "",
      ]
        .filter(Boolean)
        .join("\n");
      return startLtxVideo({
        prompt: buildFilmPrompt({
          state,
          scene,
          language,
          clipSeconds: seconds,
          instructions: direction || undefined,
        }),
        imageUrl: !direct ? image?.url : undefined,
        identity,
        continuityKey,
        requestId: options.requestId,
        seconds: scene.requestedSeconds ?? state.clipSeconds ?? 5,
      });
    }
    if (!direct && image) {
      const problem = continuityProblem(state, scene, image);
      const reviewPending = ["pending", "review", "error"].includes(
        image.continuity?.status || "",
      );
      if (problem && !reviewPending) throw new StudioError(problem);
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
