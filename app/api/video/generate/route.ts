import { readFileSync } from "fs";
import { join } from "path";
import { NextResponse } from "next/server";
import type {
  MovieCharacterVoice,
  MovieDialogueLine,
  MovieScene,
  VideoGenerationRequest,
  VideoGenerationResponse
} from "@/types/video";

export const runtime = "nodejs";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEEPGRAM_TTS_ENDPOINT = "https://api.deepgram.com/v1/speak";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_DEEPGRAM_TTS_MODEL = "aura-2-thalia-en";
const MAX_SCENES = 5;
const MAX_AUDIO_LINES = 18;

type VoiceModel = {
  description: string;
  gender: string;
  model: string;
  tone: string;
  voiceName: string;
};

type VoiceArchetype =
  | "child"
  | "creature_robot"
  | "elder_female"
  | "elder_male"
  | "hero_female"
  | "hero_male"
  | "mentor_female"
  | "mentor_male"
  | "neutral_female"
  | "neutral_male"
  | "narrator"
  | "villain_female"
  | "villain_male"
  | "young_female"
  | "young_male";

const DEFAULT_VOICE_ARCHETYPE: VoiceArchetype = "neutral_female";

const DEEPGRAM_VOICE_LIBRARY: Record<VoiceArchetype, VoiceModel[]> = {
  child: [
    {
      description: "bright young voice for youthful or curious characters",
      gender: "feminine",
      model: "aura-2-luna-en",
      tone: "friendly, natural, youthful",
      voiceName: "Luna"
    },
    {
      description: "cheerful young voice for energetic younger characters",
      gender: "feminine",
      model: "aura-2-amalthea-en",
      tone: "engaging, natural, cheerful",
      voiceName: "Amalthea"
    }
  ],
  creature_robot: [
    {
      description: "deep synthetic-feeling voice for machines, monsters, or ancient forces",
      gender: "masculine",
      model: "aura-2-zeus-en",
      tone: "deep, smooth, imposing",
      voiceName: "Zeus"
    },
    {
      description: "controlled baritone for alien systems or mechanical guardians",
      gender: "masculine",
      model: "aura-2-saturn-en",
      tone: "knowledgeable, confident, baritone",
      voiceName: "Saturn"
    }
  ],
  elder_female: [
    {
      description: "mature calm voice for elders, queens, and wise figures",
      gender: "feminine",
      model: "aura-2-athena-en",
      tone: "calm, smooth, professional",
      voiceName: "Athena"
    },
    {
      description: "trustworthy mature voice with a smooth storytelling texture",
      gender: "feminine",
      model: "aura-2-janus-en",
      tone: "southern, smooth, trustworthy",
      voiceName: "Janus"
    }
  ],
  elder_male: [
    {
      description: "mature confident voice for kings, commanders, and old mentors",
      gender: "masculine",
      model: "aura-2-atlas-en",
      tone: "enthusiastic, confident, approachable",
      voiceName: "Atlas"
    },
    {
      description: "warm British baritone for older noble or mysterious characters",
      gender: "masculine",
      model: "aura-2-draco-en",
      tone: "warm, trustworthy, baritone",
      voiceName: "Draco"
    }
  ],
  hero_female: [
    {
      description: "clear confident lead voice for a heroic female protagonist",
      gender: "feminine",
      model: "aura-2-asteria-en",
      tone: "clear, confident, energetic",
      voiceName: "Asteria"
    },
    {
      description: "expressive energetic lead voice for bold female heroes",
      gender: "feminine",
      model: "aura-2-aurora-en",
      tone: "cheerful, expressive, energetic",
      voiceName: "Aurora"
    },
    {
      description: "confident enthusiastic voice for bright central characters",
      gender: "feminine",
      model: "aura-2-thalia-en",
      tone: "clear, confident, enthusiastic",
      voiceName: "Thalia"
    }
  ],
  hero_male: [
    {
      description: "confident lead voice for a heroic male protagonist",
      gender: "masculine",
      model: "aura-2-apollo-en",
      tone: "confident, comfortable, casual",
      voiceName: "Apollo"
    },
    {
      description: "warm energetic lead voice for brave or caring male heroes",
      gender: "masculine",
      model: "aura-2-aries-en",
      tone: "warm, energetic, caring",
      voiceName: "Aries"
    },
    {
      description: "clear trustworthy voice for disciplined heroic characters",
      gender: "masculine",
      model: "aura-2-orpheus-en",
      tone: "professional, clear, confident",
      voiceName: "Orpheus"
    }
  ],
  mentor_female: [
    {
      description: "warm storytelling voice for guides, mentors, and healers",
      gender: "feminine",
      model: "aura-2-cora-en",
      tone: "smooth, melodic, caring",
      voiceName: "Cora"
    },
    {
      description: "patient empathetic voice for thoughtful mentor figures",
      gender: "feminine",
      model: "aura-2-vesta-en",
      tone: "natural, expressive, patient",
      voiceName: "Vesta"
    },
    {
      description: "positive natural voice for gentle advisors",
      gender: "feminine",
      model: "aura-2-minerva-en",
      tone: "positive, friendly, natural",
      voiceName: "Minerva"
    }
  ],
  mentor_male: [
    {
      description: "calm baritone for mentors, fathers, and old allies",
      gender: "masculine",
      model: "aura-2-pluto-en",
      tone: "smooth, calm, empathetic",
      voiceName: "Pluto"
    },
    {
      description: "patient trustworthy baritone for grounded mentor figures",
      gender: "masculine",
      model: "aura-2-mars-en",
      tone: "smooth, patient, trustworthy",
      voiceName: "Mars"
    },
    {
      description: "calm polite voice for advisors and navigators",
      gender: "masculine",
      model: "aura-2-orion-en",
      tone: "approachable, comfortable, calm",
      voiceName: "Orion"
    }
  ],
  narrator: [
    {
      description: "mature storytelling voice for narration-like characters",
      gender: "feminine",
      model: "aura-2-athena-en",
      tone: "calm, smooth, professional",
      voiceName: "Athena"
    },
    {
      description: "deep trustworthy voice for cinematic narrator roles",
      gender: "masculine",
      model: "aura-2-zeus-en",
      tone: "deep, trustworthy, smooth",
      voiceName: "Zeus"
    }
  ],
  neutral_female: [
    {
      description: "casual expressive voice for supporting female characters",
      gender: "feminine",
      model: "aura-2-andromeda-en",
      tone: "casual, expressive, comfortable",
      voiceName: "Andromeda"
    },
    {
      description: "natural friendly voice for grounded female characters",
      gender: "feminine",
      model: "aura-2-helena-en",
      tone: "caring, natural, friendly",
      voiceName: "Helena"
    },
    {
      description: "warm professional voice for composed female characters",
      gender: "feminine",
      model: "aura-2-hera-en",
      tone: "smooth, warm, professional",
      voiceName: "Hera"
    }
  ],
  neutral_male: [
    {
      description: "natural clear voice for supporting male characters",
      gender: "masculine",
      model: "aura-2-arcas-en",
      tone: "natural, smooth, clear",
      voiceName: "Arcas"
    },
    {
      description: "expressive professional voice for capable male characters",
      gender: "masculine",
      model: "aura-2-hermes-en",
      tone: "expressive, engaging, professional",
      voiceName: "Hermes"
    },
    {
      description: "polite patient voice for official or ordinary male characters",
      gender: "masculine",
      model: "aura-2-neptune-en",
      tone: "professional, patient, polite",
      voiceName: "Neptune"
    }
  ],
  villain_female: [
    {
      description: "cool mature voice for elegant female antagonists",
      gender: "feminine",
      model: "aura-2-athena-en",
      tone: "calm, smooth, controlled",
      voiceName: "Athena"
    },
    {
      description: "British melodic voice for deceptive or mysterious female villains",
      gender: "feminine",
      model: "aura-2-pandora-en",
      tone: "smooth, calm, melodic",
      voiceName: "Pandora"
    },
    {
      description: "smooth trustworthy voice for manipulative female antagonists",
      gender: "feminine",
      model: "aura-2-janus-en",
      tone: "smooth, trustworthy, dangerous",
      voiceName: "Janus"
    }
  ],
  villain_male: [
    {
      description: "deep commanding voice for male antagonists",
      gender: "masculine",
      model: "aura-2-zeus-en",
      tone: "deep, smooth, imposing",
      voiceName: "Zeus"
    },
    {
      description: "baritone knowledgeable voice for calculating villains",
      gender: "masculine",
      model: "aura-2-jupiter-en",
      tone: "expressive, knowledgeable, baritone",
      voiceName: "Jupiter"
    },
    {
      description: "British baritone for aristocratic or ancient villains",
      gender: "masculine",
      model: "aura-2-draco-en",
      tone: "warm, baritone, unsettling",
      voiceName: "Draco"
    }
  ],
  young_female: [
    {
      description: "friendly young adult voice for energetic female characters",
      gender: "feminine",
      model: "aura-2-luna-en",
      tone: "friendly, natural, engaging",
      voiceName: "Luna"
    },
    {
      description: "warm polite young adult voice for sincere female characters",
      gender: "feminine",
      model: "aura-2-cordelia-en",
      tone: "approachable, warm, polite",
      voiceName: "Cordelia"
    },
    {
      description: "positive approachable voice for youthful optimistic characters",
      gender: "feminine",
      model: "aura-2-iris-en",
      tone: "cheerful, positive, approachable",
      voiceName: "Iris"
    }
  ],
  young_male: [
    {
      description: "warm energetic young male voice",
      gender: "masculine",
      model: "aura-2-aries-en",
      tone: "warm, energetic, caring",
      voiceName: "Aries"
    },
    {
      description: "natural comfortable young male voice",
      gender: "masculine",
      model: "aura-2-apollo-en",
      tone: "confident, comfortable, casual",
      voiceName: "Apollo"
    }
  ]
};

