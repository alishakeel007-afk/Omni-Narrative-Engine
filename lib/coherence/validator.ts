import { getEnvValue } from "@/lib/env";
import type { StoryScene, MemoryItem } from "@/types/story";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

/**
 * Validates a generated scene against the provided memory constraints.
 * If a contradiction is detected, it attempts a best-effort fix via a fast LLM.
 */
export async function validateAndFixSceneCoherence(
  sceneData: StoryScene,
  memoryContext: MemoryItem[]
): Promise<StoryScene> {
  const groqApiKey = getEnvValue(["GROQ_FALLBACK_API", "GROQ_API_KEY"]);
  
  if (!groqApiKey || memoryContext.length === 0) {
    // If we have no fast LLM key or no memory to validate against, return as-is
    return sceneData;
  }

  const memoryList = memoryContext.map(m => `- Scene ${m.sceneNumber}: ${m.result}`).join("\n");
  
  const validationPrompt = `
You are the Narrative Coherence Engine.
Your job is to check if the generated scene breaks any facts from the story memory.

STORY MEMORY:
${memoryList}

GENERATED SCENE:
${JSON.stringify(sceneData, null, 2)}

TASK:
1. Check for contradictions (e.g., dead characters appearing, using items not possessed, ignoring recent major events).
2. If the scene is fully coherent, return the exact same JSON.
3. If there is a contradiction, perform a best-effort fix on the JSON to correct the logic while keeping the narrative style intact.
4. Return ONLY valid JSON, no markdown. Must perfectly match the original schema.
`;

  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "You are the Coherence Validator. Return valid JSON only, with no markdown.",
          },
          {
            role: "user",
            content: validationPrompt,
          },
        ],
        model: getEnvValue(["GROQ_FALLBACK_MODEL", "GROQ_MODEL"]) || DEFAULT_GROQ_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.1, // Low temp for strict validation
      }),
    });

    if (!response.ok) {
      // Best-effort: if validation fails, just return the original scene
      console.warn("Coherence validation request failed", response.status);
      return sceneData;
    }

    const payload = await response.json();
    const text = (payload as any).choices?.[0]?.message?.content ?? "";
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    
    const validatedScene = JSON.parse(cleaned);
    return validatedScene as StoryScene;
  } catch (error) {
    console.error("Coherence validation error:", error);
    // Best-effort fix failed, return original
    return sceneData;
  }
}
