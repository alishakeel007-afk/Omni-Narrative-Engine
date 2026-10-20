# Omni-Narrative Engine

A Next.js storytelling studio with four steps: Setup, Script & Characters,
Generate Video, and Edit & Export. The homepage includes a guest story demo.
Saved projects are available at `/dashboard` and `/film/[id]` (`/story/[id]`
also opens the project flow).

## Local setup

Requirements: Node.js/npm, Supabase PostgreSQL and Storage, and configured model
providers. Use `.env.example` as a configuration reference and keep private
values in `.env.local`.

```powershell
npm ci
npm run prisma:generate
npm run prisma:deploy
npm run dev
```

`npm run dev` starts Next.js and the scene queue worker. Both processes are needed
for queued generation and archival. For production, build with `npm run build`,
run `npm start`, and run `npm run studio:worker` as a separate persistent process.

Database connections use `DATABASE_URL`. Supabase connections verify TLS against
`certs/prod-ca-2021.crt`; `SUPABASE_DB_CA_PATH` can specify a different trusted CA.
Keep this certificate in deployments. Its official source is
[Supabase's certificate distribution](https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt).

## Video worker

The native LTX 2.5 service runs on Modal. Local Python tooling uses `.venv-modal`;
model weights and worker artifacts reside in persistent Modal volumes.

```powershell
python -m venv .venv-modal
.\.venv-modal\Scripts\python.exe -m pip install -r workers/video/requirements.txt
```

Configure the Modal secrets `my-huggingface-secret` (`HF_TOKEN`) and
`ltx25-api-secret` (`STUDIO_LTX_TOKEN`), then prepare and deploy:

```powershell
.\.venv-modal\Scripts\python.exe -X utf8 -m modal run workers/video/app.py --download
.\.venv-modal\Scripts\python.exe -X utf8 -m modal deploy workers/video/app.py
```

The server configuration includes:

```ini
STUDIO_VIDEO_BACKEND=modal-ltx
STUDIO_LTX_URL=https://YOUR-DEPLOYED-WORKER.modal.run
STUDIO_LTX_TOKEN=your-private-worker-token
STUDIO_CLIP_SECONDS=5,10,15,20
STUDIO_CLIP_MAX_SECONDS=20
```

Restart the web server and scene worker after changing their configuration.
Worker `/health` reports supported frame counts without starting the GPU.
The native worker supports up to 481 frames at 24 fps for the enabled lengths;
the app checks longer requests against its reported capability. Actual output
duration is measured. English clips include a single mixed native soundtrack.
Urdu/audio-conditioned generation remains disabled pending usable-output
validation. Voice cloning and separate native dialogue/music stems are unavailable.

Render retries preserve accepted provider IDs and stable request IDs to avoid
duplicate submissions. Unknown interrupted submissions require provider review.
Take deletion coordinates application storage and native worker artifact cleanup.
Do not delete model volumes when cleaning render artifacts.

## Character and reference workflow

Characters can have optional gender, age, nationality, ethnicity/community,
religion and clothing preferences, including custom values. Saved choices take
priority over creative defaults; names and uploaded faces do not establish
religion or nationality. Omni fills blank unreferenced appearance profiles when
directing, while preserving authored descriptions and reference identities.

Scenes without character reference photos can generate video directly. Scenes
with character references require a scene image, either checked successfully or
explicitly accepted with **Skip check and use this image**. That approval retains
the original review result and is bound to the current image and requirements.

Pakistan-focused creative guidance fills missing context only. Explicit setting,
clothing, head-covering and other requirements override defaults. Regional notes
draw on [Pakistan's official cultural overview](https://mofa.gov.pk/mazar-e-sharif-culture),
[UNESCO's Lahore heritage reference](https://whc.unesco.org/en/list/171/),
[UNESCO's Makli/Thatta reference](https://whc.unesco.org/en/list/143/) and
[Gilgit-Baltistan's tourism department](https://www.visitgilgitbaltistan.gov.pk/categories/posts/3/8).

## Checks

```powershell
npm run test:studio
npm run test:studio:character-details:browser
npm run test:studio:reference:browser
npm run test:studio:dialogue:browser
npm run test:studio:controls:browser
npm run test:worker
npx tsc --noEmit --incremental false
```

Browser checks require Chrome. The isolated suites use fixtures and mocked
providers; the separate live/media scripts can require accounts or paid services.

## Assets and generated files

`public/films/ltx-hero-20s.mp4` is the project's generated 20-second LTX hero with
native audio; `public/posters/ltx-hero-20s.jpg` is its matching first frame.
Keep public media and the font license at `public/fonts/Manrope-OFL.txt`.

`.next`, `.next-dev`, `.studio-worker`, `node_modules` and `.venv-modal` are local
build/runtime directories. Diagnostic screenshots, downloaded documentation and
scratch render copies are not required source files and are ignored by Git.
