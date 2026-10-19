# Native LTX-2.5 video and MP4 assembly

OmniNarrative submits text-to-video, image-and-text-to-video, or audio-conditioned jobs to an authenticated Modal CPU API. LTX generates video and a single native soundtrack (speech, music and effects); the MP4 keeps both streams. Voice cloning is not implemented.

## Audio-conditioned (lip-synced) generation

Supplying `audio_url` routes the job to `A2VidPipelineTwoStage` instead of the distilled pipeline. The supplied speech is frozen conditioning, so the model animates to it rather than regenerating it, and the pipeline derives the clip length from the audio. This is used for Urdu, where dialogue is synthesised with ElevenLabs first and then sent for lip-sync.

**One take carries one speaking turn.** A clip has a single mixed soundtrack and a single lip-synced performance, so a scene with several speakers must be split into separate shots before submission.

This mode is off unless both are true:

- `/models/ltx25/audio-ready` exists, written by `prepare_models(download=True, audio=True)`.
- The app sets `STUDIO_LTX_AUDIO_PIPELINE="a2vid"` (alongside `STUDIO_VIDEO_BACKEND="modal-ltx"`).

It needs two weight files beyond the distilled set, because both diffusion stages load the base transformer and stage 2 adds the distilled LoRA:

| File | Size |
| --- | --- |
| `diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors` | 42.0 GB |
| `loras/ltx-2.5-22b-distilled-lora-450-bf16.safetensors` | 8.9 GB |

Holding two `DiffusionStage` instances needs substantially more system RAM than the distilled pipeline. Set `LTX_GPU_MEMORY_MB` (and `LTX_GPU_TIMEOUT`) before deploying, and treat the first live clip as a measurement, not a feature. Only one pipeline is resident at a time: switching between the distilled and audio engines releases the previous one.

Conditioning audio is downloaded and measured with ffprobe on the **CPU** API before any GPU container starts, so an over-long or undecodable line is rejected without GPU cost. `LTX_MAX_AUDIO_SECONDS` (default 10) bounds one shot; longer speech is refused with the measured duration rather than truncated. Tuning knobs for the spike: `LTX_A2V_STEPS`, `LTX_A2V_CFG_SCALE`, `LTX_A2V_STG_SCALE`, `LTX_A2V_RESCALE_SCALE`, `LTX_A2V_MODALITY_SCALE`, `LTX_A2V_SKIP_STEP`, `LTX_A2V_STG_BLOCKS`, `LTX_A2V_NEGATIVE_PROMPT`.

### Validation status: audio works, video does not (as of the first live runs)

Three live attempts at 768x512 / 20 steps, ~14.8 GPU-minutes total:

| | Result |
| --- | --- |
| Supplied speech | **Preserved exactly** - 0.9991 waveform correlation, 0 ms offset |
| Invented speech | **None** - silent spans stay quiet (0.087 relative energy, same as a static control) |
| Clip length from audio | Correct - 6.288 s speech -> 153 frames -> 6.375 s clip |
| MP4 / archival | Correct - 768x512 h264 + aac, stored in Supabase |
| **Video content** | **Unusable** - frame 0 shows the conditioning portrait, then degrades to pure noise |

Frame 0 reproduces the reference image, so image conditioning and audio conditioning both apply; the denoise then diverges. That pattern points at guidance, not the VAE - a VAE fault would corrupt frame 0 equally.

Upstream community guidance for LTX-2.5 custom-audio lip-sync is to use **CFG 1 for both video and audio and to disable modality guidance**. The defaults here came from the documented LTX-2.3/2.4 preset (cfg 3.0, stg 1.0, modality 3.0), which is the opposite. Retune via `LTX_A2V_CFG_SCALE=1`, `LTX_A2V_STG_SCALE=0`, `LTX_A2V_MODALITY_SCALE=1`, `LTX_A2V_RESCALE_SCALE=0` before changing any code - these are deploy-time env values, so no code change is needed to test it.

**Lip-sync quality remains unverified**: no usable video has been produced, so there is nothing to judge. Upstream notes the dubbing pipeline is still tuned for LTX 2.3 and that 2.5 is stricter about what it will say, so passing the contract tests is not evidence that lip-sync works.

## Deployment

Run from the repository root in PowerShell. Python and Modal stay in `.venv-modal`; model weights stay on Modal.

1. Modal secrets:
   - `my-huggingface-secret`: `HF_TOKEN`, a Hugging Face Read token with access to `Lightricks/LTX-2.5`.
   - `ltx25-api-secret`: `STUDIO_LTX_TOKEN`, matching the server-only local variable.
2. Check access, then populate the persistent model cache:

   ```powershell
   .\.venv-modal\Scripts\python.exe -X utf8 -m modal run workers/video/app.py
   .\.venv-modal\Scripts\python.exe -X utf8 -m modal run workers/video/app.py --download
   ```

3. Deploy:

   ```powershell
   .\.venv-modal\Scripts\python.exe -X utf8 -m modal deploy workers/video/app.py
   ```

