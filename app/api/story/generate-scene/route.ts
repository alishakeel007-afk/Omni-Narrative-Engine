import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEnvValue } from "@/lib/env";
import { retrieveRelevantMemories, buildMemoryContextBlock } from "@/lib/memory/memory-service";
import { getCharacterContextBlock, upsertCharacterState } from "@/lib/story-database";
import { buildPrompt } from "@/lib/story-prompt";
import { prisma } from "@/lib/prisma";
import { normalizeGeneratedScene } from "@/lib/story-scene";
import { fetchGeminiWithRetry, toGeminiRequestError } from "@/lib/gemini-retry";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export const runtime = "nodejs";

function getGeminiKey() {
  return getEnvValue(["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]);
}

function getGroqFallbackKey() {
  return getEnvValue(["GROQ_FALLBACK_API", "GROQ_API_KEY"]);
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

function parseSceneJson(rawText: string) {
  try {
    const cleaned = rawText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    throw new Error("Failed to parse JSON from AI response.");
  }
}

async function requestGeminiScene(params: { apiKey: string; prompt: string }) {
  const model = getEnvValue(["GEMINI_MODEL"]) || DEFAULT_GEMINI_MODEL;
  const response = await fetchGeminiWithRetry({
    request: (signal) => fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": params.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: params.prompt }] }],
        generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
      }),
      signal,
    })
  });

  if (!response.ok) {
    throw await toGeminiRequestError(response, "story generation");
  }

  const payload = await response.json();
  const text = extractGeminiText(payload);
  return parseSceneJson(text);
}

async function requestGroqScene(params: { apiKey: string; prompt: string }) {
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
      model: getEnvValue(["GROQ_FALLBACK_MODEL", "GROQ_MODEL"]) || DEFAULT_GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq fallback error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const text = extractGroqText(payload);
  return parseSceneJson(text);
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
    const { setup, choice, memoryTimeline, currentScene, playerState, recentSceneHistory, sceneNumber, draftId } = body;

    if (!setup || !choice) {
      return NextResponse.json({ error: "Missing required parameters." }, { status: 400 });
    }
    if (draftId && setup.draftId && setup.draftId !== draftId) {
      return NextResponse.json({ error: "Story setup does not match the requested draft." }, { status: 400 });
    }

    const geminiApiKey = getGeminiKey();
    const groqApiKey = getGroqFallbackKey();

    if (!geminiApiKey && !groqApiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY or GROQ_FALLBACK_API is missing from environment." },
        { status: 500 }
      );
    }

    const normalizedSceneNumber = Number.isInteger(sceneNumber) && sceneNumber > 0 ? sceneNumber : 1;
    let memoryContextBlock = "";
    let characterContextBlock = "";
    if (draftId) {
      const ownedDraft = await prisma.storyDraft.findFirst({
        where: { id: draftId, project: { userId: session.userId } },
        select: { id: true }
      });
      if (!ownedDraft) return NextResponse.json({ error: "Story draft not found or access denied." }, { status: 404 });
      const queryText = `Current context: ${currentScene?.location || ''} ${currentScene?.mood || ''}. Choice: ${choice}`;
      const memories = await retrieveRelevantMemories(draftId, queryText, 8);
      memoryContextBlock = buildMemoryContextBlock(memories);
      characterContextBlock = await getCharacterContextBlock(draftId);
    }

    const prompt = buildPrompt({
      setup,
      choice,
      memoryTimeline: memoryTimeline || [],
      currentScene: currentScene || null,
      playerState: playerState && typeof playerState === "object" ? playerState : undefined,
      recentSceneHistory: Array.isArray(recentSceneHistory) ? recentSceneHistory : [],
      sceneNumber: normalizedSceneNumber,
      memoryContextBlock,
      characterContextBlock,
    });

    let sceneData;
    let provider = "Unknown";

    if (geminiApiKey) {
      try {
        sceneData = normalizeGeneratedScene(await requestGeminiScene({ apiKey: geminiApiKey, prompt }), normalizedSceneNumber);
        provider = "Gemini";
      } catch (geminiError) {
        if (!groqApiKey) {
          const message = geminiError instanceof Error ? geminiError.message : "Gemini scene generation failed.";
          return NextResponse.json({ error: message }, { status: 500 });
        }
        try {
          sceneData = normalizeGeneratedScene(await requestGroqScene({ apiKey: groqApiKey, prompt }), normalizedSceneNumber);
          provider = "Groq fallback";
        } catch (groqError) {
          const geminiMessage = geminiError instanceof Error ? geminiError.message : "Gemini generation failed.";
          const groqMessage = groqError instanceof Error ? groqError.message : "Groq fallback failed.";
          return NextResponse.json(
            { error: `${geminiMessage} Groq fallback also failed: ${groqMessage}` },
            { status: 500 }
          );
        }
      }
    } else {
      sceneData = normalizeGeneratedScene(await requestGroqScene({ apiKey: groqApiKey, prompt }), normalizedSceneNumber);
      provider = "Groq fallback";
    }

    // Auto-sync characters if draftId is present
    if (draftId && Array.isArray(sceneData.cast)) {
      await Promise.allSettled(
        sceneData.cast.map((char: any) =>
          upsertCharacterState(draftId, char.name, {
            emotionalState: char.emotionalState,
            visualAppearance: char.visualAppearance,
            sceneNumber: sceneData.sceneNumber,
          })
        )
      );
    }

    return NextResponse.json({ scene: sceneData, provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scene generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
