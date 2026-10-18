/**
 * Custom Mode keeps audio URLs in its JSON snapshot. These deterministic
 * fingerprints prove that a URL belongs to the exact authored text and voice
 * configuration currently shown to the user; URLs without a fingerprint are
 * retained for safety but are never presented as current dialogue audio.
 */
function normalized(value: string | undefined) {
  return (value ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (((hash << 5) + hash) ^ value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function customAudioFingerprint(text: string, voiceConfiguration: string, language: "en" | "ur") {
  return stableHash(`${language}\u0000${normalized(voiceConfiguration)}\u0000${normalized(text)}`);
}

export function customDialogueVoiceConfiguration(params: {
  characterId: string; characterName: string; voiceStyle?: string;
}) {
  return `dialogue:${params.characterId}:${normalized(params.characterName)}:${normalized(params.voiceStyle)}`;
}

export function customNarrationVoiceConfiguration() {
  return "narration:custom-story-narrator";
}

export function isCurrentCustomAudio(params: {
  audioUrl?: string; storagePath?: string; storedFingerprint?: string; text: string; voiceConfiguration: string; language: "en" | "ur";
}) {
  const durableButUnverified = /^https?:/i.test(params.audioUrl ?? "") && !params.storagePath;
  return Boolean(params.audioUrl) && !durableButUnverified && params.storedFingerprint === customAudioFingerprint(params.text, params.voiceConfiguration, params.language);
}
