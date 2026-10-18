// ============================================================
// lib/image/image-service.ts
// Service layer orchestrating visual prompt building, deduplication
// hashing, AI provider invocation, and storage upload.
// ============================================================

import { buildImagePrompt, buildImageHash } from "./image-prompt";
import { resolveImageProvider, PollinationsImageProvider, isPollinationsFallbackEnabled } from "./image-provider";
import { uploadImageToStorage } from "./image-storage";
import type { ImageGenerationRequest } from "./types";
import type { SceneVisualBrief } from "./scene-visual-context";

const MAX_TRANSIENT_IMAGE_BYTES = 6 * 1024 * 1024;

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
  /** Browser-local previews must not create unassociated Storage objects. */
  persist?: boolean;
  characterNames?: string[];
  characterAppearances?: string[];
  continuityNotes?: string[];
  artStyle?: string;
  visualBrief?: SceneVisualBrief;
}): Promise<{ url: string; storagePath?: string; prompt: string; hash: string; provider: string }> {
  const request: ImageGenerationRequest = {
    sceneId: params.sceneId,
    imagePrompt: params.imagePrompt,
    visualPrompt: params.visualPrompt,
    sceneTitle: params.sceneTitle,
    location: params.location,
    mood: params.mood,
    genres: params.genres,
    characterNames: params.characterNames,
    characterAppearances: params.characterAppearances,
    continuityNotes: params.continuityNotes,
    artStyle: params.artStyle,
    visualBrief: params.visualBrief,
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
    // Pollinations is never an implicit paid/unknown fallback. It can only be
    // selected by a deliberate, separately verified deployment configuration.
    if (!(provider instanceof PollinationsImageProvider) && isPollinationsFallbackEnabled()) {
      console.log("Using explicitly enabled Pollinations fallback provider.");
      provider = new PollinationsImageProvider();
      generated = await provider.generateImage(request);
    } else {
      throw new Error(`Image generation failed with ${provider.name}. ${err instanceof Error ? err.message : "Please retry after checking the configured provider."}`);
    }
  }

  if (params.persist === false) {
    // The Custom Scene Builder has no database-owned scene target. Keep its
    // preview in browser-local state instead of placing an orphan in Storage.
    if (generated.imageBuffer.byteLength > MAX_TRANSIENT_IMAGE_BYTES) {
      throw new Error("Temporary image preview is too large to return safely.");
    }
    return {
      url: `data:${generated.contentType};base64,${Buffer.from(generated.imageBuffer).toString("base64")}`,
      prompt,
      hash,
      provider: generated.provider,
    };
  }

  const uploaded = await uploadImageToStorage({
    imageBuffer: generated.imageBuffer,
    contentType: generated.contentType,
    projectId: params.projectId,
    sceneId: params.sceneId,
  });

  return {
    url: uploaded.url,
    storagePath: uploaded.storagePath,
    prompt,
    hash,
    provider: generated.provider,
  };
}
