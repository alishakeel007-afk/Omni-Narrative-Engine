# LTX-2.5 deployment validation — 18 October 2026

Worker deployed to Modal app `ltx25-fyp-api`, workspace `emeebaltii007`. The corrected secret `my-huggingface-secret` provides `HF_TOKEN`; model access and the persistent cache were verified. API health rejects anonymous requests with 401 and accepts the configured application token. No credentials are stored in this report.

## Live generation

Exactly two GPU generation jobs were submitted. Each used the official distilled BF16 pipeline, a 768×512 validation resolution, 97 frames and 24 fps. Normal application requests use 1024×576, 121 frames; that larger configuration was not benchmarked in this run.

| Test | Output | Inference time | Native audio |
| --- | --- | --- | --- |
| Text → audiovisual clip | 4.042 seconds; 434,366 bytes | 231.08 seconds | Present; measured peak −1.1 dB |
| Reference image + text → audiovisual clip | 4.042 seconds; 329,440 bytes | 213.40 seconds | Present; measured peak −0.3 dB |

Both portray the same fictional filmmaker at a seaside lighthouse. The second uses a frame from the first as its image condition. Extracted start/middle/end frames broadly preserve her face, curls, dark jacket and brass brooch.

Gemini video/audio review transcribed the intended lines, “Our story starts here” and “Let us begin,” and reported speech, music and seaside ambience in both clips. It judged the visible mouth movements consistent with speech. This is model-assisted review, not an independent measurement of exact lip synchronization, voice continuity, or musical beat alignment.

Both generations added a subtitle even though the prompt requested no titles/subtitles. These subtitles are baked into the generated pixels; the new editor's text controls cannot remove them. Generated wording and imagery still need review. No personal photograph, trained identity adapter or cloned voice was used in these tests. Existing character review gates passed their regression checks; these samples do not establish perfect identity preservation.

## Assembly and persistence

The separate **LTX-2.5 validation** project is saved to the requested account:

[Open validation project](http://localhost:3000/studio?project=c7c89a51-96c9-4837-9314-328308999bad)

It contains both clips in Scenes and Assemble and one saved MP4 export. Existing projects were not changed. The export used the real application render route against Modal CPU FFmpeg, with a timed title and audio fades. It retained audible audio (measured peak −0.5 dB), both clips, the title before its end time, and its absence afterward. Supabase MP4 retrieval and database rereads verified durable storage and a single saved export record. A test harness supplied the known validation-project owner to the route; production authentication was not changed. Browser refresh recovery was separately verified with an isolated synthetic-MP4 harness.

The Node scene worker was rebuilt and restarted. A live idle-queue check found and fixed a pre-existing PostgreSQL/Prisma scheduling error: `pg_advisory_xact_lock` returns `void`, which Prisma cannot deserialize; casting that result to `text` preserves the lock and allows scheduling. Idle polls now avoid locking transactions, and database-only queue transactions allow 30 seconds to accommodate the remote connection. Both render and director lanes acquired the idle queue successfully. One non-rendering director question completed through the actual background worker in this project. Provider submission/recovery and queue concurrency passed mocked regression checks; no additional live scene render was submitted. Anonymous local studio and render API calls returned 401; the studio page redirected to authentication.

## Cost measurement

Total measured inference time: **444.48 GPU seconds**. At Modal's listed A100 80 GB rate of **$0.000694/second**, inference GPU time alone is approximately **$0.31**. This excludes container loading, the configured 30-second idle windows, CPU, 96 GiB requested system memory, model preparation, export CPU time, analysis API tokens, and any applicable storage/network charges. It is not the account's final invoice or a speed prediction for larger clips. Check Modal's usage dashboard for actual billed consumption. [Current Modal pricing](https://modal.com/pricing).

## Checks

Passed: Python worker validation/authentication/idempotency contracts; LTX adapter/storage/export retry contracts; native editor playback/caption timing/fades/refresh recovery; legacy studio browser workflow; parallel queue and thread browser checks; character continuity and director regressions; real CPU FFmpeg synthetic test; live two-clip generation and final assembly.

The updated Node worker bundle builds. Repository-wide `tsc --noEmit` still reports 73 existing errors in legacy story/database/UI files; none are in the new studio/video integration paths. This is not a clean full-repository production build.

See [deployment and operational limits](../workers/video/README.md).
