# Character appearance worker

The Next.js application works with its existing Magic Hour backend. This optional worker replaces **reference-conditioned image editing** with Qwen-Image-Edit-2511. It does not replace the chat model, video model, or Gemini appearance reviewer. Uploaded reference images are project data; Qwen and InstantID are model implementations, not reference photographs.

## Recommended setup for this project

Keep the website on the local laptop (or normal web hosting). Run the GPU model on Modal. A machine with approximately 400 MB of graphics memory cannot practically run this model. The Modal template requests an A100 with 80 GB of VRAM as a starting configuration, not a measured minimum. It caps GPU concurrency at one, keeps no permanently warm GPUs, and uses a 30-second scale-down window. The full model is large; the first download/start can take substantially longer than subsequent jobs.

No cloud deployment, GPU rental, model download, or character-specific training is performed by the web app setup or tests. The worker's GPU execution has not been verified on a real Modal deployment in this workspace. Node integration has mocked job tests. Python checks cover syntax plus CPU-only payload validation, authentication, actual image decoding and a mocked inference call. Run those with `py -3 test_worker.py` where Pillow and Pydantic are installed.

## Deploy on Modal

Install Python **3.11** if it is not already available, then use a separate environment for the deployment CLI. Your laptop does not need a GPU to deploy it. Starting in the repository root:

```powershell
Set-Location workers/character
py -3.11 -m venv .venv-modal
.\.venv-modal\Scripts\Activate.ps1
python -m pip install modal
modal setup
```

In the Modal dashboard, create a secret named `omninarrative-character` containing `STUDIO_QWEN_TOKEN`, using a random value of at least 32 characters. Keep that same value in the application's server-only environment. Do not put it into a NEXT_PUBLIC variable or source control.

From this directory:

```powershell
modal deploy modal_app.py
```

Copy the HTTPS URL printed for the `api` function into `.env.local`:

```dotenv
STUDIO_IMAGE_BACKEND=qwen
STUDIO_QWEN_URL=https://YOUR-DEPLOYMENT.modal.run
STUDIO_QWEN_TOKEN=YOUR_MATCHING_SECRET
```

Restart Next.js after changing environment variables. Upload a primary portrait and optionally side/full-body views, review and lock the character, approve a scene with that character, then generate its scene image. Jobs run asynchronously through authenticated POST /jobs and GET /jobs/{id}. The app archives the returned PNG in its existing generated-images bucket, performs the appearance check, and allows selection only after a pass. GPU job results remain retrievable through Modal's FunctionCall retention window; the app's archived copy is durable.

Set `STUDIO_IMAGE_BACKEND=magic-hour` to use the existing backend. The app never silently resubmits a failed Qwen job to a second paid provider. Concept images without references still use Magic Hour because Qwen Image **Edit** needs an input image. Video generation continues to use Magic Hour, conditioned on the selected checked scene image.

An easier alternative is Magic Hour's hosted Qwen option, which needs no Modal deployment or GPU management:

```dotenv
STUDIO_IMAGE_BACKEND=magic-hour
STUDIO_MAGIC_HOUR_IMAGE_MODEL=qwen-edit
```

Its documented limit is three input images total (one primary plus two additional); the app shares those slots fairly across up to three cast members. The provider alias does not pin a particular Qwen release, so do not assume it runs exactly the same weights/settings as the self-hosted 2511 worker. `flux-2-klein` keeps the existing six-input option. Changing this setting only affects new generations; it does not rerender completed media.

## Local GPU deployment

This is for a different machine with sufficient CUDA GPU memory, not the current laptop. Use Python 3.11 in an isolated environment:

```powershell
python -m pip install -r requirements.txt
$env:STUDIO_QWEN_TOKEN="YOUR_MATCHING_SECRET"
uvicorn local:app --host 127.0.0.1 --port 8001
```

Set `STUDIO_QWEN_URL=http://127.0.0.1:8001` in the Next.js environment. The local queue processes one render at a time, permits up to eight pending/running jobs, and retains completed results for approximately one hour. Restarting the worker loses that local queue. Do not use this in-memory queue for a multi-process production server.

