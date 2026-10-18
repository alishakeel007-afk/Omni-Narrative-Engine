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
  const memories = await persistSceneMemories(draftId, sceneId, scene, userChoice);
  await indexMemories(draftId, sceneId, userId, scene.sceneNumber, memories);
}

/** Stores draft-scoped facts before optional embedding, so a failed embedding
 * never erases continuity information. */
export async function persistSceneMemories(
  draftId: string,
  sceneId: string,
  scene: StoryScene,
  userChoice: string
): Promise<AtomicMemory[]> {
  return persistAtomicMemories(draftId, sceneId, extractAtomicMemories(scene, userChoice));
}

/**
 * Stores a selected decision against the scene that offered it. The resulting
 * scene supplies the outcome text, but it must not own the decision fact.
 */
export async function persistChoiceMemory(
  draftId: string,
  sourceSceneId: string,
  resultingScene: StoryScene,
  userChoice: string
): Promise<AtomicMemory[]> {
  return persistAtomicMemories(
    draftId,
    sourceSceneId,
    extractAtomicMemories(resultingScene, userChoice).filter((memory) => memory.type === "CHOICE")
  );
}

async function persistAtomicMemories(
  draftId: string,
  sceneId: string,
  rawMemories: AtomicMemory[]
): Promise<AtomicMemory[]> {
  const memories = deduplicateAtomicMemories(rawMemories);
  for (const mem of memories) {
    const existing = await prisma.storyMemory.findFirst({
      where: { draftId, sceneId, memoryType: mem.type, content: mem.content },
      select: { id: true },
    });
    if (!existing) await prisma.storyMemory.create({
      data: { draftId, sceneId, memoryType: mem.type, content: mem.content,
        importanceScore: ["CHOICE", "PLOT", "CHARACTER"].includes(mem.type) ? 3 : 1 },
    });
  }
  return memories;
}

export function deduplicateAtomicMemories(memories: AtomicMemory[]): AtomicMemory[] {
  const seen = new Set<string>();
  return memories.filter((memory) => {
    const key = `${memory.type}\u0000${memory.content.trim()}`;
    if (!memory.content.trim() || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

    // 4. Reuse a previous relational fact when an earlier embedding attempt
    // failed. This makes retries repair incomplete indexing instead of adding
    // duplicate timeline entries.
    const memRecord = await prisma.storyMemory.findFirst({
      where: { draftId, sceneId, memoryType: mem.type, content: mem.content },
      select: { id: true },
    }) ?? await prisma.storyMemory.create({
      data: {
        draftId,
        sceneId,
        memoryType: mem.type,
        content: mem.content,
        importanceScore: ["CHOICE", "PLOT", "CHARACTER"].includes(mem.type) ? 3 : 1,
      },
      select: { id: true },
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

    return mergeMemoryResults(relevantMemories, await retrieveRecentNarrativeFacts(draftId, topK), topK);
  } catch (err) {
    // Graceful fallback — RAG failure must never break story generation
    console.error("[Memory] RAG retrieval failed, continuing without memories:", err);
    return retrieveRecentNarrativeFacts(draftId, topK);
  }
}

/** A draft-scoped, no-AI fallback for facts waiting for an embedding retry. */
export async function retrieveRecentNarrativeFacts(draftId: string, limit = 8): Promise<string[]> {
  const facts = await prisma.storyMemory.findMany({
    where: { draftId },
    orderBy: [{ importanceScore: "desc" }, { createdAt: "desc" }],
    take: Math.max(limit * 3, limit),
    select: { memoryType: true, content: true },
  });
  return mergeMemoryResults([], facts.map((fact) => `[${fact.memoryType}] ${fact.content}`), limit);
}

export function mergeMemoryResults(primary: string[], fallback: string[], limit: number): string[] {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((memory) => {
    const key = memory.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
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

