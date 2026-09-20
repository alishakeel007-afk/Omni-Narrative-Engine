import type { MovieCharacterVoice } from "@/types/video";
import { getEnvValue } from "@/lib/env";

const ELEVENLABS_TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_URDU_MODEL = "eleven_v3";
const ELEVENLABS_URDU_LANGUAGE_CODE = "ur";
const OUTPUT_FORMAT = "mp3_44100_128";

export type UrduElevenLabsVoice = {
  archetype: "hero_male";
  label: string;
  voiceId: string;
};

export type GeneratedUrduSpeech = {
  audioBuffer: ArrayBuffer;
  contentType: string;
  provider: "ElevenLabs Eleven v3";
  voice: UrduElevenLabsVoice;
};

/**
 * Resolves only voices that have been deliberately configured for Urdu.
 * New archetypes must receive their own configured environment variable rather
 * than silently falling back to an English Deepgram model.
 */
export function resolveUrduElevenLabsVoice(
  voiceProfile: Pick<MovieCharacterVoice, "archetype">
): UrduElevenLabsVoice {
  const archetype = voiceProfile.archetype.trim().toLowerCase();

  if (archetype !== "hero_male") {
    throw new Error(
      `No Urdu ElevenLabs voice is configured for the "${voiceProfile.archetype}" archetype.`
    );
  }

  const voiceId = getEnvValue(["ELEVENLABS_URDU_HERO_MALE_VOICE_ID"]);
  if (!voiceId) {
    throw new Error(
      "ElevenLabs Urdu hero_male voice ID is missing. Add ELEVENLABS_URDU_HERO_MALE_VOICE_ID in .env.local."
    );
  }

  return {
    archetype: "hero_male",
    label: "Urdu Hero Male",
    voiceId,
  };
}

/**
 * Generates Urdu speech with ElevenLabs Eleven v3. This is intentionally
 * provider-only: Phase 3B will select it from the authenticated TTS route and
 * pass the returned bytes to uploadTtsAudioToStorage().
 */
export async function generateUrduElevenLabsSpeech(params: {
  text: string;
  voiceProfile: Pick<MovieCharacterVoice, "archetype">;
}): Promise<GeneratedUrduSpeech> {
  const text = params.text.trim();
  if (!text) {
    throw new Error("ElevenLabs Urdu TTS requires non-empty text.");
  }

  const apiKey = getEnvValue(["ELEVENLABS_API_KEY"]);
  if (!apiKey) {
    throw new Error("ElevenLabs API key is missing. Add ELEVENLABS_API_KEY in .env.local.");
  }

  const voice = resolveUrduElevenLabsVoice(params.voiceProfile);
  const url = new URL(`${ELEVENLABS_TTS_ENDPOINT}/${encodeURIComponent(voice.voiceId)}`);
  url.searchParams.set("output_format", OUTPUT_FORMAT);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: ELEVENLABS_URDU_MODEL,
      language_code: ELEVENLABS_URDU_LANGUAGE_CODE,
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs Urdu TTS request failed (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  if (!contentType.toLowerCase().startsWith("audio/")) {
    throw new Error("ElevenLabs Urdu TTS returned a non-audio response.");
  }

  const audioBuffer = await response.arrayBuffer();
  if (audioBuffer.byteLength === 0) {
    throw new Error("ElevenLabs Urdu TTS returned empty audio.");
  }

  return {
    audioBuffer,
    contentType,
    provider: "ElevenLabs Eleven v3",
    voice,
  };
}
