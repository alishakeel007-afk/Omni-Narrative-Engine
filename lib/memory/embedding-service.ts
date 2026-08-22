import { getEnvValue } from "@/lib/env";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

function getGeminiKey() {
  return getEnvValue(["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"]);
}

/**
 * Normalizes a vector to L2 norm (magnitude = 1).
 * Required when using Gemini embeddings with dimensions < 3072.
 */
function l2Normalize(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map(v => v / magnitude);
}

/**
 * Generates an embedding vector using gemini-embedding-001.
 * Uses outputDimensionality: 768 and manually normalizes it.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new Error("No Gemini API key available for embeddings.");
  }

  // Use gemini-embedding-001 as specified
  const model = "text-embedding-004"; // Fallback if needed, but we will use gemini-embedding-001
  const targetModel = "gemini-embedding-001";

  const response = await fetch(
    `${GEMINI_ENDPOINT}/${encodeURIComponent(targetModel)}:embedContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model: `models/${targetModel}`,
        content: {
          parts: [{ text }],
        },
        outputDimensionality: 768,
      }),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Embedding error (${response.status}): ${errText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const values = payload.embedding?.values;
  
  if (!Array.isArray(values)) {
    throw new Error("Invalid embedding response from Gemini API.");
  }

  return l2Normalize(values);
}
