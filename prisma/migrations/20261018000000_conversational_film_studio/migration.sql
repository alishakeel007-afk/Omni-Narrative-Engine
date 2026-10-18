CREATE TABLE IF NOT EXISTS "FilmWorkspace" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "state" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FilmWorkspace_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "FilmReference" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FilmReference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FilmReference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "FilmWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "FilmWorkspace_userId_updatedAt_idx" ON "FilmWorkspace"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "FilmReference_workspaceId_idx" ON "FilmReference"("workspaceId");
ALTER TABLE "FilmWorkspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FilmReference" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "film_workspace_owner" ON "FilmWorkspace" FOR ALL TO authenticated USING ("userId" = (SELECT auth.uid())::text) WITH CHECK ("userId" = (SELECT auth.uid())::text);
CREATE POLICY "film_reference_owner" ON "FilmReference" FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM "FilmWorkspace" WHERE "FilmWorkspace"."id" = "FilmReference"."workspaceId" AND "FilmWorkspace"."userId" = (SELECT auth.uid())::text)) WITH CHECK (EXISTS (SELECT 1 FROM "FilmWorkspace" WHERE "FilmWorkspace"."id" = "FilmReference"."workspaceId" AND "FilmWorkspace"."userId" = (SELECT auth.uid())::text));
