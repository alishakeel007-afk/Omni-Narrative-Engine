# Module Implementation

## Authentication and navigation

Primary navigation is Home, Video Studio mode selection, Dashboard, and Profile. `ProtectedRoute` guards authenticated screens. Resume links open the saved workflow directly; mode selection remains for new work.

## Guided Video Studio

`VideoStudioScreen.tsx` implements setup, idea, review, scenes/dialogue, voice, visuals, music, and preview. It uses local cache plus a revision-aware serialized account-save queue. Scene edits produce freshness metadata, so stale audio/image/music is not counted as ready.

## Custom Story Builder

`StoryBuilderScreen.tsx` supports manual title/character/scene/dialogue authoring and optional three-way AI suggestions. Suggestions are editable and never auto-applied. Save states distinguish browser-local, saving, confirmed saved, and failed states. `AudioGenerationScreen.tsx` connects compatible Custom scenes to existing voice, image, music, and preview infrastructure.

## Continuity and media

Characters and scene context are used by generation helpers. Interactive Story persists `StoryMemory` facts. Voice routes enforce language/target checks; image routes validate bounded prompts and media targets; the sample score system uses an optional policy that can choose silence. Existing valid media is retained when regeneration fails.

## Projects and preview

My Projects presents account-owned Guided and Custom projects as In Progress or Completed according to readiness eligibility. `SynchronizedStoryPreview` gives a browser-only ordered playback with narration/dialogue sequencing, per-scene music, ducking, warnings, and lifecycle cleanup. It does not provide video download/export.
