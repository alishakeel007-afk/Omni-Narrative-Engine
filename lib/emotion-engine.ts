import { getEnvValue } from "@/lib/env";
import type { EmotionDirectives } from "@/types/story";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

/**
 * Dynamically analyzes the narrative to extract precise emotion directives
 * used to synchronize the video, music, and voice generation modules.
 */
export async function detectSceneEmotion(
  sceneText: string,
  userChoice?: string
): Promise<EmotionDirectives | null> {
  const groqApiKey = getEnvValue(["GROQ_FALLBACK_API", "GROQ_API_KEY"]);
  
  if (!groqApiKey) {
    return null;
  }

  const prompt = `
You are the Emotion Detection Engine for a multimodal interactive story.
Analyze the following narrative and user choice to determine the core emotional subtext.

SCENE TEXT:
"${sceneText}"

USER CHOICE THAT LED HERE:
"${userChoice || 'N/A'}"

TASK:
Return a JSON object containing specific directives to synchronize video, music, and voice generation.
Output MUST strictly follow this schema:
{
  "primaryEmotion": "A single word (e.g., Fear, Joy, Tension, Sorrow, Wonder)",
  "intensity": 0.8, // Float between 0.0 (very subtle) and 1.0 (extreme)
  "videoAtmosphere": "Visual description of lighting, color grading, and camera motion (e.g., 'Harsh shadows, cold blue tint, slow creeping camera')",
  "musicStyle": "Audio description for background music (e.g., 'Low tension, eerie synths, slow heartbeat tempo')",
  "voiceStyle": "Instructions for the TTS narrator (e.g., 'Serious, slower pacing, hushed and breathy tone')"
}

Return ONLY valid JSON. No markdown.
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
            content: "You are the Emotion Detection Engine. Return valid JSON only, with no markdown.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        model: getEnvValue(["GROQ_FALLBACK_MODEL", "GROQ_MODEL"]) || DEFAULT_GROQ_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.3, // Low temp for consistent formatting
      }),
    });

    if (!response.ok) {
      console.warn("Emotion detection request failed", response.status);
      return null;
    }

    const payload = await response.json();
    const text = (payload as any).choices?.[0]?.message?.content ?? "";
    const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    
    return JSON.parse(cleaned) as EmotionDirectives;
  } catch (error) {
    console.error("Emotion detection error:", error);
    return null;
  }
}
