-- Keep conversational replies responsive while both media slots are rendering.
INSERT INTO "FilmSceneSlot" ("id") VALUES (3) ON CONFLICT ("id") DO NOTHING;
