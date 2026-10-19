# Implementation and verification record

Client review date: 19 October 2026 (Asia/Karachi). Work continues on the existing branch; inherited changes and database tables are preserved.

The subsequent guided-page redesign, repaired contextual assistance, Cloudflare image integration, connected progress and story terminology are recorded in [STORY_WORKFLOW_REVIEW.md](STORY_WORKFLOW_REVIEW.md). That record supersedes interface/provider details below and includes the latest 15-suite/browser verification and live-provider testing limits.

## Implemented

- Fixed the database connection by including Supabase's public production CA and retaining hostname/certificate verification. Both a raw PostgreSQL read and a Prisma FilmWorkspace read succeeded. Added connection/query deadlines and a bounded pool.
- Added functioning Profile, Change password and Settings destinations under `/account`. Signed-in password recovery is no longer redirected away. Added confirmation-code exchange and expired-link recovery while preserving the film continuation path.
- Completed the styled four-step guest form, existing-script input, local draft persistence and authentication handoff. Header sign-in/sign-up also preserve an entered draft. A changed idea cannot silently claim an obsolete preview.
- Reused the two existing public generated clips, extracted real local JPEG posters, and retained muted/inline/looping playback with reduced-motion and data-saving handling. No missing `/films/*` assets are referenced by the current landing page.
- Compacted navigation and project spacing, removed sparkle icons from the four current film components, and kept the white/black/green interface. Removed the misleading empty-project state when loading fails.
- Added the persistent compact numbered step indicator. Completion is derived from saved work; tab navigation contributes nothing. Old exports cannot complete a changed timeline.
- Added optional audience/purpose/tone/genre/ending choices and scoped AI help. Added scene setting, time, lighting, props, camera, delivery, music, ambience and effects controls. Character motivation/relationships are separate optional decisions.
- Initial Guided suggestions are concrete built-in choices. Opening Setup no longer automatically submits a model call; generating or requesting fresh AI help remains an explicit action.
- Kept locked identity separate from scene wardrobe. Both intermediate-image and video prompts receive scene wardrobe and preceding-scene continuity. Visual checks compare intentional clothing changes against scene direction while retaining face/hair/identity checks.
- Connected character concept portraits, approval as uploaded references, scene-image generation/selection, and actual conditioning pixels. The first completed video can now be reviewed and selected without paying for a second take.
- Added stable scene add/reorder/archive/undo controls. Script rebuilds archive old scenes/takes. Undo preserves unrelated timeline edits and newly reviewed references. Serialised client writes prevent a build/navigation click overtaking a blur-save.
- Kept Urdu visibly unavailable and server-blocked. English generation rejects Urdu dialogue left in an English project. Existing Urdu drafts and the A2Vid code remain available for future work.
- Showed all four clip lengths; longer ones stay gated. Requested seconds, grid frames and measured output remain separate. Duration flows into dialogue budgets, prompts and worker inputs. Queue leases are renewed during long work.
- Unavailable duration requests are rejected before paid media work and remain distinct in source requirements. Longer requests also require the deployed worker's frame capacity before reference generation or job creation.
- Preserved optimistic database revisions, ownership, immutable takes, explicit relinking, bounded editor history and paid-job request identity.
- Fixed a real export timing issue: per-clip AAC encoding caused overlapping timestamps/delay at cuts. Intermediate clips now carry PCM; the final join encodes AAC once. Added Windows-safe FFmpeg filter paths.

## Verified in a real browser

`tests/studio-live-browser.cjs` uses the real Next.js application. Public checks passed at desktop and mobile sizes, including Start film scrolling, Guided choices, Urdu notice, length gates, sign-in form and protected-route redirect. It submits no preview model or GPU job.

Authenticated checks used manual sign-in in a dedicated Chrome profile, without retrieving/exporting credentials or session tokens. They passed project listing, film creation, title/idea/style saving, refresh/reopen, Profile/Change password/Settings navigation, progress unchanged by tab navigation, and scene add/reorder/remove/undo. Password changes were not submitted, so the user's password was left intact.

