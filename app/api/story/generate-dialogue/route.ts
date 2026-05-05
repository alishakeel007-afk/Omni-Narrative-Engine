import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const runtime = "nodejs";

function getGeminiKey() {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
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

    const apiKey = getGeminiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing from .env.local" },
        { status: 500 }
      );
    }

    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const prompt = buildDialoguePrompt({
      characters: characters || [],
      genres: genres || ["Cinematic"],
      previousScenes: previousScenes || [],
      sceneDescription: String(sceneDescription).trim(),
      sceneNumber: sceneNumber || 1,
      storyTitle: storyTitle || "Untitled Story",
      tones: tones || ["Dramatic"],
    });

    const response = await fetch(
      `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, responseMimeType: "application/json" },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `Gemini error (${response.status}): ${errText.slice(0, 300)}` },
        { status: 500 }
      );
    }

    const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const rawText =
      payload.candidates
        ?.flatMap((c) => c.content?.parts ?? [])
        .map((p) => p.text ?? "")
        .join("") ?? "";

    let dialogues: { characterId: string; characterName: string; text: string }[] = [];
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        dialogues = parsed
          .filter((d) => d && typeof d.characterId === "string" && typeof d.text === "string")
          .map((d) => ({
            characterId: String(d.characterId),
            characterName: String(d.characterName || ""),
            text: String(d.text).trim(),
          }));
      }
    } catch {
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) {
            dialogues = parsed
              .filter((d) => d && typeof d.characterId === "string")
              .map((d) => ({
                characterId: String(d.characterId),
                characterName: String(d.characterName || ""),
                text: String(d.text || "").trim(),
              }));
          }
        } catch { /* keep empty */ }
      }
    }

    if (dialogues.length === 0) {
      return NextResponse.json(
        { error: "Gemini returned no dialogue lines." },
        { status: 500 }
      );
    }

    return NextResponse.json({ dialogues });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dialogue generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