4. Set `.env.local`, then restart Next.js **and** the scene worker:

   ```ini
   STUDIO_VIDEO_BACKEND="modal-ltx"
   STUDIO_LTX_URL="https://YOUR-WORKSPACE--ltx25-fyp-api-api.REGION.modal.run"
   STUDIO_LTX_TOKEN="your-matching-private-token"
   SUPABASE_VIDEO_BUCKET="generated-videos"
   ```

   Keep the existing Supabase URL and service role key. Do not add `NEXT_PUBLIC_` to provider credentials. Leave bucket visibility unchanged; changing privacy requires checking the rest of the legacy app's media flows.

   ```powershell
   npm run dev:with-worker
   ```

   Use that command after stopping any old dev server/scene worker to avoid duplicate processes. Production needs the scene worker as a persistent Node process alongside Next.js; deploying the Next.js site alone does not run its queue.

## Resources and limits

- Official LTX source pinned at `be6d6d0a69d11a0a399c462ed92606692e5f8697`; model revision `49b093a39c19169a8a81721dcc541e07e945232f`.
- Distilled BF16 transformer, matching Gemma text encoder, convolutional video VAE, audio VAE and spatial upscaler. The convolutional decoder avoids the diffusion VAE's optional NATTEN compilation dependency.
- Persistent volumes: `omninarrative-ltx25-models` and `omninarrative-ltx25-artifacts`. First download is large; later boots reuse it.
- A100 80 GB, CPU offload, 96 GiB system RAM, one GPU container maximum, zero minimum, 30-second idle window. CPU API/export can stay available while the GPU scales down. GPU billing includes boot and idle time; returned inference seconds exclude model loading. Storage persists and can incur charges while compute is stopped.
- App clips: 1024×576, 121 frames at 24 fps (about five seconds). Validation can use 768×512, 97 frames. The API permits only those two resolutions, 33–121 frames on an `8k+1` grid, and bounded image payloads.
- Export: CPU FFmpeg H.264/AAC MP4, 1024×576/24 fps, at most 12 clips/three minutes, eight captions per clip. Captions support text, horizontal/vertical placement, size, color and timing relative to the trimmed clip. Native clips default to audible original audio; legacy clips retain separate dialogue/music mixing. Audio fades affect the clip mix.
- API and exported media require `Authorization: Bearer STUDIO_LTX_TOKEN`. Browser clients use authenticated Next.js routes; they never receive the worker token. CORS is unnecessary for that server-to-server path.

## Job safety and persistence

`POST /jobs` accepts `request_id` (UUID), `prompt`, optional `image_base64`, optional `audio_url`, `seed`, `width`, `height`, `num_frames`. With `audio_url` the frame count may be omitted and is derived from the measured speech; without it the 121-frame cap still applies. `audio_url` must be an HTTPS storage URL on the same allowlist the exporter uses, and its signature is excluded from the idempotency fingerprint so refreshing a signed link is not a new job. It returns an accepted job ID immediately. `GET /jobs/{id}` reports progress; `GET /jobs/{id}/file` downloads a completed MP4. `POST /exports` submits a validated timeline to CPU FFmpeg. `GET /health` verifies the cache without starting a GPU.

The API reserves each request ID before spawning. Retrying an accepted request with identical requirements reuses its ID. Changed requirements with the same ID return 409. An ambiguous spawn window returns a diagnostic rather than blindly generating a duplicate; inspect Modal logs before retrying. There are no automatic GPU generation retries.

Scene jobs retain their original provider ID and existing thread/requirements snapshot. Both image and video character appearance checks still gate selection and assembly. Completed renders are copied to Supabase before publishing; project JSON and queue records survive reloads. A browser must resume polling or the Node scene worker must be running to archive a completed scene job.

Exports reserve an immutable timeline snapshot in project JSON before submitting, preserving concurrent chat and edits. Refresh resumes the same request; lost responses are retried against Modal's idempotent API. Completed exports are copied to Supabase and added to Saved exports. Signed source URLs grant the CPU worker temporary access without sharing the Supabase service role key. Reopen Assemble to resume export polling if the page was closed before archival completed.

Artifacts also remain on the Modal volume. Keep them until Supabase archival succeeds. No automatic deletion policy is enabled: an operator should periodically delete archived old artifacts and old Dict entries after choosing an appropriate retention period. Do not delete the model volume to clean render outputs.

## Validation

```powershell
node tests/studio-ltx.cjs
.\.venv-modal\Scripts\python.exe tests/video-worker.py
node tests/studio-ltx-browser.cjs
.\.venv-modal\Scripts\python.exe -X utf8 -m modal run workers/video/check_export.py
```

The first three use mocks/synthetic media and no provider credits (the Python test needs the CPU dependencies in `requirements.txt`). The last runs CPU only and verifies real FFmpeg MP4 encoding, audible signal, trim duration and caption timing with literal punctuation. It does not download weights or start a GPU.

The browser test also needs `imageio-ffmpeg==0.6.0` in `.venv-modal` to make a local synthetic MP4. This is a testing tool, not a GPU runtime dependency. See [the live deployment validation report](../../docs/LTX25_VALIDATION.md) for sample results and the measured cost basis.

Review generated speech, audio direction and character appearance before increasing duration/resolution. LTX does not guarantee exact wording, identical voices/music across clips, or zero identity drift. Existing visual checks can flag problems, but do not prove perfect consistency. Separate soundtrack stems are not available.

Official references: [LTX source and setup](https://github.com/Lightricks/LTX-2), [model](https://huggingface.co/Lightricks/LTX-2.5), [Modal secrets](https://modal.com/docs/guide/secrets), [Modal volumes](https://modal.com/docs/guide/volumes), [Modal pricing](https://modal.com/pricing).
