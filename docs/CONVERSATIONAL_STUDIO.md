# Conversational Film Studio

Branch: `new-ui`. Entry point: `/studio`. Login and signup default to this workspace; existing legacy story routes remain accessible.

## Product decisions

- New projects offer **Help me find an idea** (discover) and **Develop my idea** (develop), while allowing a direct message or pasted script.
- Plan, Scenes, and Assemble are the only main navigation. Both sidebars collapse, remember preferences per user, and become drawers on small screens.
- Plan is an interactive conversation with clickable story pitches and concrete character/appearance choices. Discover offers actual ideas immediately; Develop follows the supplied idea. Selecting a card sends its full creative direction as a normal user message. Users can always type their own answer. Proposed story cards require approval before saving the title, world, characters, scene descriptions, and dialogue.
- Explicit image requests work from chat in Plan, Scenes, and Assemble, without requiring an approved plan. The assistant message persists its prompt, reference IDs, provider job, generation status, and optional recoverable error. Images have preview, download, status refresh and explicit retry controls. Planning choices alone do not submit media jobs unless the chosen text explicitly requests an image. An ambiguous character request offers named character choices instead of guessing. Generated portraits can be saved as named references directly from the image card; this analyses the actual pixels and opens the profile for review and locking.
- Scenes keeps takes per scene. Character scenes require locked reference views, an appearance-checked scene image, then image-to-video and a second appearance check. Text-only video is available for scenes without a character cast. Adjust also exposes images, dialogue, music, and manual scene editing.
- Assemble chat can propose per-scene timing and audio edits. Apply edits commits a validated proposal; Undo last edit restores prior clip settings or timeline order. Unsupported edits stay conversational instead of claiming to execute.
- Assemble supports selecting takes, ordering/removing scenes, trims, audio fades and timed text overlays. With the Modal video service configured, final export uses CPU FFmpeg H.264/AAC MP4 and saves to the project; refresh resumes the same job. Native LTX clips play their generated soundtrack by default. Legacy clips retain dialogue delay and separate voice/music mixing. The browser WebM fallback remains available when no Modal endpoint is configured. See [native video deployment](../workers/video/README.md).

## Backend and setup

Run `npm install`, `npm run prisma:generate`, and `node scripts/setup-film-studio.cjs` with `.env.local` configured. The setup command uses Prisma's tracked migrations; when DIRECT_URL is absent on Supabase it uses the same credentials on the session-pooler port for migrations only.

Required: Supabase URL/anon key and DATABASE_URL; GEMINI_API_KEY for conversation and vision (Groq is a text-only fallback); MAGIC_HOUR_API_KEY for images. Set STUDIO_VIDEO_BACKEND=modal-ltx with STUDIO_LTX_URL/TOKEN for native audiovisual video. Legacy video can still use Magic Hour. Separate legacy dialogue uses DEEPGRAM_TTS_API_KEY; native LTX generates its soundtrack from the video prompt. No keys belong in browser bundles.

FilmWorkspace stores server-owned project JSON with an optimistic revision number. FilmReference stores original image bytes separately. The additive migration enables RLS on both tables and scopes policies by Supabase auth UID. The existing legacy StoryProject foreign key still points at the old User table, so the new workspace deliberately uses dedicated tables. API endpoints authenticate users and scope every lookup by owner. Generation submissions reserve a project revision before provider calls, preventing concurrent submissions. Reservations expire after four minutes if the process dies.

Completed scene takes are copied to the existing generated-images/generated-videos storage buckets so projects do not depend on temporary provider URLs. Those existing generated-media buckets use public playback URLs, consistent with the application's audio storage. Original uploaded character images stay in the authenticated FilmReference table. Manual Refresh media status retries failed archival copies; do not regenerate a completed take just to retry storage.

## Character continuity

Uploads accept JPG/PNG/WebP up to 4 MB with signature validation. Each character supports six named reference views and a primary image. Adding another image under the same character name appends a view, retains the primary image, and rebuilds one canonical appearance description from all views. Gemini describes visible face shape, hair, clothing, accessories and distinctive details, marking uncertain, hidden or contradictory features for review. Adding/removing views or changing the primary view unlocks the profile. The user reviews, edits, and locks it again. References remain authenticated project data. Providers receive them during analysis, explicit generation, and appearance checking.

Every scene retrieves its cast by character ID. Locked profiles survive AI plan revisions. Actual reference pixels condition Flux 2 Klein image editing, or the optional self-hosted Qwen worker. Up to six total image-input slots are shared round-robin across the cast, with explicit input-to-character labels in the prompt. Large casts require smaller groups. Unreferenced concept portraits use Z-Image Turbo and can be saved as reviewed references. A checked scene image conditions LTX 2.5 video. Character scenes cannot bypass references using text-only video. Existing takes remain available for inspection when a plan/profile changes; changed dialogue invalidates old audio.

Chat uses approved profiles, the latest proposed plan and recent conversation. Reference-based takes snapshot the character description and reference versions. A scene continuity hash also covers scene description and world style. Completed takes receive one reserved Gemini visual check; videos are sampled at 24 fps. Every character must receive a match verdict. Uncertain, mismatched, malformed, failed, pending or stale results block take selection, timeline insertion and film export. A failed check requires an explicit retry; rejected takes are never regenerated automatically. Revised scene takes include the last rejected take's observed defects. Legacy takes without profile snapshots need regeneration. Inline review inputs have an 18 MB combined cap.

These checks compare observable appearance, not biometric identity. They can miss subtle or transient drift and cannot guarantee exact likeness in every frame. No character-specific LoRA has been trained here. The optional Qwen worker supports an operator-supplied deployment-wide LoRA; InstantID remains an uninstalled research alternative with checkpoint/InsightFace licensing restrictions. See [the worker deployment and cost guide](../workers/character/README.md) for the local/Modal setup, model limitations, cost examples and current validation scope. The GPU worker is prepared but has not been deployed in this workspace; default generation still uses Magic Hour.

## Deferred voice cloning

Voice cloning is explicitly deferred. Future character voice profiles should support consented sample uploads, provider voice IDs, and per-character selection reused by dialogue generation. The current implementation uses configured Deepgram synthetic TTS. It does not clone uploaded voices or claim to do so.

## Checks

- `node scripts/test-studio.cjs`: mocked backend checks, including interactive planning contracts, model-output recovery, image intent, proposed-plan memory, chat images across all tabs, retries, ownership and reference freshness. No billable requests.
- `node scripts/check-studio-director.cjs`: opt-in live LLM smoke check; `--render` additionally submits one billable low-resolution Magic Hour image job. Never included in automated tests.
- `node scripts/check-studio-consistency.cjs`: opt-in live Gemini check using the generated fictional portrait and synthetic clip in .run-screenshots. Sends those artifacts to Google and consumes vision tokens; requires approval for that live upload. No GPU jobs or media renders are submitted.
- `node tests/studio-browser.cjs`: isolated Chrome UI harness with mocked identity/API, covering sidebars, modes, approvals, locking, tabs, and responsive layout. It never changes runtime authentication. Screenshots are under ignored `.run-screenshots/`.
- Full repository type checking can also expose pre-existing errors in legacy story/database scripts. Do not suppress them to hide failures.
