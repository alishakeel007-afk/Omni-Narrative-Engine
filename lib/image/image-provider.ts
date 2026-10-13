// ============================================================
// lib/image/image-provider.ts
// Provider abstraction for AI Image Generation.
// Supports Cloudflare Workers AI with fallback to Pollinations AI.
// ============================================================

import type { ImageGenerationRequest, GeneratedImage } from "./types";
import { buildImagePrompt, buildImageSeed } from "./image-prompt";

export interface ImageProvider {
  readonly name: string;
  generateImage(request: ImageGenerationRequest): Promise<GeneratedImage>;
}

/**
 * Cloudflare Workers AI Image Provider
 */
export class CloudflareImageProvider implements ImageProvider {
  readonly name = "Cloudflare Workers AI (SDXL Lightning)";
  private readonly accountId: string;
  private readonly apiToken: string;

  constructor(accountId: string, apiToken: string) {
    this.accountId = accountId;
    this.apiToken = apiToken;
  }

  async generateImage(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const prompt = buildImagePrompt(request);
    
    // Workers AI image generation model
    const model = "@cf/bytedance/stable-diffusion-xl-lightning";
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${model}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, seed: buildImageSeed(request) }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Cloudflare AI error (${response.status}): ${errText.slice(0, 200)}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    
    if (contentType.includes("json")) {
      const json = await response.json();
      if (json.result?.image) {
        const base64Data = json.result.image;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return {
          imageBuffer: bytes.buffer,
          contentType: "image/png",
          provider: this.name,
        };
      }
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 100) {
      throw new Error("Cloudflare AI returned an empty image buffer.");
    }

    return {
      imageBuffer: buffer,
      contentType,
      provider: this.name,
    };
  }
}

/**
 * Pollinations AI Provider (Reliable zero-config fallback)
 */
export class PollinationsImageProvider implements ImageProvider {
  readonly name = "Pollinations AI (Flux/SDXL)";

  async generateImage(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const prompt = buildImagePrompt(request);
    const encodedPrompt = encodeURIComponent(prompt.slice(0, 300));
    const seed = buildImageSeed(request);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=576&seed=${seed}&nologo=true`;

    const maxAttempts = 4;
    let lastError: Error = new Error("Pollinations AI request failed.");

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const response = await fetch(url);

      if (response.ok) {
        const contentType = response.headers.get("content-type") || "image/jpeg";
        const buffer = await response.arrayBuffer();

        if (buffer.byteLength < 100) {
          throw new Error("Pollinations AI returned empty image data.");
        }

        return {
          imageBuffer: buffer,
          contentType,
          provider: this.name,
        };
      }

      lastError = new Error(`Pollinations AI error (${response.status})`);

      // Only rate limits (429) and transient server errors (5xx) are worth retrying.
      const isRetryable = response.status === 429 || response.status >= 500;
      if (!isRetryable || attempt === maxAttempts) {
        throw lastError;
      }

      const delayMs = Math.min(2000 * 2 ** (attempt - 1), 10000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw lastError;
  }
}

/**
 * Resolve the image provider dynamically based on available configuration
 */
export function resolveImageProvider(): ImageProvider {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (accountId && apiToken) {
    return new CloudflareImageProvider(accountId, apiToken);
  }

  // Fallback to zero-config Pollinations AI
  return new PollinationsImageProvider();
}