type EnvMap = Record<string, string>;

function loadLooseEnvFile(filename: string): EnvMap {
  try {
    const content = readFileSync(join(process.cwd(), filename), "utf8");
    return content.split(/\r?\n/).reduce<EnvMap>((accumulator, line) => {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        return accumulator;
      }

      const [rawKey, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
      accumulator[rawKey.trim().toLowerCase()] = value;
      return accumulator;
    }, {});
  } catch {
    return {};
  }
}

const looseEnv = {
  ...loadLooseEnvFile(".env.example"),
  ...loadLooseEnvFile(".env"),
  ...loadLooseEnvFile(".env.local")
};

function getEnvValue(names: string[]) {
  for (const name of names) {
    const runtimeValue = process.env[name];

    if (runtimeValue) {
      return runtimeValue;
    }

    const looseValue = looseEnv[name.toLowerCase()];

    if (looseValue) {
      return looseValue;
    }
  }

  return "";
}

function clampSceneCount(value: unknown) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 3;
  }

  return Math.max(1, Math.min(MAX_SCENES, Math.round(numericValue)));
}

function textValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function listValue(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const items = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

    if (items.length > 0) {
      return Array.from(new Set(items));
    }
  }

  if (typeof value === "string" && value.trim()) {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (items.length > 0) {
      return Array.from(new Set(items));
    }
  }

  return fallback;
}

