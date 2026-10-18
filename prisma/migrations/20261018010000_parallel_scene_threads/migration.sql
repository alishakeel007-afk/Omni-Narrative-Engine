CREATE TABLE "FilmSceneRevision" (
  "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "sceneId" TEXT NOT NULL,
  "key" TEXT NOT NULL, "snapshot" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("workspaceId") REFERENCES "FilmWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FilmSceneRevision_workspaceId_sceneId_key_key" ON "FilmSceneRevision"("workspaceId", "sceneId", "key");
CREATE TABLE "FilmSceneThread" (
  "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "sceneId" TEXT NOT NULL, "title" TEXT NOT NULL,
  "parentTakeId" TEXT, "parentJobId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("workspaceId") REFERENCES "FilmWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "FilmSceneThread_workspaceId_sceneId_idx" ON "FilmSceneThread"("workspaceId", "sceneId");
CREATE TABLE "FilmSceneJob" (
  "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "userId" TEXT NOT NULL, "sceneId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL, "sceneRevisionId" TEXT NOT NULL, "requestId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued', "phase" TEXT NOT NULL DEFAULT 'prepare',
  "text" TEXT NOT NULL, "sequence" INTEGER NOT NULL DEFAULT 0, "snapshot" JSONB NOT NULL, "result" JSONB, "providerTake" JSONB,
  "dependsOnId" TEXT, "error" TEXT, "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
  "attempts" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("workspaceId") REFERENCES "FilmWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("threadId") REFERENCES "FilmSceneThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("sceneRevisionId") REFERENCES "FilmSceneRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "FilmSceneJob_workspaceId_requestId_key" ON "FilmSceneJob"("workspaceId", "requestId");
CREATE UNIQUE INDEX "FilmSceneJob_threadId_sequence_key" ON "FilmSceneJob"("threadId", "sequence");
CREATE INDEX "FilmSceneJob_status_createdAt_idx" ON "FilmSceneJob"("status", "createdAt");
CREATE INDEX "FilmSceneJob_workspaceId_createdAt_idx" ON "FilmSceneJob"("workspaceId", "createdAt");
CREATE TABLE "FilmSceneSlot" ("id" INTEGER PRIMARY KEY, "jobId" TEXT UNIQUE, "token" TEXT, "leaseUntil" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01');
INSERT INTO "FilmSceneSlot" ("id") VALUES (1), (2);
ALTER TABLE "FilmSceneRevision" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FilmSceneThread" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FilmSceneJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FilmSceneSlot" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scene_revision_owner" ON "FilmSceneRevision" FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM "FilmWorkspace" WHERE "FilmWorkspace"."id" = "FilmSceneRevision"."workspaceId" AND "userId" = (SELECT auth.uid())::text)) WITH CHECK (EXISTS (SELECT 1 FROM "FilmWorkspace" WHERE "FilmWorkspace"."id" = "FilmSceneRevision"."workspaceId" AND "userId" = (SELECT auth.uid())::text));
CREATE POLICY "scene_thread_owner" ON "FilmSceneThread" FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM "FilmWorkspace" WHERE "FilmWorkspace"."id" = "FilmSceneThread"."workspaceId" AND "userId" = (SELECT auth.uid())::text)) WITH CHECK (EXISTS (SELECT 1 FROM "FilmWorkspace" WHERE "FilmWorkspace"."id" = "FilmSceneThread"."workspaceId" AND "userId" = (SELECT auth.uid())::text));
CREATE POLICY "scene_job_owner" ON "FilmSceneJob" FOR ALL TO authenticated USING ("userId" = (SELECT auth.uid())::text AND EXISTS (SELECT 1 FROM "FilmWorkspace" WHERE "FilmWorkspace"."id" = "workspaceId" AND "FilmWorkspace"."userId" = (SELECT auth.uid())::text)) WITH CHECK ("userId" = (SELECT auth.uid())::text AND EXISTS (SELECT 1 FROM "FilmWorkspace" WHERE "FilmWorkspace"."id" = "workspaceId" AND "FilmWorkspace"."userId" = (SELECT auth.uid())::text));
