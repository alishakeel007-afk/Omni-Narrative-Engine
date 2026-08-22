// ============================================================
// lib/image/image-service.ts
// Service layer orchestrating visual prompt building, deduplication
// hashing, AI provider invocation, and storage upload.
// ============================================================

import { buildImagePrompt, buildImageHash } from "./image-prompt";
import { resolveImageProvider, PollinationsImageProvider } from "./image-provider";
import { uploadImageToStorage } from "./image-storage";
import type { ImageGenerationRequest } from "./types";

export async function generateSceneImage(params: {
  sceneId: string;
  imagePrompt: string;
  visualPrompt?: string;
  sceneTitle?: string;
  location?: string;
  mood?: string;
  genres?: string[];
  existingHash?: string;
  projectId?: string;
  characterNames?: string[];
}): Promise<{ url: string; prompt: string; hash: string; provider: string }> {
  const request: ImageGenerationRequest = {
    sceneId: params.sceneId,
    imagePrompt: params.imagePrompt,
    visualPrompt: params.visualPrompt,
    sceneTitle: params.sceneTitle,
    location: params.location,
    mood: params.mood,
    genres: params.genres,
    characterNames: params.characterNames,
  };

  const hash = buildImageHash(request);
  if (params.existingHash && params.existingHash === hash) {
    throw new Error("DUPLICATE");
  }

  const prompt = buildImagePrompt(request);

  let provider = resolveImageProvider();
  let generated;

  try {
    generated = await provider.generateImage(request);
  } catch (err) {
    console.warn(`Primary image provider (${provider.name}) failed:`, err);
    // Fall back to Pollinations AI if primary provider hits an auth/rate error
    if (!(provider instanceof PollinationsImageProvider)) {
      console.log("Falling back to Pollinations AI provider...");
      provider = new PollinationsImageProvider();
      generated = await provider.generateImage(request);
    } else {
      throw err;
    }
  }

  const url = await uploadImageToStorage({
    imageBuffer: generated.imageBuffer,
    contentType: generated.contentType,
    projectId: params.projectId,
    sceneId: params.sceneId,
  });

  return {
    url,
    prompt,
    hash,
    provider: generated.provider,
  };
}