function normalizeVoiceArchetype(
  value: unknown,
  character = "",
  delivery = ""
): VoiceArchetype {
  const requested = textValue(value, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (requested in DEEPGRAM_VOICE_LIBRARY) {
    return requested as VoiceArchetype;
  }

  const combined = `${character} ${delivery}`.toLowerCase();

  if (combined.includes("robot") || combined.includes("android") || combined.includes("machine") || combined.includes("creature")) {
    return "creature_robot";
  }

  if (combined.includes("villain") || combined.includes("enemy") || combined.includes("queen") || combined.includes("witch")) {
    return combined.includes("male") || combined.includes("king") || combined.includes("lord")
      ? "villain_male"
      : "villain_female";
  }

  if (combined.includes("hero") || combined.includes("pilot") || combined.includes("detective") || combined.includes("captain")) {
    return combined.includes("female") || combined.includes("woman") || combined.includes("girl")
      ? "hero_female"
      : "hero_male";
  }

  if (combined.includes("mentor") || combined.includes("guide") || combined.includes("teacher") || combined.includes("doctor")) {
    return combined.includes("female") || combined.includes("woman") ? "mentor_female" : "mentor_male";
  }

  if (combined.includes("elder") || combined.includes("old") || combined.includes("ancient")) {
    return combined.includes("female") || combined.includes("woman") ? "elder_female" : "elder_male";
  }

  if (combined.includes("boy") || combined.includes("young man")) {
    return "young_male";
  }

  if (combined.includes("girl") || combined.includes("young woman")) {
    return "young_female";
  }

  if (combined.includes("male") || combined.includes("man") || combined.includes("father") || combined.includes("brother")) {
    return "neutral_male";
  }

  if (combined.includes("female") || combined.includes("woman") || combined.includes("mother") || combined.includes("sister")) {
    return "neutral_female";
  }

  return DEFAULT_VOICE_ARCHETYPE;
}

function selectVoiceModel(
  archetype: VoiceArchetype,
  archetypeIndex: number,
  usedModels: Set<string>
) {
  const models = DEEPGRAM_VOICE_LIBRARY[archetype] ?? DEEPGRAM_VOICE_LIBRARY[DEFAULT_VOICE_ARCHETYPE];
  const unusedModel = models.find((model) => !usedModels.has(model.model));
  const selectedModel = unusedModel ?? models[archetypeIndex % models.length];
  usedModels.add(selectedModel.model);
  return selectedModel;
}

function createCharacterVoice(params: {
  archetype: VoiceArchetype;
  archetypeIndex: number;
  character: string;
  tone: string;
  usedModels: Set<string>;
}): MovieCharacterVoice {
  const selectedModel = selectVoiceModel(params.archetype, params.archetypeIndex, params.usedModels);

  return {
    archetype: params.archetype,
    character: params.character,
    deepgramModel: selectedModel.model,
    description: selectedModel.description,
    gender: selectedModel.gender,
    tone: params.tone || selectedModel.tone,
    voiceName: selectedModel.voiceName
  };
}

function assignCharacterVoices(scenes: MovieScene[]) {
  const profilesByCharacter = new Map<string, MovieCharacterVoice>();
  const archetypeCounts = new Map<VoiceArchetype, number>();
  const usedModels = new Set<string>();

  const voicedScenes = scenes.map((scene) => ({
    ...scene,
    dialogues: scene.dialogues.map((dialogue) => {
      const characterKey = dialogue.character.toLowerCase();
      let profile = profilesByCharacter.get(characterKey);
      const archetype = normalizeVoiceArchetype(
        dialogue.voiceProfile.archetype,
        dialogue.character,
        dialogue.delivery
      );
      const performanceTone = dialogue.voiceProfile.tone || dialogue.delivery;

      if (!profile) {
        const archetypeIndex = archetypeCounts.get(archetype) ?? 0;
        profile = createCharacterVoice({
          archetype,
          archetypeIndex,
          character: dialogue.character,
          tone: performanceTone,
          usedModels
        });
        profilesByCharacter.set(characterKey, profile);
        archetypeCounts.set(archetype, archetypeIndex + 1);
      }

      return {
        ...dialogue,
        voiceProfile: {
          ...profile,
          tone: performanceTone
        }
      };
    })
  }));

  return {
    characterVoices: Array.from(profilesByCharacter.values()),
    scenes: voicedScenes
  };
}

function buildGeminiPrompt(request: Required<Pick<VideoGenerationRequest, "scenario">> & {
  genres: string[];
  sceneCount: number;
  tones: string[];
}) {
  return `You are the Omni-Narrative Engine, a cinematic story director for an AI video creation module.

Create a scene-by-scene short movie script from the user's scenario.

User scenario:
${request.scenario}

Creative constraints:
- Genre palette: ${request.genres.join(", ")}
- Tone palette: ${request.tones.join(", ")}
- Scene count: exactly ${request.sceneCount}
- The movie may blend multiple genres. Assign each scene a sceneGenre such as "Sci-Fi + Comedy" or "Mystery + Suspense" when useful.
- The movie may shift tones scene by scene. Assign each scene a sceneTone based on what is happening in that moment.
- Make it feel like a proper short film, with a clear beginning, escalation, climax, and ending.
- Each scene must include cinematic narration and character dialogue.
- Use multiple speaking characters when the story naturally needs them.
- Give every character a stable name, role, and voice direction.
- Dialogues must be speakable by a text-to-speech system. Do not put stage directions inside dialogue lines.
- Keep each dialogue line under 180 characters.
- Keep narration under 450 characters per scene.
- Produce image and sound prompts for future visual/audio modules.
- Make delivery and voiceTone situation-aware for each line. In suspenseful moments, lines can be quieter, slower, tense, or hesitant. In funny moments, lines can be lighter, quicker, dry, awkward, or playful. In emotional moments, lines can be soft, shaken, sincere, or restrained.
- Keep each character's voiceArchetype stable to represent identity, but vary delivery and voiceTone per scene and per line to match the current situation.
- For each dialogue line, set voiceArchetype to exactly one of:
  hero_male, hero_female, villain_male, villain_female, mentor_male, mentor_female,
  elder_male, elder_female, young_male, young_female, child, creature_robot,
  neutral_male, neutral_female, narrator.
- Use voiceTone to describe performance tone for that exact line, like "low and threatening" or "bright but afraid".

Return JSON only. Do not include markdown.
Use this exact shape:
{
  "title": "Movie title",
  "logline": "One-sentence story hook",
  "genre": "Final genre label",
  "tone": "Final tone label",
  "estimatedRuntime": "3-5 minutes",
  "scenes": [
    {
      "sceneNumber": 1,
      "title": "Scene title",
      "location": "Specific location",
      "mood": "Dominant emotion",
      "sceneGenre": "Scene-level genre blend",
      "sceneTone": "Scene-level tone blend",
      "estimatedDuration": "45 seconds",
      "narration": "Narration paragraph",
      "directorNotes": "Camera and pacing notes",
      "visualPrompt": "Cinematic scene description",
      "imagePrompt": "Detailed image generation prompt",
      "soundDesign": "Ambience/music direction",
      "dialogues": [
        {
          "character": "Character name",
          "delivery": "calm, tense, whispered, heroic, etc.",
          "line": "Dialogue line",
          "voiceArchetype": "hero_male",
          "voiceTone": "confident but emotionally restrained"
        }
      ]
    }
  ]
}`;
}

function extractGeminiText(payload: unknown) {
  const candidates = (payload as { candidates?: unknown[] }).candidates;

  if (!Array.isArray(candidates)) {
    return "";
  }

  return candidates
    .flatMap((candidate) => {
      const parts = (candidate as { content?: { parts?: unknown[] } }).content?.parts;
      return Array.isArray(parts) ? parts : [];
    })
    .map((part) => (part as { text?: unknown }).text)
    .filter((text): text is string => typeof text === "string")
    .join("\n");
}

function extractGroqText(payload: unknown) {
  const choices = (payload as { choices?: unknown[] }).choices;

  if (!Array.isArray(choices)) {
    return "";
  }

  return choices
    .map((choice) => (choice as { message?: { content?: unknown } }).message?.content)
    .filter((content): content is string => typeof content === "string")
    .join("\n");
}

function parseJsonFromText(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Gemini did not return a JSON object.");
  }

  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
}

