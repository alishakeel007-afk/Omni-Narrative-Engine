-- Preserve the authored order of dialogue lines within a scene.  Existing
-- rows receive a deterministic order without altering their text or audio.
ALTER TABLE "public"."Dialogue"
ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

WITH ranked_dialogues AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "sceneId"
    ORDER BY "createdAt" ASC, "id" ASC
  ) - 1 AS position
  FROM "public"."Dialogue"
)
UPDATE "public"."Dialogue" AS dialogue
SET "position" = ranked_dialogues.position
FROM ranked_dialogues
WHERE dialogue."id" = ranked_dialogues."id";

CREATE INDEX "Dialogue_sceneId_position_idx"
ON "public"."Dialogue"("sceneId", "position");
