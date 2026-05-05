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

function buildSuggestionsPrompt(params: {
  characters: { name: string; role: string; personalityTone: string }[];
  genres: string[];
  previousScenes: { sceneNumber: number; title: string; description: string }[];
  sceneNumber: number;
  storyTitle: string;
  tones: string[];
}) {
  const charList = params.characters
    .map((c) => `- ${c.name} (${c.role}): ${c.personalityTone}`)
    .join("\n");
  const prevScenes =
    params.previousScenes.length > 0
      ? params.previousScenes
          .map((s) => `Scene ${s.sceneNumber} — "${s.title}": ${s.description}`)
          .join("\n")
      : "This is the first scene.";

  return `You are the Omni-Narrative Engine, an AI story director.

Story: "${params.storyTitle}"
Genres: ${params.genres.join(", ")}
Tones: ${params.tones.join(", ")}

Characters:
${charList}

Previous scenes:
${prevScenes}

Generate exactly 3 distinct, creative scene suggestions for Scene ${params.sceneNumber}.
Each suggestion should:
- Be contextually relevant to what came before
- Move the story forward in a meaningful way
- Feel cinematically engaging
- Be 1-2 sentences (under 200 characters each)

Return ONLY a JSON array with exactly 3 strings. No markdown, no extra text.
Example: ["Suggestion one.", "Suggestion two.", "Suggestion three."]`;
}

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { storyTitle, genres, tones, characters, sceneNumber, previousScenes } = body;

    const apiKey = getGeminiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is missing from .env.local" },
        { status: 500 }
      );
    }

    const model = process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const prompt = buildSuggestionsPrompt({
      characters: characters || [],
      genres: genres || ["Cinematic"],
      previousScenes: previousScenes || [],
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
          generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
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

    let suggestions: string[] = [];
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        suggestions = parsed.slice(0, 3).map((s) => String(s).trim());
      }
    } catch {
      // fallback — try to extract array content from raw text
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          suggestions = JSON.parse(match[0]).slice(0, 3).map((s: unknown) => String(s).trim());
        } catch { /* keep empty */ }
      }
    }

    if (suggestions.length === 0) {
      return NextResponse.json(
        { error: "Gemini returned no suggestions." },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scene suggestion failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