function normalizeDialogue(
  dialogue: unknown,
  sceneIndex: number,
  dialogueIndex: number
): MovieDialogueLine {
  const source = typeof dialogue === "object" && dialogue ? dialogue as Record<string, unknown> : {};
  const character = textValue(source.character, `Character ${dialogueIndex + 1}`);
  const delivery = textValue(source.delivery, "natural");
  const archetype = normalizeVoiceArchetype(source.voiceArchetype, character, delivery);
  const defaultModel = DEEPGRAM_VOICE_LIBRARY[archetype][0];

  return {
    character,
    delivery,
    id: `scene-${sceneIndex + 1}-dialogue-${dialogueIndex + 1}`,
    line: textValue(source.line, "We keep moving. The story is not finished yet."),
    voiceProfile: {
      archetype,
      character,
      deepgramModel: defaultModel.model,
      description: defaultModel.description,
      gender: defaultModel.gender,
      tone: textValue(source.voiceTone, delivery),
      voiceName: defaultModel.voiceName
    }
  };
}

function normalizeScene(scene: unknown, index: number): MovieScene {
  const source = typeof scene === "object" && scene ? scene as Record<string, unknown> : {};
  const rawDialogues = Array.isArray(source.dialogues) ? source.dialogues : [];
  const dialogues = rawDialogues.slice(0, 5).map((dialogue, dialogueIndex) =>
    normalizeDialogue(dialogue, index, dialogueIndex)
  );

  if (dialogues.length === 0) {
    dialogues.push(normalizeDialogue({}, index, 0));
  }

  return {
    dialogues,
    directorNotes: textValue(source.directorNotes, "Use measured pacing, expressive close-ups, and a clear emotional turn."),
    estimatedDuration: textValue(source.estimatedDuration, "45 seconds"),
    imagePrompt: textValue(source.imagePrompt, "Cinematic film still, detailed lighting, expressive characters, atmospheric setting."),
    location: textValue(source.location, "Unknown Location"),
    mood: textValue(source.mood, "Dramatic"),
    narration: textValue(source.narration, "The scene opens with a decisive moment that changes the direction of the story."),
    sceneNumber: index + 1,
    sceneGenre: textValue(source.sceneGenre, "Cinematic Drama"),
    sceneTone: textValue(source.sceneTone, textValue(source.mood, "Dramatic")),
    soundDesign: textValue(source.soundDesign, "Subtle ambience with a controlled cinematic rise."),
    title: textValue(source.title, `Scene ${index + 1}`),
    visualPrompt: textValue(source.visualPrompt, "A cinematic scene with clear character blocking and strong atmosphere.")
  };
}