`tests/studio-live-editor.cjs` also passed against the real authenticated editor/API: playback, pointer trim, split, reorder, overlay typing/save, delete/undo, refresh persistence and desktop/mobile layout. Its separate owner-checked QA workspace reuses the existing generated clips as editor-only legacy sources. It does not assert a new character/story approval. No render/generation request is submitted; the actual merged MP4 check is the separate local FFmpeg test below.

The QA browser profile, screenshots and diagnostic scripts remain local and ignored by Git. Validation films are separate from existing user films.

## Verified with actual media

- Existing `validation-text.mp4` and `validation-image.mp4`: ffprobe reports H.264 video, AAC stereo at 48 kHz, 24 fps, 768×512, 4.041667 seconds of video. They are useful examples, but do not cover the requested coherent six-scene story or longer lengths.
- Representative frames visibly show the same short-curly-haired character and lighthouse/coastal setting in both samples. Both also contain burned-in text, which remains a visible limitation of those older outputs. Sampling cannot establish zero drift.
- `tests/studio-real-media.py` passes the real production FFmpeg exporter over these saved files: two trims, concatenation, timed text, and 1024×576 H.264/AAC output. The merged file measures 5.000 seconds. Pixel comparisons verify the text window. Audio-envelope alignment measures 10 ms with correlation 0.971 on this fixture. This checks timing, not the semantic accuracy of spoken dialogue.
- Artifacts: `.run-screenshots/existing-media/edited-validation.mp4`, `probe.json`, and `export-verification.json`.

## Automated checks

- Full Next.js production build passed, including type/lint checks and all 16 static pages.
- All 13 Node studio suites passed, including new progress/export-staleness, first-take review, wardrobe-conditioning and workflow undo coverage.
- The updated queue worker compiled successfully without starting a worker or processing queued jobs.
- Ten selected CPU English video/idempotency/duration/export worker tests passed. Deferred Urdu/audio-conditioned tests were not resumed.
- The approved existing Modal app `ltx25-fyp-api` was deployed. Authenticated CPU health reports model cache ready, 24 fps, frame step 8, and 121-frame default ceiling. No model weights were downloaded by the deployment.

## Paid validation and remaining review checklist

The bounded plan is at most nine English videos (six approximately 5s scenes plus one each at 10/15/20s), ten reference images, $10 Modal compute, 100 image-provider credits and 90 minutes. Run sequentially; stop on the first unexpected failure and never buy credits or retry automatically. Existing four-second samples do not substitute for these cases.

- [x] Spending decision: user chose **Finish without new paid generation**. No new video/reference-image jobs were submitted. The nine-clip batch is explicitly deferred.
- [ ] Approved generated reference and two recurring character identities reviewed on actual output.
- [ ] Coherent six-scene English story, wardrobe change and setting/prop continuity reviewed across representative frames.
- [ ] Actual generated speech listened to and compared with authored dialogue.
- [ ] One each at 10/15/20s reviewed on the pinned worker; enable only the lengths that pass.
- [ ] Refresh while generating and accepted-job retry/recovery verified against a live generation.
- [x] Browser trim/split/reorder/overlay/undo/reopen verified using existing generated media in a separate QA film.
- [ ] A fresh browser-to-Modal-to-Supabase merged export of that edited film; deferred with new paid compute. Local real-media MP4 export is verified separately.
- [ ] Captions and audio checked after those browser edits. Current timed overlays are not automatic speech subtitles.
- [ ] Actual provider runtime/credit consumption recorded; distinguish inference time from billed container startup/idle/CPU/RAM.
- [ ] Confirmation email delivery, expired real email links, and another device/browser handoff checked against the deployed auth configuration.
- [ ] Recheck mobile editor keyboard/drag interactions, concurrency between two tabs, and private-storage/signed-link expiry.
- [ ] Decide retention policy for archived takes, render artifacts, workspace JSON/history and worker volume data. Do not delete tables or model volumes as cleanup.

No claim of exact recurring voices, exact generated dialogue, identical soundtrack stems or zero character drift is made. The proposed next editor architecture is documented in [EDITOR_UPGRADE.md](EDITOR_UPGRADE.md); no additional models have been deployed.
