import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEnvValue } from "@/lib/env";
import type { StorySetupData, MemoryItem, StoryScene, PlayerPerformance } from "@/types/story";
import { validateAndFixSceneCoherence } from "@/lib/coherence/validator";
import { detectSceneEmotion } from "@/lib/emotion-engine";
import { getDifficultyModifier } from "@/lib/difficulty-engine";
import { retrieveRelevantMemories } from "@/lib/memory/rag-engine";
import { getEmbedding } from "@/lib/memory/embeddings";

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

function buildPrompt(params: {
  setup: StorySetupData;
  choice: string;
  memoryTimeline: MemoryItem[];
  currentScene: StoryScene | null;
  sceneNumber: number;
  difficultyModifier?: string | null;
  relevantMemories?: MemoryItem[];
}) {
  const { setup, choice, memoryTimeline, currentScene, sceneNumber, difficultyModifier, relevantMemories } = params;
  
  const charList = setup.characters
    .map((c) => `- ${c.name} (Role: ${c.role}, Personality: ${c.personalityTone}, Traits: ${c.traits.join(", ")}, Affinity: ${c.relationshipScore ?? 50}, Status: ${c.statusState ?? "Normal"})`)
    .join("\n");

  const recentMemories = memoryTimeline.slice(-3).map((m) => `Scene ${m.sceneNumber} (${m.choiceType}): ${m.result}`).join("\n");
  const semanticMemories = (relevantMemories || [])
    .map((m) => `Semantically Relevant Memory (Scene ${m.sceneNumber}): Choice was "${m.userChoice}" -> consequence was "${m.result}".`)
    .join("\n");

  const memoryContext = `
[RELEVANT MEMORIES (RAG)]
${semanticMemories || "No previous semantic matches."}

[RECENT TIMELINE]
${recentMemories || "Beginning of the adventure."}`;

  const currentSceneContext = currentScene 
    ? `The story was just at: ${currentScene.location}. Mood was: ${currentScene.mood}. \nLast scene text: ${currentScene.text}`
    : `Scenario: ${setup.scenarioDescription}`;

  return `You are the Omni-Narrative Engine, a cinematic story director.

Story Title: "${setup.storyTitle}"
Genres: ${setup.genres.join(", ")}
Tones/Moods: ${setup.moods.join(", ")}
Difficulty: ${setup.difficulty}

Characters:
${charList}
(Main character is ${setup.characterName})

${memoryContext}

${currentSceneContext}

The user has made the following choice to continue the story:
"${choice}"

${difficultyModifier ? `\n${difficultyModifier}\n` : ""}
Generate the next scene (Scene ${sceneNumber}). It must logically follow the previous events, respect the user's choice, and maintain narrative coherence.
Keep character personalities consistent.
If the choice involves risk or danger, reflect that in the text and mood.
You MUST explicitly evaluate if the user's choice succeeded or failed based on their character's stats and the scenario.

Return ONLY a JSON object. No markdown, no extra text.
Use this exact shape:
{
  "choiceOutcome": "Success" | "Failure" | "Neutral",
  "title": "A compelling title for the scene",
  "chapter": "Current chapter name",
  "location": "Specific location of this scene",
  "mood": "Dominant emotion or atmosphere",
  "text": "The narrative text of the scene (1-2 paragraphs). Must incorporate the consequences of the user's choice.",
  "options": [
    "A suggested action for the user to take next",
    "Another distinct suggested action",
    "A third suggested action"
  ],
  "cast": [
    {
      "name": "Character Name",
      "role": "Role",
      "emotionalState": "Current emotional state",
      "visualAppearance": "Brief visual description",
      "traits": ["Trait1", "Trait2"],
      "relationships": ["Relationship detail"],
      "imageLabel": "Short label for character image"
    }
  ],
  "media": {
    "audioMoodPrompt": "Prompt for background music generation",
    "backgroundMusicMood": "Short mood description for music",
    "imageLabel": "Short caption for the scene image",
    "imagePrompt": "Detailed cinematic prompt for generating a scene illustration",
    "narrationDuration": "Estimated seconds, e.g., '30s'",
    "narrationLabel": "Short voice direction",
    "playerState": "ready"
  },
  "characterUpdates": [
    {
      "name": "Character Name",
      "affinityChange": 5, // positive/negative integer to alter the affinity score
      "statusUpdate": "Describe any relationship or state shift, e.g., 'Injured' or 'Grateful'"
    }
  ]
}

Important Constraints:
- options MUST be an array of exactly 3 strings representing distinct, actionable choices for the player.
- cast MUST include the characters present in this scene.
- DO NOT use markdown code blocks (like \`\`\`json). Return raw JSON.
`;
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
        generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini error (${response.status}): ${errText.slice(0, 300)}`);
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
    const { setup, choice, memoryTimeline, currentScene, sceneNumber, playerPerformance } = body as {
      setup: StorySetupData;
      choice: string;
      memoryTimeline: MemoryItem[];
      currentScene: any;
      sceneNumber: number;
      playerPerformance?: PlayerPerformance;
    };

    if (!setup || !choice) {
      return NextResponse.json({ error: "Missing required parameters." }, { status: 400 });
    }

    const geminiApiKey = getGeminiKey();
    const groqApiKey = getGroqFallbackKey();

    if (!geminiApiKey && !groqApiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY or GROQ_FALLBACK_API is missing from environment." },
        { status: 500 }
      );
    }

    const difficultyModifier = playerPerformance
      ? getDifficultyModifier(setup.difficulty, playerPerformance.consecutiveSuccesses, playerPerformance.consecutiveFailures)
      : null;

    // Perform RAG retrieval over memoryTimeline based on player choice
    const relevantMemories = await retrieveRelevantMemories(choice, memoryTimeline || [], 3);

    const prompt = buildPrompt({
      setup,
      choice,
      memoryTimeline: memoryTimeline || [],
      currentScene: currentScene || null,
      sceneNumber: sceneNumber || 1,
      difficultyModifier,
      relevantMemories,
    });

    let sceneData;
    let provider = "Unknown";

    if (geminiApiKey) {
      try {
        sceneData = await requestGeminiScene({ apiKey: geminiApiKey, prompt });
        provider = "Gemini";
      } catch (geminiError) {
        if (!groqApiKey) {
          const message = geminiError instanceof Error ? geminiError.message : "Gemini scene generation failed.";
          return NextResponse.json({ error: message }, { status: 500 });
        }
        try {
          sceneData = await requestGroqScene({ apiKey: groqApiKey, prompt });
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
      sceneData = await requestGroqScene({ apiKey: groqApiKey, prompt });
      provider = "Groq fallback";
    }

    // Ensure sceneNumber is injected back
    sceneData.sceneNumber = sceneNumber || 1;

    // Validate coherence, detect emotion, and generate embedding in parallel for speed
    const memoryText = `Choice: ${choice} -> Consequence: ${sceneData.text}`;
    const [validatedScene, emotionDirectives, memoryEmbedding] = await Promise.all([
      validateAndFixSceneCoherence(sceneData, memoryTimeline || []),
      detectSceneEmotion(sceneData.text, choice),
      getEmbedding(memoryText)
    ]);

    sceneData = validatedScene;
    if (emotionDirectives) {
      sceneData.emotionDirectives = emotionDirectives;
    }
    if (memoryEmbedding && memoryEmbedding.length > 0) {
      sceneData.embedding = memoryEmbedding;
    }

    return NextResponse.json({ scene: sceneData, provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scene generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