async function generateMovieScript(params: {
  apiKey: string;
  genres: string[];
  model: string;
  sceneCount: number;
  scenario: string;
  tones: string[];
}) {
  const response = await fetch(
    `${GEMINI_ENDPOINT}/${encodeURIComponent(params.model)}:generateContent`,
    {
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildGeminiPrompt(params) }]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.85
        }
      }),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey
      },
      method: "POST"
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const payload = await response.json() as unknown;
  const text = extractGeminiText(payload);
  const parsed = parseJsonFromText(text);
  const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];

  if (rawScenes.length === 0) {
    throw new Error("Gemini returned no scenes.");
  }

  const scenes = rawScenes.slice(0, params.sceneCount).map(normalizeScene);
  const voiceResult = assignCharacterVoices(scenes);

  return {
    characterVoices: voiceResult.characterVoices,
    estimatedRuntime: textValue(parsed.estimatedRuntime, `${params.sceneCount * 45} seconds`),
    genre: textValue(parsed.genre, params.genres.join(" + ")),
    logline: textValue(parsed.logline, "A cinematic short generated from the user's scenario."),
    scenes: voiceResult.scenes,
    title: textValue(parsed.title, "Untitled Omni-Narrative Film"),
    tone: textValue(parsed.tone, params.tones.join(" + "))
  };
}

