import type { MovieCharacterVoice } from "@/types/audio";
import { getEnvValue } from "@/lib/env";
import { formatElevenLabsEmotionInformedText, type DialogueEmotion } from "@/lib/audio/emotion-informed-delivery";

const ELEVENLABS_TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";
const ELEVENLABS_URDU_MODEL = "eleven_v3";
const ELEVENLABS_URDU_LANGUAGE_CODE = "ur";
const OUTPUT_FORMAT = "mp3_44100_128";

export type UrduElevenLabsVoice = {
  archetype: string;
  label: string;
  voiceId: string;
};

const URDU_VOICE_ENV_BY_ARCHETYPE: Record<string, string> = {
  narrator: "ELEVENLABS_URDU_NARRATOR_VOICE_ID",
  hero_male: "ELEVENLABS_URDU_HERO_MALE_VOICE_ID",
  hero_female: "ELEVENLABS_URDU_HERO_FEMALE_VOICE_ID",
  villain_male: "ELEVENLABS_URDU_VILLAIN_MALE_VOICE_ID",
  villain_female: "ELEVENLABS_URDU_VILLAIN_FEMALE_VOICE_ID",
  mentor_male: "ELEVENLABS_URDU_MENTOR_MALE_VOICE_ID",
  mentor_female: "ELEVENLABS_URDU_MENTOR_FEMALE_VOICE_ID",
  elder_male: "ELEVENLABS_URDU_ELDER_MALE_VOICE_ID",
  elder_female: "ELEVENLABS_URDU_ELDER_FEMALE_VOICE_ID",
  young_male: "ELEVENLABS_URDU_YOUNG_MALE_VOICE_ID",
  young_female: "ELEVENLABS_URDU_YOUNG_FEMALE_VOICE_ID",
  child: "ELEVENLABS_URDU_CHILD_VOICE_ID",
  creature_robot: "ELEVENLABS_URDU_CREATURE_ROBOT_VOICE_ID",
  neutral_male: "ELEVENLABS_URDU_NEUTRAL_MALE_VOICE_ID",
  neutral_female: "ELEVENLABS_URDU_NEUTRAL_FEMALE_VOICE_ID",
};

const MALE_FALLBACK_ARCHETYPES = new Set([
  "hero_male",
  "villain_male",
  "mentor_male",
  "elder_male",
  "young_male",
  "neutral_male",
]);

const FEMALE_FALLBACK_ARCHETYPES = new Set([
  "hero_female",
  "villain_female",
  "mentor_female",
  "elder_female",
  "young_female",
  "neutral_female",
]);

function fallbackBaseArchetype(archetype: string, gender: string | undefined): "hero_male" | "hero_female" | undefined {
  if (MALE_FALLBACK_ARCHETYPES.has(archetype)) return "hero_male";
  if (FEMALE_FALLBACK_ARCHETYPES.has(archetype)) return "hero_female";

  // The generated character profiles label child and creature/robot voices with
  // a binary gender. Do not guess when edited or imported data omits it.
  if (archetype !== "child" && archetype !== "creature_robot") return undefined;
  const normalizedGender = gender?.trim().toLowerCase() ?? "";
  if (normalizedGender === "male" || normalizedGender === "masculine") return "hero_male";
  if (normalizedGender === "female" || normalizedGender === "feminine") return "hero_female";
  return undefined;
}

export function getUrduVoiceEnvironmentName(archetype: string): string | undefined {
  return URDU_VOICE_ENV_BY_ARCHETYPE[archetype.trim().toLowerCase()];
}

export type GeneratedUrduSpeech = {
  audioBuffer: ArrayBuffer;
  contentType: string;
  provider: "ElevenLabs Eleven v3";
  voice: UrduElevenLabsVoice;
};

/**
 * Resolves only deliberately configured Urdu voices. There is intentionally no
 * cross-archetype fallback: unavailable is safer than the wrong identity.
 */
export function resolveUrduElevenLabsVoice(
  voiceProfile: Pick<MovieCharacterVoice, "archetype" | "gender">
): UrduElevenLabsVoice {
  const archetype = voiceProfile.archetype.trim().toLowerCase();
  const environmentName = getUrduVoiceEnvironmentName(archetype);
  if (!environmentName) {
    throw new Error(`No supported Urdu ElevenLabs voice mapping exists for archetype "${voiceProfile.archetype}".`);
  }
  const explicitlyConfiguredVoiceId = getEnvValue([environmentName]);
  if (explicitlyConfiguredVoiceId) {
    return {
      archetype,
      label: `Urdu ${archetype.replace(/_/g, " ")}`,
      voiceId: explicitlyConfiguredVoiceId,
    };
  }

  const fallbackArchetype = fallbackBaseArchetype(archetype, voiceProfile.gender);
  if (!fallbackArchetype) {
    throw new Error(`Urdu voice for "${archetype}" is not configured. Add ${environmentName} before generating this clip.`);
  }

  const fallbackEnvironmentName = URDU_VOICE_ENV_BY_ARCHETYPE[fallbackArchetype];
  const voiceId = getEnvValue([fallbackEnvironmentName]);
  if (!voiceId) {
    throw new Error(`Urdu voice for "${archetype}" requires ${fallbackEnvironmentName} to be configured.`);
  }

  return {
    archetype,
    label: `Urdu ${archetype.replace(/_/g, " ")} (${fallbackArchetype.replace(/_/g, " ")} fallback)`,
    voiceId,
  };
}

/** Lightweight framing check before persisting a provider response as MP3. */
export function isPlausibleMp3Audio(audio: ArrayBuffer): boolean {
  const bytes = new Uint8Array(audio);
  if (bytes.length < 4) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return bytes.length >= 10;
  const scanLimit = Math.min(bytes.length - 1, 1024);
  for (let index = 0; index < scanLimit; index += 1) {
    if (bytes[index] === 0xff && (bytes[index + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

/**
 * Generates Urdu speech with ElevenLabs Eleven v3. This is intentionally
 * provider-only: Phase 3B will select it from the authenticated TTS route and
 * pass the returned bytes to uploadTtsAudioToStorage().
 */
export async function generateUrduElevenLabsSpeech(params: {
  text: string;
  voiceProfile: Pick<MovieCharacterVoice, "archetype" | "gender">;
  emotion?: DialogueEmotion;
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
      // The tag is kept out of persistence and is only an Eleven v3 synthesis instruction.
      text: formatElevenLabsEmotionInformedText(text, params.emotion ?? "neutral"),
      model_id: ELEVENLABS_URDU_MODEL,
      language_code: ELEVENLABS_URDU_LANGUAGE_CODE,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    // Temporary diagnostic only: logs status + response body server-side to
    // root-cause the Urdu synthesis failure. Never logs the API key/headers.
    console.error(
      `[elevenlabs-urdu-tts] Request failed for voice ${voice.voiceId} (archetype ${voice.archetype}): ` +
      `status=${response.status} body=${errorBody.slice(0, 500)}`
    );
    throw new Error(`ElevenLabs Urdu TTS request failed (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") ?? "audio/mpeg";
  if (!contentType.toLowerCase().startsWith("audio/")) {
    throw new Error("ElevenLabs Urdu TTS returned a non-audio response.");
  }

  const audioBuffer = await response.arrayBuffer();
  if (!isPlausibleMp3Audio(audioBuffer)) {
    throw new Error("ElevenLabs Urdu TTS returned invalid MP3 audio.");
  }

  return {
    audioBuffer,
    contentType,
    provider: "ElevenLabs Eleven v3",
    voice,
  };
}
