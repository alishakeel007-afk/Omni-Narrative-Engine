/**
 * Phase 1 — pgvector setup script
 * Run with: node scripts/phase1-pgvector-setup.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DIRECT_URL // Use direct connection for DDL statements
    }
  }
});

async function main() {
  console.log("Phase 1: Setting up pgvector and StoryMemoryEmbedding table...\n");

  // Step 1 — Enable pgvector extension
  console.log("Step 1: Enabling pgvector extension...");
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector;`);
  console.log("  ✅ pgvector extension enabled.\n");

  // Step 2 — Create StoryMemoryEmbedding table
  console.log("Step 2: Creating StoryMemoryEmbedding table...");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "StoryMemoryEmbedding" (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      "draftId"    TEXT NOT NULL REFERENCES "StoryDraft"(id) ON DELETE CASCADE,
      "sceneId"    TEXT,
      "memoryId"   TEXT NOT NULL REFERENCES "StoryMemory"(id) ON DELETE CASCADE,
      "userId"     TEXT NOT NULL,
      content      TEXT NOT NULL,
      "memoryType" TEXT NOT NULL,
      "memoryHash" TEXT NOT NULL,
      embedding    VECTOR(768),
      metadata     JSONB,
      "createdAt"  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE ("draftId", "memoryHash")
    );
  `);
  console.log("  ✅ StoryMemoryEmbedding table created.\n");

  // Step 3 — HNSW index
  console.log("Step 3: Creating HNSW vector index...");
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS story_memory_embedding_hnsw_idx
    ON "StoryMemoryEmbedding"
    USING hnsw (embedding vector_cosine_ops);
  `);
  console.log("  ✅ HNSW index created.\n");

  // Step 4 — Verify table exists with a quick column check
  console.log("Step 4: Verifying table structure...");
  const columns = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'StoryMemoryEmbedding'
    ORDER BY ordinal_position;
  `);

  if (columns.length === 0) {
    throw new Error("Table was not created successfully.");
  }

  console.log("  Table columns confirmed:");
  columns.forEach(col => {
    console.log(`    - ${col.column_name}: ${col.data_type}`);
  });

  // Step 5 — Verify HNSW index
  console.log("\nStep 5: Verifying HNSW index...");
  const indexes = await prisma.$queryRawUnsafe(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'StoryMemoryEmbedding';
  `);
  indexes.forEach(idx => {
    console.log(`  ✅ Index found: ${idx.indexname}`);
  });

  console.log("\n🎉 Phase 1 complete! pgvector foundation is ready.");
  console.log("   StoryMemoryEmbedding table is live in Supabase.");
  console.log("   The table is empty — real memories will be added during gameplay.\n");
}

main()
  .catch(err => {
    console.error("\n❌ Phase 1 failed:", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
