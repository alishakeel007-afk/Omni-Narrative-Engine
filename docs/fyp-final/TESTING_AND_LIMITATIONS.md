# Testing and Limitations

## Evidence boundary

The repository includes deterministic TypeScript/Node regression scripts. They verify source-level contracts and pure/helper behaviour; they do not certify live providers, production data, browser media playback, Storage policies, or deployed security.

No provider call, database write, browser test, or deployment test was performed while creating this documentation.

## Latest local verification evidence

The following commands passed in the latest focused verification:

```powershell
node scripts/test-step128-security-reliability.ts
node scripts/test-step37-media-api-security.ts
node scripts/test-step38-storage-cleanup.ts
node scripts/test-step113-scene-persistence.mjs
node scripts/test-step114-media-freshness.ts
node scripts/test-step115-preview-restoration.ts
node scripts/test-step116-synchronized-preview.ts
node scripts/test-step121b-mode-selection.ts
node scripts/test-step122-my-projects.ts
node scripts/test-step123-custom-story-builder.ts
node scripts/test-step124-custom-project-persistence.ts
node scripts/test-step125-custom-multimedia.ts
node scripts/test-step127-ui-polish.ts
npx.cmd tsc --noEmit
git diff --check
```

Other scripts under `scripts/` cover narrative consistency, media readiness, Urdu routing, image prompts, provider fallback, and audio/music status.

## Confirmed implementation checks

- Stable Guided scene identity, delete/reorder reconciliation, media freshness, preview restoration, and timeline construction.
- Owner-scoped project/media routing and Storage cleanup planning.
- Custom project persistence, local import idempotence, mode-aware resume, optional multimedia paths, and browser preview contracts.
- Groq-primary/Gemini-fallback control flow without a live provider request.
- TypeScript compilation and whitespace validation.

## Manual tests still required

- Login/logout, expired-session recovery, and cross-account denial in the target environment.
- Guided creation, scene delete/reorder, refresh/reopen, and saved-stage restoration.
- Custom save/resume in another browser, local-draft import retry, and manual editing after AI suggestions.
- English/Urdu TTS listening, image generation/display, music listening, ducking, silence, and Stage 8 playback.
- Browser autoplay restriction behaviour, mobile layout, keyboard focus, and real media decoding.

## Security and reliability notes

Step 128 added server-side Custom image/music association with narrow cleanup of only a just-created object, stale-save media preservation, and sanitized media-provider errors. Reviewed routes use authenticated ownership checks before provider/Storage work.

## Remaining limitations

- **MP4 export is not implemented.**
- Provider credentials, quotas, availability, and output quality are external dependencies.
- Durable per-user provider rate limiting is not implemented.
- A Custom TTS object may be unreferenced if the later full-draft save fails.
- Supabase bucket policy/privacy and deployed configuration need live verification.
- Automated checks are not a substitute for a complete browser rehearsal.
