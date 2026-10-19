import type { MovieCharacterVoice, MovieDialogueLine, MovieSceneMood } from "@/types/audio";

/**
 * A compact, provider-neutral description of a line's intended delivery.
 * This is deliberately not a claim that every TTS provider can perform the
 * emotion exactly; it informs only the controls each provider documents.
 */
export const DIALOGUE_EMOTIONS = [
  "sadness", "anger", "fear", "happiness", "affection", "suspense",
  "urgency", "calmness", "confusion", "sarcasm", "neutral",
] as const;

export type DialogueEmotion = (typeof DIALOGUE_EMOTIONS)[number];
export type EmotionSource = "explicit" | "delivery" | "voice-tone" | "character-state" | "line" | "scene" | "default";

export type EmotionResolution = {
  emotion: DialogueEmotion;
  source: EmotionSource;
};

export type EmotionResolutionInput = {
  line: Pick<MovieDialogueLine, "delivery" | "line"> & { voiceProfile: Pick<MovieCharacterVoice, "tone" | "currentEmotionalState">; emotion?: unknown };
  scene?: MovieSceneMood;
  characterEmotionalState?: string | null;
};

const emotionTerms: Record<Exclude<DialogueEmotion, "neutral">, readonly string[]> = {
  sadness: ["sad", "sorrow", "grief", "heartbroken", "mourning", "tearful", "shaken", "softly"],
  anger: ["angry", "furious", "rage", "outraged", "hostile", "threatening"],
  fear: ["afraid", "fearful", "frightened", "terrified", "scared", "panic"],
  happiness: ["happy", "joyful", "excited", "delighted", "cheerful", "triumphant"],
  affection: ["affectionate", "romantic", "tender", "loving", "warmly", "fond"],
  suspense: ["suspense", "suspenseful", "tense", "uneasy", "ominous", "whispered", "whisper"],
  urgency: ["urgent", "urgently", "hurry", "quickly", "immediately", "fast", "desperate"],
  calmness: ["calm", "calmly", "steady", "reassuring", "measured", "peaceful"],
  confusion: ["confused", "uncertain", "bewildered", "hesitant", "puzzled", "unsure"],
  sarcasm: ["sarcastic", "dry", "ironic", "mocking", "wry"],
};

const urduEmotionTerms: Record<Exclude<DialogueEmotion, "neutral">, readonly string[]> = {
  sadness: ["اداس", "غمگین", "دکھی"], anger: ["غصہ", "غصے", "برہم"], fear: ["خوف", "ڈرا", "خوفزدہ"],
  happiness: ["خوش", "پرجوش", "مسرت"], affection: ["محبت", "پیار", "شفقت"], suspense: ["تناؤ", "پراسرار", "بے چینی"],
  urgency: ["فوراً", "جلدی", "فوری"], calmness: ["پرسکون", "اطمینان", "آہستہ"], confusion: ["الجھن", "حیران", "پریشان"], sarcasm: ["طنز", "تمسخر"],
};