async function generateMovieScriptWithGroq(params: {
  apiKey: string;
  genres: string[];
  model: string;
  sceneCount: number;
  scenario: string;
  tones: string[];
}) {
  const response = await fetch(
    GROQ_ENDPOINT,
    {
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are the Omni-Narrative Engine. Return valid JSON only, with no markdown."
          },
          {
            role: "user",
            content: buildGeminiPrompt(params)
          }
        ],
        model: params.model,
        response_format: { type: "json_object" },
        temperature: 0.85
      }),
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq fallback request failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const payload = await response.json() as unknown;
  const text = extractGroqText(payload);
  const parsed = parseJsonFromText(text);
  const rawScenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];

  if (rawScenes.length === 0) {
    throw new Error("Groq fallback returned no scenes.");
  }

  const scenes = rawScenes.slice(0, params.sceneCount).map(normalizeScene);
  const voiceResult = assignCharacterVoices(scenes);

  return {
    characterVoices: voiceResult.characterVoices,
    estimatedRuntime: textValue(parsed.estimatedRuntime, `${params.sceneCount * 45} seconds`),
    genre: textValue(parsed.genre, params.genres.join(" + ")),
    logline: textValue(parsed.logline, "A cinematic short generated from the user's scenario."),
    scenes: voiceResult.scenes,
    title: textValue(parsed.title, "Untitled Omni-Narrative Film"),
    tone: textValue(parsed.tone, params.tones.join(" + "))
  };
}

