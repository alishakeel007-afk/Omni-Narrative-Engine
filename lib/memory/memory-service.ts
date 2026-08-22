import { prisma } from "@/lib/prisma";
import { generateEmbedding } from "./embedding-service";
import { extractAtomicMemories, type AtomicMemory } from "./memory-extractor";
import { computeMemoryHash } from "./memory-hasher";
import type { StoryScene } from "@/types/story";

/**
 * Core service for extracting, hashing, and storing semantic memories.
 * Used during Phase 2 of the Long Term Memory implementation.
 */

export async function processAndIndexSceneMemories(
  draftId: string,
  sceneId: string,
  userId: string,
  scene: StoryScene,
  userChoice: string
): Promise<void> {
  // 1. Extract atomic facts from the structured scene
  const memories = extractAtomicMemories(scene, userChoice);

  if (memories.length === 0) return;

  await indexMemories(draftId, sceneId, userId, scene.sceneNumber, memories);
}

export async function indexMemories(
  draftId: string,
  sceneId: string,
  userId: string,
  sceneNumber: number,
  memories: AtomicMemory[]
): Promise<void> {
  for (const mem of memories) {
    // 2. Compute a stable hash to prevent duplicate memories
    const hash = computeMemoryHash(draftId, sceneNumber, mem.type, mem.content);

    // 3. Check for existing hash (Idempotency)
    const existing = await prisma.storyMemoryEmbedding.findUnique({
      where: {
        draftId_memoryHash: {
          draftId,
          memoryHash: hash,
        },
      },
    });

    if (existing) {
      console.log(`[Memory] Skipping duplicate memory (Hash: ${hash.substring(0, 8)}...)`);
      continue;
    }

    // 4. Save to StoryMemory (Relational table)
    const memRecord = await prisma.storyMemory.create({
      data: {
        draftId,
        sceneId,
        memoryType: mem.type,
        content: mem.content,
        // Plot and Choice are typically more important for recall
        importanceScore: ["CHOICE", "PLOT"].includes(mem.type) ? 3 : 1,
      },
    });

    // 5. Generate embedding via Gemini
    let embedding: number[];
    try {
      embedding = await generateEmbedding(mem.content);
    } catch (err) {
      console.error(`[Memory] Failed to generate embedding for memory: ${memRecord.id}`, err);
      // We stored the text memory, but failed to embed. Skip vector insert.
      continue;
    }

    // 6. Save vector in StoryMemoryEmbedding via raw SQL
    try {
      await prisma.$executeRaw`
        INSERT INTO "StoryMemoryEmbedding" (
          id,
          "draftId",
          "sceneId",
          "memoryId",
          "userId",
          content,
          "memoryType",
          "memoryHash",
          embedding
        ) VALUES (
          gen_random_uuid(),
          ${draftId},
          ${sceneId},
          ${memRecord.id},
          ${userId},
          ${mem.content},
          ${mem.type},
          ${hash},
          ${JSON.stringify(embedding)}::vector
        )
        ON CONFLICT ("draftId", "memoryHash") DO NOTHING;
      `;
      console.log(`[Memory] Indexed new ${mem.type} memory.`);
    } catch (err) {
      console.error(`[Memory] Failed to insert vector for memory: ${memRecord.id}`, err);
    }
  }
}

/**
 * Retrieves the Top-K most relevant past memories based on the current context/choice.
 * Filters strictly by draftId for story isolation.
 * Uses a similarity threshold to exclude technically-closest-but-irrelevant memories.
 */
export async function retrieveRelevantMemories(
  draftId: string,
  queryText: string,
  topK: number = 8,
  minSimilarity: number = 0.6 // Configurable threshold
): Promise<string[]> {
  if (!queryText || queryText.trim() === "") return [];

  try {
    // 1. Generate embedding for the query
    const queryEmbedding = await generateEmbedding(queryText);

    // 2. Perform vector cosine similarity search in Supabase
    // pgvector operator <=> computes cosine distance. Similarity = 1 - distance.
    const results: { content: string; memoryType: string; similarity: number }[] = await prisma.$queryRaw`
      SELECT 
        content, 
        "memoryType",
        1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
      FROM "StoryMemoryEmbedding"
      WHERE "draftId" = ${draftId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
      LIMIT ${topK}
    `;

    // 3. Filter by threshold and format results
    const relevantMemories = results
      .filter((r) => r.similarity >= minSimilarity)
      .map((r) => `[${r.memoryType}] ${r.content}`);

    return relevantMemories;
  } catch (err) {
    // Graceful fallback — RAG failure must never break story generation
    console.error("[Memory] RAG retrieval failed, continuing without memories:", err);
    return [];
  }
}

/**
 * Formats memories into a structured string block for Gemini prompt injection.
 */
export function buildMemoryContextBlock(memories: string[]): string {
  if (memories.length === 0) return "";
  return [
    "[LONG-TERM MEMORY CONTEXT]",
    "The following events, characters, and decisions from earlier in the story are relevant:",
    ...memories.map((m, i) => `${i + 1}. ${m}`),
    "[END MEMORY CONTEXT]"
  ].join("\n");
}

