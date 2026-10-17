-- Preserve the authored image instruction independently from MediaAsset.prompt.
-- Existing generated image prompts remain untouched on their MediaAsset rows.
ALTER TABLE "public"."Scene" ADD COLUMN "imagePrompt" TEXT;
