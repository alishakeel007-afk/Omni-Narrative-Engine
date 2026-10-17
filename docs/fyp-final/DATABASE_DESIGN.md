# Database Design

## Prisma models

| Model | Role |
| --- | --- |
| `StoryProject` | User-owned project with mode, status, timestamps, and drafts. |
| `StoryDraft` | Versioned active content with `progressState` and `videoStudioState`; owns scenes, characters, media, memories, and jobs. |
| `Scene` | Ordered relational Guided/Interactive scene; unique on `(draftId, sceneNumber)` with durable UUID identity. |
| `Character` | Character/continuity/voice profile data for a draft. |
| `Dialogue` | Scene line with optional character and audio URL. |
| `Choice` | AI-suggested or custom interactive choice. |
| `StoryMemory`, `StoryMemoryEmbedding` | Persisted narrative facts and vector-backed retrieval metadata. |
| `MediaAsset` | URL, Storage path, type, provider, prompt, and status for draft/scene/character media. |
| `VideoGenerationJob` | Reserved output-job metadata; no final renderer currently writes an MP4. |

## Persistence design

`StoryProject.userId` is the ownership root. Protected handlers obtain the Supabase-authenticated user and scope Prisma queries through that relation.

Guided state is stored in relational scene/character/dialogue/media records plus `StoryDraft.videoStudioState`. Scene UUIDs are independent of display order, allowing delete/reorder reconciliation without reassociating remaining media by scene number.

Custom Mode retains the authored snapshot in `StoryDraft.progressState.customBuilder.state`: title, language, characters, stable Custom scene IDs, order, narration, dialogue, media state, and progress. `clientImportId` supports idempotent local-draft imports. The Custom save route uses a serializable transaction.

## Media and security boundaries

Guided media is represented by `MediaAsset`; Custom media is retained in the validated Custom JSON snapshot. Current Custom image/music uploads attach to the owned Custom scene on the server. If association fails, only the newly created server-generated object is deleted. Stale Custom saves merge already-associated media; intentional silence is not overwritten.

Storage deletion accepts only allowlisted project-scoped paths and never derives an object path from a client public URL. Supabase RLS and bucket policy are deployment configuration and must be verified outside this schema.
