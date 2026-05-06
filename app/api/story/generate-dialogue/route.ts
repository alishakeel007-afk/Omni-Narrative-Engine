import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export const runtime = "nodejs";

function getGeminiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    ""
  );
}

function getGroqFallbackKey() {
  return (
    process.env.GROQ_FALLBACK_API ||
    process.env.GROQ_API_KEY ||
    ""
  );
}

function buildDialoguePrompt(params: {
  characters: { id: string; name: string; role: string; personalityTone: string; voiceStyle: string }[];
  genres: string[];
  previousScenes: { sceneNumber: number; title: string; description: string; dialogues?: { characterName: string; text: string }[] }[];
  sceneDescription: string;
  sceneNumber: number;
  storyTitle: string;
  tones: string[];
}) {
  const charList = params.characters
    .map((c) => `- ${c.name} (Role: ${c.role}, Personality: ${c.personalityTone}, Voice: ${c.voiceStyle})`)
    .join("\n");

  const prevContext =
    params.previousScenes.length > 0
      ? params.previousScenes
          .map((s) => {
            const dialogLines = s.dialogues
              ?.filter((d) => d.text.trim())
              .map((d) => `  ${d.characterName}: "${d.text}"`)
              .join("\n") ?? "";
            return `Scene ${s.sceneNumber} — "${s.title}": ${s.description}\n${dialogLines}`;
          })
          .join("\n\n")
      : "This is the first scene.";

  return `You are the Omni-Narrative Engine, a cinematic dialogue writer.

Story: "${params.storyTitle}"
Genres: ${params.genres.join(", ")}
Tones: ${params.tones.join(", ")}

Characters:
${charList}

Previous scenes context:
${prevContext}

Current scene ${params.sceneNumber} description:
${params.sceneDescription}

Write one dialogue line for EACH character, relevant to this scene. Each line should:
- Match the character's personality and role
- Be consistent with previous scenes and dialogues
- Be suitable for text-to-speech (no stage directions in the text)
- Be under 200 characters
- Feel natural and cinematic

Return ONLY a JSON array. Each item has: characterId (string), characterName (string), text (string).
The characterId values must exactly match: ${params.characters.map((c) => `"${c.id}"`).join(", ")}

Example format:
[{"characterId": "id1", "characterName": "Name", "text": "Dialogue line here."}]`;
}

function extractGeminiText(payload: unknown) {
  return (
    (payload as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates
      ?.flatMap((candidate) => candidate.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("") ?? ""
  );
}

function extractGroqText(payload: unknown) {
  return (
    (payload as { choices?: { message?: { content?: string } }[] }).choices
      ?.map((choice) => choice.message?.content ?? "")
      .join("") ?? ""
  );
}

function parseDialogues(rawText: string) {
  let dialogues: { characterId: string; characterName: string; text: string }[] = [];

  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    const source = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.dialogues)
        ? parsed.dialogues
        : [];

    dialogues = source
      .filter((dialogue: unknown) => {
        const item = dialogue as { characterId?: unknown; text?: unknown };
        return item && typeof item.characterId === "string" && typeof item.text === "string";
      })
      .map((dialogue: { characterId: string; characterName?: string; text: string }) => ({
        characterId: String(dialogue.characterId),
        characterName: String(dialogue.characterName || ""),
        text: String(dialogue.text).trim(),
      }));
  } catch {
    const match = rawText.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          dialogues = parsed
            .filter((dialogue) => dialogue && typeof dialogue.characterId === "string")
            .map((dialogue) => ({
              characterId: String(dialogue.characterId),
              characterName: String(dialogue.characterName || ""),
              text: String(dialogue.text || "").trim(),
            }));
        }
      } catch { /* keep empty */ }
    }
  }

  return dialogues.filter((dialogue) => dialogue.text);
}

async function requestGeminiDialogue(params: {
  apiKey: string;
  prompt: string;
}) {
  const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
  const response = await fetch(
    `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: params.prompt }] }],
        generationConfig: { temperature: 0.85, responseMimeType: "application/json" },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const payload = await response.json() as unknown;
  const dialogues = parseDialogues(extractGeminiText(payload));

  if (dialogues.length === 0) {
    throw new Error("Gemini returned no dialogue lines.");
  }

  return dialogues;
}

async function requestGroqDialogue(params: {
  apiKey: string;
  prompt: string;
}) {
  const response = await fetch(GROQ_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        {
          role: "system",
          content: "You are the Omni-Narrative Engine. Return valid JSON only, with no markdown.",
        },
        {
          role: "user",
          content: params.prompt,
        },
      ],
      model: process.env.GROQ_FALLBACK_MODEL || process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL,
      temperature: 0.85,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq fallback error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const payload = await response.json() as unknown;
  const dialogues = parseDialogues(extractGroqText(payload));

  if (dialogues.length === 0) {
    throw new Error("Groq fallback returned no dialogue lines.");
  }

  return dialogues;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { storyTitle, genres, tones, characters, sceneDescription, sceneNumber, previousScenes } = body;

    if (!characters || !Array.isArray(characters) || characters.length === 0) {
      return NextResponse.json({ error: "No characters provided." }, { status: 400 });
    }

    if (!sceneDescription || !String(sceneDescription).trim()) {
      return NextResponse.json(
        { error: "Scene description is required before generating dialogue." },
        { status: 400 }
      );
    }

    const geminiApiKey = getGeminiKey();
    const groqApiKey = getGroqFallbackKey();
    if (!geminiApiKey && !groqApiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY or GROQ_FALLBACK_API is missing from .env.local" },
        { status: 500 }
      );
    }

    const prompt = buildDialoguePrompt({
      characters: characters || [],
      genres: genres || ["Cinematic"],
      previousScenes: previousScenes || [],
      sceneDescription: String(sceneDescription).trim(),
      sceneNumber: sceneNumber || 1,
      storyTitle: storyTitle || "Untitled Story",
      tones: tones || ["Dramatic"],
    });

    if (geminiApiKey) {
      try {
        const dialogues = await requestGeminiDialogue({ apiKey: geminiApiKey, prompt });
        return NextResponse.json({ dialogues, provider: "Gemini" });
      } catch (geminiError) {
        if (!groqApiKey) {
          const message = geminiError instanceof Error ? geminiError.message : "Gemini dialogue generation failed.";
          return NextResponse.json({ error: message }, { status: 500 });
        }

        try {
          const dialogues = await requestGroqDialogue({ apiKey: groqApiKey, prompt });
          return NextResponse.json({ dialogues, provider: "Groq fallback" });
        } catch (groqError) {
          const geminiMessage = geminiError instanceof Error ? geminiError.message : "Gemini dialogue generation failed.";
          const groqMessage = groqError instanceof Error ? groqError.message : "Groq fallback failed.";
          return NextResponse.json(
            { error: `${geminiMessage} Groq fallback also failed: ${groqMessage}` },
            { status: 500 }
          );
        }
      }
    }

    const dialogues = await requestGroqDialogue({ apiKey: groqApiKey, prompt });
    return NextResponse.json({ dialogues, provider: "Groq fallback" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dialogue generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