const priority: Array<Exclude<DialogueEmotion, "neutral">> = [
  "urgency", "anger", "fear", "suspense", "sadness", "affection",
  "happiness", "confusion", "sarcasm", "calmness",
];

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Avoid treating “not angry” or quoted descriptions as a reliable emotion signal. */
function containsUnnegatedTerm(text: string, term: string): boolean {
  const matcher = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\b`, "gi");
  for (const match of text.matchAll(matcher)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 24), match.index).toLowerCase();
    const after = text.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 8).toLowerCase();
    if (!/\b(not|never|without|no longer|isn['’]t|is not)\s*$/.test(before) && !/^\s*(?:anymore|now)\b/.test(after)) {
      return true;
    }
  }
  return false;
}

function findEmotion(text: string): DialogueEmotion | null {
  if (!text) return null;
  for (const emotion of priority) {
    if (emotionTerms[emotion].some((term) => containsUnnegatedTerm(text, term))) return emotion;
  }
  if (/[\u0600-\u06FF]/.test(text)) {
    for (const emotion of priority) {
      if (urduEmotionTerms[emotion].some((term) => text.includes(term))) return emotion;
    }
  }
  return null;
}

export function isDialogueEmotion(value: unknown): value is DialogueEmotion {
  return typeof value === "string" && (DIALOGUE_EMOTIONS as readonly string[]).includes(value);
}

/**
 * Prefer deliberately authored metadata over inference. Text is a weak,
 * high-confidence fallback only; it cannot reliably infer irony or negation.
 */
export function resolveDialogueEmotion(input: EmotionResolutionInput): EmotionResolution {
  if (isDialogueEmotion(input.line.emotion) && input.line.emotion !== "neutral") {
    return { emotion: input.line.emotion, source: "explicit" };
  }

  const sources: Array<[EmotionSource, string]> = [
    ["delivery", cleanText(input.line.delivery)],
    ["voice-tone", cleanText(input.line.voiceProfile?.tone)],
    ["character-state", cleanText(input.characterEmotionalState ?? input.line.voiceProfile.currentEmotionalState)],
    ["line", cleanText(input.line.line)],
    ["scene", cleanText(`${input.scene?.sceneTone ?? ""} ${input.scene?.mood ?? ""}`)],
  ];

  for (const [source, text] of sources) {
    const emotion = findEmotion(text);
    if (emotion) return { emotion, source };
  }
  return { emotion: "neutral", source: "default" };
}

/** Only documented Deepgram speed values, kept deliberately conservative. */
export function deepgramSpeedForEmotion(emotion: DialogueEmotion): number {
  switch (emotion) {
    case "urgency": return 1.12;
    case "anger": return 1.06;
    case "happiness": return 1.05;
    case "fear":
    case "suspense": return 0.94;
    case "sadness": return 0.9;
    case "affection":
    case "calmness": return 0.92;
    case "confusion":
    case "sarcasm":
    case "neutral": return 1;
  }
}

/**
 * Punctuation can give Aura-2 a small amount of context without adding spoken
 * labels or changing semantic words. Existing terminal punctuation is kept.
 */
export function formatDeepgramEmotionInformedText(text: string, emotion: DialogueEmotion): string {
  const trimmed = text.trim();
  if (!trimmed || /[.!?…]$/.test(trimmed)) return trimmed;
  if (emotion === "suspense" || emotion === "fear" || emotion === "sadness" || emotion === "confusion") return `${trimmed}...`;
  if (emotion === "urgency" || emotion === "anger" || emotion === "happiness") return `${trimmed}!`;
  return `${trimmed}.`;
}

/**
 * Only tags documented for Eleven v3 and safe as a prefix. Undefined means
 * preserve text verbatim because a suitable conservative tag is unavailable.
 */
const ELEVEN_V3_TAGS: Partial<Record<DialogueEmotion, string>> = {
  sadness: "[sighs]",
  fear: "[whispers]",
  suspense: "[whispers]",
  anger: "[shouts]",
  happiness: "[laughs]",
  sarcasm: "[mischievously]",
};

export function elevenLabsTagForEmotion(emotion: DialogueEmotion): string | undefined {
  return ELEVEN_V3_TAGS[emotion];
}

/** Tags are supplied separately and never stored with the original dialogue text. */
export function formatElevenLabsEmotionInformedText(text: string, emotion: DialogueEmotion): string {
  // User-authored brackets must not become arbitrary Eleven v3 instructions.
  // Parentheses retain the visible wording without transmitting an audio tag.
  const trimmed = text.trim().replace(/\[([^\]\r\n]{1,80})\]/g, "($1)");
  const tag = elevenLabsTagForEmotion(emotion);
  return tag && trimmed ? `${tag} ${trimmed}` : trimmed;
}
