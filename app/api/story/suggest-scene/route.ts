import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchGeminiWithRetry, toGeminiRequestError } from "@/lib/gemini-retry";

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
  currentSceneDescription?: string;
  previousScenes: { sceneNumber: number; title: string; description: string; dialogues?: { characterName: string; text: string }[] }[];
  sceneGenre?: string;
  sceneNumber: number;
  sceneTitle: string;
  sceneTone?: string;
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
  const dialogueContext = params.previousScenes
    .map((scene) => {
      const dialogue = scene.dialogues
        ?.filter((line) => line.text.trim())
        .map((line) => `${line.characterName}: "${line.text}"`)
        .join("\n") ?? "";
      return dialogue ? `Scene ${scene.sceneNumber} dialogue:\n${dialogue}` : "";
    })
    .filter(Boolean)
    .join("\n");

  return `You are the Omni-Narrative Engine, an AI story director.

Story: "${params.storyTitle}"
Genres: ${params.genres.join(", ")}
Tones: ${params.tones.join(", ")}

Characters:
${charList}

Established scene, event, and relationship context:
${prevScenes}
${dialogueContext}

Next scene the author is planning:
- Scene number: ${params.sceneNumber}
- Scene title: "${params.sceneTitle}"
- Scene genre: ${params.sceneGenre || params.genres.join(", ")}
- Scene tone: ${params.sceneTone || params.tones.join(", ")}
- Existing scene idea, if any: ${params.currentSceneDescription?.trim() || "None yet"}

Generate exactly 3 distinct, coherent next-scene directions. They must be meaningful alternatives, not paraphrases.
Each suggestion should:
- Follow the planned scene title when it is meaningful, while allowing the author to edit it afterward
- Treat any name, place, object, or event mentioned in the scene title as intentional, even if it is not in the character list
- Do not force existing character names into the scene unless the title, prior context, or story logic naturally calls for them
- Respect established character relationships, facts, and important events from the context; do not invent contradictions
- Move the story forward in a meaningful way
- Match the current scene genre and tone
- Feel cinematically engaging
- Be 1-2 sentences (under 200 characters each)

Return ONLY a JSON array with exactly 3 strings. No markdown, no extra text.
Example: ["Suggestion one.", "Suggestion two.", "Suggestion three."]`;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const session = user ? { userId: user.id } : null;
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      characters,
      currentSceneDescription,
      genres,
      previousScenes,
      sceneGenre,
      sceneNumber,
      sceneTitle,
      sceneTone,
      storyTitle,
      tones
    } = body;

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
      currentSceneDescription: String(currentSceneDescription || ""),
      genres: genres || ["Cinematic"],
      previousScenes: Array.isArray(previousScenes)
        ? previousScenes.map((scene) => ({
            sceneNumber: Number(scene?.sceneNumber) || 1,
            title: String(scene?.title || "Untitled Scene"),
            description: String(scene?.description || ""),
            dialogues: Array.isArray(scene?.dialogues)
              ? scene.dialogues
                  .filter((line: unknown) => line && typeof (line as { text?: unknown }).text === "string")
                  .map((line: { characterName?: unknown; text: string }) => ({
                    characterName: String(line.characterName || "Character"),
                    text: line.text.trim(),
                  }))
              : [],
          }))
        : [],
      sceneGenre: String(sceneGenre || ""),
      sceneNumber: sceneNumber || 1,
      sceneTitle: String(sceneTitle || `Scene ${sceneNumber || 1}`),
      sceneTone: String(sceneTone || ""),
      storyTitle: storyTitle || "Untitled Story",
      tones: tones || ["Dramatic"],
    });

    const response = await fetchGeminiWithRetry({
      request: (signal) => fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
        }),
        signal,
      })
    });

    if (!response.ok) {
      const geminiError = await toGeminiRequestError(response, "scene suggestion");
      return NextResponse.json(
        { error: geminiError.message },
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
      if (Array.isArray(parsed)) {
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

    const distinctSuggestions = Array.from(new Map(
      suggestions
        .filter((suggestion) => suggestion.length > 0 && suggestion.length <= 400)
        .map((suggestion) => [suggestion.toLocaleLowerCase().replace(/\s+/g, " ").trim(), suggestion] as const),
    ).values());
    if (distinctSuggestions.length !== 3) {
      return NextResponse.json(
        { error: "The AI did not return three distinct scene suggestions. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json({ suggestions: distinctSuggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scene suggestion failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