async function generateMovieScriptWithFallback(params: {
  geminiApiKey: string;
  genres: string[];
  sceneCount: number;
  scenario: string;
  tones: string[];
}) {
  const geminiModel = getEnvValue(["GEMINI_MODEL"]) || DEFAULT_GEMINI_MODEL;
  const groqApiKey = getEnvValue([
    "GROQ_FALLBACK_API",
    "GROQ_API_KEY",
    "groq_fallback_api"
  ]);

  try {
    return await generateMovieScript({
      apiKey: params.geminiApiKey,
      genres: params.genres,
      model: geminiModel,
      sceneCount: params.sceneCount,
      scenario: params.scenario,
      tones: params.tones
    });
  } catch (geminiError) {
    if (!groqApiKey) {
      throw geminiError;
    }

    try {
      return await generateMovieScriptWithGroq({
        apiKey: groqApiKey,
        genres: params.genres,
        model: getEnvValue(["GROQ_FALLBACK_MODEL", "GROQ_MODEL"]) || DEFAULT_GROQ_MODEL,
        sceneCount: params.sceneCount,
        scenario: params.scenario,
        tones: params.tones
      });
    } catch (groqError) {
      const geminiMessage = geminiError instanceof Error ? geminiError.message : "Gemini request failed.";
      const groqMessage = groqError instanceof Error ? groqError.message : "Groq fallback failed.";
      throw new Error(`${geminiMessage} Groq fallback also failed: ${groqMessage}`);
    }
  }
}

function applySituationalSpeechPacing(line: MovieDialogueLine, scene: MovieScene) {
  const situation = `${scene.sceneTone} ${scene.mood} ${line.delivery} ${line.voiceProfile.tone}`.toLowerCase();
  let text = line.line.trim();

  if (!text) {
    return text;
  }

  if (situation.includes("suspense") || situation.includes("tense") || situation.includes("fear") || situation.includes("whisper")) {
    text = text.replace(/, /g, "... ");

    if (!/[.!?]$/.test(text)) {
      text += "...";
    }
  } else if (situation.includes("funny") || situation.includes("comic") || situation.includes("playful") || situation.includes("awkward")) {
    if (text.length < 120 && !/[!?]$/.test(text)) {
      text = text.replace(/\.$/, "");
      text += "!";
    }
  } else if (situation.includes("emotional") || situation.includes("sad") || situation.includes("soft") || situation.includes("shaken")) {
    text = text.replace(/, /g, "... ");

    if (text.endsWith(".")) {
      text = text.slice(0, -1) + "...";
    }
  } else if (situation.includes("epic") || situation.includes("heroic") || situation.includes("angry")) {
    if (text.endsWith(".")) {
      text = text.slice(0, -1) + "!";
    }
  }

  return text;
}

