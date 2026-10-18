# System Architecture

## Frontend

The App Router frontend uses React client screens and shared components. Principal screens are `VideoStudioScreen` (Guided stages 1–8), `StoryBuilderScreen` (manual Custom authoring), `AudioGenerationScreen` (Custom multimedia), `VideoPreviewScreen` (project-aware preview), and `MyProjectsScreen`. `SynchronizedStoryPreview` is shared by Guided and Custom flows.

Browser storage is a working cache. Once an account-backed save is confirmed, authenticated APIs and PostgreSQL are the source of truth.

## API and ownership boundary

Route handlers under `app/api` authenticate through `lib/supabase/server`. Project and media queries constrain the requested object through its owning user. Routes include:

| Route group | Responsibility |
| --- | --- |
| `/api/story/projects`, `/api/story/[projectId]` | Project list, creation, completion and management |
| `/api/story/[projectId]/video/*` | Guided Video Studio save/load |
| `/api/story/custom/*`, `/api/story/[projectId]/custom/load` | Custom save/load and Custom music |
| `/api/video/generate` | Groq/Gemini story generation and validation |
| `/api/video/image`, `/api/video/tts`, `/api/story/narrate` | Owned-target media generation |
| `/api/background-music/sample-based` | Guided score upload/persistence |

## Data and storage

`lib/prisma.ts` creates a TLS-verifying `pg.Pool` from `DATABASE_URL` and supplies it to Prisma through `PrismaPg`. Application table access is server-side Prisma. Storage uploads use server-only configuration in `lib/supabase-storage.ts`; current server-generated formats include `images/<projectId>/...`, `audio/tts/<projectId>/...`, and `audio/music/<projectId>/...`.

## Provider architecture

`/api/video/generate` calls `generateWithGroqPrimary`: Groq is first and Gemini is attempted once only after a failed/unusable Groq attempt. Gemini timeout/retry behaviour is implemented in `lib/gemini-retry.ts`. Both results are schema-validated.

`/api/video/tts` validates language, script bounds, and owned persistent targets. English routes to Deepgram and Urdu to ElevenLabs. Emotion metadata is per line, but Deepgram uses supported speed/pacing controls only and does not guarantee acted emotion.

Image requests are bounded, prompt-built, and persisted only after ownership validation. Music policy selects `ambient`, `suspense`, `emotional`, `action`, `hopeful`, or intentional silence. The score engine uses local CC0 samples from `lib/audio/sample-catalog.ts`, validates WAV output, and uploads through authenticated routes.

## Preview architecture

`lib/story-preview-timeline.ts` creates scene timing. `SynchronizedStoryPreview` sequences narration/dialogue, image changes, scene music and speech ducking; supports visual-only/silent scenes; and invalidates callbacks on restart, navigation, unmount, or project switch. It is not a video renderer.
