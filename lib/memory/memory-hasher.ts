import crypto from "crypto";

/**
 * Computes a deterministic SHA-256 hash for an atomic memory.
 * This guarantees idempotency: if the exact same memory is submitted twice
 * (e.g. by a retry queue), it will generate the same hash, and the DB
 * unique constraint will prevent duplicate storage.
 */
export function computeMemoryHash(
  draftId: string,
  sceneNumber: number,
  memoryType: string,
  content: string
): string {
  // Normalize content to prevent minor whitespace differences from changing the hash
  const normalizedContent = content.trim().replace(/\s+/g, " ");
  
  return crypto
    .createHash("sha256")
    .update(`${draftId}:${sceneNumber}:${memoryType}:${normalizedContent}`)
    .digest("hex");
}