async function generateDeepgramDialogueAudio(params: {
  apiKey: string;
  scene: MovieScene;
  line: MovieDialogueLine;
  model: string;
}) {
  const url = new URL(DEEPGRAM_TTS_ENDPOINT);
  url.searchParams.set("model", params.model);

  const response = await fetch(
    url.toString(),
    {
      body: JSON.stringify({
        text: applySituationalSpeechPacing(params.line, params.scene)
      }),
      headers: {
        Authorization: `Token ${params.apiKey}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Deepgram TTS ${params.line.id} failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const audio = await response.arrayBuffer();
  const base64Audio = Buffer.from(audio).toString("base64");
  const contentType = response.headers.get("content-type") ?? "audio/mpeg";

  return {
    ...params.line,
    audioMimeType: contentType,
    audioUrl: `data:${contentType};base64,${base64Audio}`
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function attachDeepgramDialogueAudio(scenes: MovieScene[], apiKey: string) {
  const fallbackModel = getEnvValue(["DEEPGRAM_TTS_MODEL", "deepgramttsmodel"]) || DEFAULT_DEEPGRAM_TTS_MODEL;
  const dialogueRefs = scenes.flatMap((scene, sceneIndex) =>
    scene.dialogues.map((line, dialogueIndex) => ({ dialogueIndex, line, scene, sceneIndex }))
  ).slice(0, MAX_AUDIO_LINES);
  const errors: string[] = [];
  let generatedCount = 0;

  const generatedLines = await mapWithConcurrency(dialogueRefs, 3, async (reference, index) => {
    try {
      const line = await generateDeepgramDialogueAudio({
        apiKey,
        line: reference.line,
        scene: reference.scene,
        model: reference.line.voiceProfile.deepgramModel || fallbackModel
      });
      generatedCount += 1;
      return { ...reference, line };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Deepgram TTS audio error";
      errors.push(message);
      return {
        ...reference,
        line: {
          ...reference.line,
          audioError: message
        }
      };
    }
  });

  const nextScenes = scenes.map((scene) => ({
    ...scene,
    dialogues: scene.dialogues.map((dialogue) => ({ ...dialogue }))
  }));

  for (const generatedLine of generatedLines) {
    nextScenes[generatedLine.sceneIndex].dialogues[generatedLine.dialogueIndex] = generatedLine.line;
  }

  if (dialogueRefs.length < scenes.flatMap((scene) => scene.dialogues).length) {
    errors.push(`Audio was limited to the first ${MAX_AUDIO_LINES} dialogue lines to control response size and API usage.`);
  }

  return {
    errors,
    generatedCount,
    scenes: nextScenes
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as VideoGenerationRequest;
    const scenario = textValue(body.scenario, "");

    if (scenario.length < 12) {
      return NextResponse.json(
        { error: "Please provide a clearer video scenario before generating." },
        { status: 400 }
      );
    }

    const geminiApiKey = getEnvValue([
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "gemini llm api key"
    ]);

    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "Gemini API key is missing. Add GEMINI_API_KEY in .env.local." },
        { status: 500 }
      );
    }

    const sceneCount = clampSceneCount(body.sceneCount);
    const genres = listValue(body.genre, ["Cinematic Drama"]);
    const tones = listValue(body.tone, ["Immersive and emotional"]);
    const includeAudio = body.includeAudio !== false;
    const script = await generateMovieScriptWithFallback({
      geminiApiKey,
      genres,
      sceneCount,
      scenario,
      tones
    });
    const deepgramTtsApiKey = getEnvValue([
      "DEEPGRAM_TTS_API_KEY",
      "DEEPGRAM_API_KEY",
      "deepgramtts"
    ]);
    let scenes = script.scenes;
    let audioErrors: string[] = [];
    let generatedCount = 0;
    const audioProvider = "Deepgram TTS";

    if (includeAudio && deepgramTtsApiKey) {
      const audioResult = await attachDeepgramDialogueAudio(script.scenes, deepgramTtsApiKey);
      scenes = audioResult.scenes;
      audioErrors = audioResult.errors;
      generatedCount = audioResult.generatedCount;
    } else if (includeAudio) {
      audioErrors = ["Deepgram TTS key is missing. Add DEEPGRAM_TTS_API_KEY or deepgramtts in .env.local."];
    }

    const payload: VideoGenerationResponse = {
      audio: {
        errors: audioErrors,
        generatedCount,
        provider: audioProvider,
        requested: includeAudio
      },
      estimatedRuntime: script.estimatedRuntime,
      generatedAt: new Date().toISOString(),
      genre: script.genre,
      id: crypto.randomUUID(),
      characterVoices: script.characterVoices,
      logline: script.logline,
      scenes,
      title: script.title,
      tone: script.tone
    };

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video generation failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
