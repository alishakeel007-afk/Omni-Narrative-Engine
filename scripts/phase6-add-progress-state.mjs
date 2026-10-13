/**
 * Phase 6 migration: adds progressState JSON column to StoryDraft.
 * This stores health, inventory, and currentSceneIndex between sessions
 * without adding separate columns or tables for a small piece of state.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  console.log("Phase 6: Adding progressState column to StoryDraft...\n");

  await prisma.$executeRaw`
    ALTER TABLE "StoryDraft"
    ADD COLUMN IF NOT EXISTS "progressState" JSONB DEFAULT NULL;
  `;

  console.log("✅ progressState column added (or already existed).");

  // Verify
  const cols = await prisma.$queryRaw`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'StoryDraft'
      AND column_name = 'progressState';
  `;

  if (!Array.isArray(cols) || cols.length === 0) throw new Error("Column not found after migration!");
  console.log("✅ Verified: progressState column is present in StoryDraft.");
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