## What the consistency controls do

- Each character has one reviewed canonical description, a primary view, and up to six reference views. Adding/changing/removing a view unlocks the profile for review.
- Each shot receives at least one image per cast member. Remaining image-input slots are shared round-robin across the cast. Flux and the self-hosted worker permit six total input images; the hosted Qwen API permits three. Large casts require smaller groups. Prompt text maps each numbered reference input to its named character.
- Every generated reference-based take records the character profile and reference versions used to produce it. Model seed is reproducible for a given profile and explicit variation, but a seed is not an identity guarantee. Revised takes include the previous rejected take's observed defects.
- Character scenes require a locked reference and a checked scene image before image-to-video. Text-only character video is blocked.
- Gemini reviews output images and samples videos at 24 fps. Every cast member must return a match. Mismatch, uncertainty, malformed model output, failed checks, and changed reference versions block selection, timeline insertion and film export. No manual action can set the check status to passed.
- Checks are performed once automatically after completion; errors/uncertainty require an explicit retry or revised take. The app does not automatically spend credits regenerating rejected media. Inline review inputs have an 18 MB combined limit.

These are appearance-continuity controls, not biometric identity verification. Small changes, occlusion, model mistakes and temporal drift can still escape a visual check. No available generative pipeline can promise an exactly identical person in every frame. High-stakes likeness work still requires human inspection and possibly compositing or deterministic character animation.

## Models, references, and LoRAs

[Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511) is Apache-2.0 and supports multi-image editing and improved character preservation. This template uses its released weights. It does not learn a new identity from a single upload.

The worker optionally loads an operator-supplied LoRA through `STUDIO_QWEN_LORA_REPO` and `STUDIO_QWEN_LORA_WEIGHTS` in its environment/Modal secret. This is a deployment-wide adapter (for example lighting/style, or a dedicated single-character experiment), not a per-user or per-character training system. Training a character LoRA requires a suitable dataset, GPU training time and separate evaluation; none has been trained here. Keep this unset for the shared multi-character service unless that adapter is appropriate for every job.

[InstantID](https://github.com/instantX-research/InstantID) is a different face-identity-conditioning pipeline. It is not an addon that can simply be imported into the Qwen pipeline. Its released checkpoints and InsightFace pretrained face models have research/noncommercial restrictions. It has not been installed or deployed here; use a separate inference service if evaluating it for the FYP, and review its licensing before commercial deployment.

## Cost comparison

Prices checked 18 October 2026. [Modal pricing](https://modal.com/pricing) lists A100 80 GB at **$0.000694 per second**, approximately **$2.50 per GPU-hour**. Hypothetical GPU-only costs:

| GPU time consumed | GPU-only charge |
| ----------------- | --------------: |
| 60 seconds        |         $0.0416 |
| 120 seconds       |         $0.0833 |
| 300 seconds       |         $0.2082 |

These are examples, not render-time benchmarks. Add CPU, requested RAM, model/container load time, the billed scale-down interval, storage beyond included amounts, and any applicable network charges. The configured 64 GiB RAM request also incurs charges while allocated. Scale-to-zero stops compute charges after shutdown; it does not mean warm idle time or loading is free. The pricing page currently lists $30/month of Starter credits; eligibility and current offers should be checked in your account.

Magic Hour's [editor docs](https://docs.magichour.ai/api-reference/image-projects/ai-image-editor) list Flux 2 Klein from 5 credits per image and qwen-edit from 10 credits. The [Creator usage-based rate](https://docs.magichour.ai/billing/usage-based-pricing) starts at $0.0012/credit, making those examples $0.006 and $0.012 per image on that billing arrangement. Subscription/prepaid effective rates and model choices differ. A self-hosted large Qwen model can therefore cost more than these API options; the actual comparison requires measured accepted-output cost, including failed/revised takes and cold starts. It is not automatically cheaper because the weights are free.

In Qwen mode, the GPU worker replaces the reference-image editing API charge. Magic Hour video generation, initial concept-image calls, Gemini planning/vision, and storage continue to have their own costs. Hosting a wrapper on Modal while still calling the same external image API adds Modal costs without removing that API bill.
