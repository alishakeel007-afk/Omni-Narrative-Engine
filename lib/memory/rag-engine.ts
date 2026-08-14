import type { MemoryItem } from "@/types/story";
import { getEmbedding } from "./embeddings";

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function retrieveRelevantMemories(
  queryText: string,
  memories: MemoryItem[],
  topK: number = 3
): Promise<MemoryItem[]> {
  if (!memories || memories.length === 0) return [];

  // Generate embedding for current choice query
  const queryEmbedding = await getEmbedding(queryText);
  if (queryEmbedding.length === 0) {
    // If embedding generation failed, fall back to recent memories
    return memories.slice(-topK);
  }

  // Score each memory based on cosine similarity
  const scoredMemories = memories
    .filter((m) => m.embedding && m.embedding.length === queryEmbedding.length)
    .map((m) => ({
      memory: m,
      similarity: cosineSimilarity(queryEmbedding, m.embedding!)
    }));

  // Sort by highest similarity
  scoredMemories.sort((a, b) => b.similarity - a.similarity);

  // Return the topK memories
  return scoredMemories.slice(0, topK).map((sm) => sm.memory);
}
