import { getEnvValue } from "@/lib/env";

export async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = getEnvValue([
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY"
  ]);

  if (!apiKey) {
    console.warn("Gemini API key is missing. Skipping embedding generation.");
    return [];
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: {
            parts: [{ text }]
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Embedding request failed (${response.status}): ${errText}`);
    }

    const data = await response.json() as any;
    return data.embedding?.values || [];
  } catch (error) {
    console.error("Error generating embedding:", error);
    return [];
  }
}
