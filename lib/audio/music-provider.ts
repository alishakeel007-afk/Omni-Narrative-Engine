// ============================================================
// lib/audio/music-provider.ts
// Provider abstraction layer.
//
// The rest of the application ONLY calls this interface.
// When Stable Audio / another real provider becomes available,
// implement MusicProvider here and nothing else changes.
// ============================================================

import type { MusicGenerationRequest, GeneratedMusic } from "./types";

export interface MusicProvider {
  readonly name: string;
  generateMusic(request: MusicGenerationRequest): Promise<GeneratedMusic>;
}

// ---------------------------------------------------------------------------
// StableAudioProvider
// Will call: POST https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio
// Requires: STABILITY_API_KEY or BACKGROUND_MUSIC_API_KEY in .env.local
// ---------------------------------------------------------------------------
export class StableAudioProvider implements MusicProvider {
  readonly name = "Stable Audio 3.0";

  private readonly apiKey: string;
  private readonly endpoint =
    "https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateMusic(request: MusicGenerationRequest): Promise<GeneratedMusic> {
    const fd = new FormData();
    fd.append("prompt", request.mood); // prompt is built externally by music-prompt.ts
    fd.append("seconds_total", String(Math.min(45, Math.max(5, request.durationSeconds))));
    fd.append("output_format", "mp3");

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "audio/*",
      },
      body: fd,
    });

    if (response.status === 402) {
      throw new Error(
        "Stable Audio: Insufficient credits. Purchase more at platform.stability.ai/account/credits"
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Stable Audio: Authentication failed (${response.status}). Check BACKGROUND_MUSIC_API_KEY.`
      );
    }

    if (response.status === 429) {
      throw new Error("Stable Audio: Rate limit exceeded. Please wait and retry.");
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Stable Audio: Generation failed (${response.status}): ${body.slice(0, 200)}`);
    }

    const contentType = response.headers.get("content-type") ?? "audio/mpeg";
    const audioBuffer = await response.arrayBuffer();

    if (audioBuffer.byteLength < 1000) {
      throw new Error("Stable Audio: Response was too small to be valid audio.");
    }

    return {
      audioBuffer,
      contentType,
      provider: this.name,
      durationSeconds: request.durationSeconds,
    };
  }
}

// ---------------------------------------------------------------------------
// NoProvider — used when no API key is configured.
// Throws immediately so the UI can show an honest error.
// ---------------------------------------------------------------------------
export class NoProvider implements MusicProvider {
  readonly name = "Not configured";

  async generateMusic(): Promise<GeneratedMusic> {
    throw new Error(
      "No music generation provider is configured. " +
        "Add BACKGROUND_MUSIC_API_KEY to .env.local and ensure you have sufficient credits."
    );
  }
}

// ---------------------------------------------------------------------------
// Factory — resolves the correct provider from env at call time.
// Called server-side only (inside an API route).
// ---------------------------------------------------------------------------
export function resolveProvider(): MusicProvider {
  const apiKey =
    process.env.STABILITY_API_KEY ||
    process.env.BACKGROUND_MUSIC_API_KEY;

  if (!apiKey) {
    return new NoProvider();
  }

  return new StableAudioProvider(apiKey);
}
