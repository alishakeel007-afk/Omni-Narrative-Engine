"""CPU-only validation, authenticated job submission, and durable artifact access."""
import base64
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
from uuid import UUID, uuid4

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator

MODEL_FILES = [
    "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors",
    "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
    "vae/ltx-2.5-video-vae-conv-bf16.safetensors",
    "vae/ltx-2.5-audio-vae-bf16.safetensors",
    "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
]

# Audio-conditioned generation needs the base (dev) transformer plus the
# distilled LoRA that A2VidPipelineTwoStage applies to its second stage. These
# are downloaded only when the audio pipeline is enabled, because the dev
# transformer is a separate multi-tens-of-gigabytes checkpoint.
AUDIO_MODEL_FILES = [
    "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors",
    "loras/ltx-2.5-22b-distilled-lora-450-bf16.safetensors",
]

MEDIA_HOST_SUFFIXES = (".supabase.co", ".supabase.in", ".magichour.ai")
MAX_AUDIO_BYTES = 16 * 1024 * 1024
MIN_AUDIO_SECONDS = 0.3
# A2Vid derives frame count from the supplied speech, so the audio length sets
# the clip length and therefore the GPU cost. Keep it explicitly bounded.
MAX_AUDIO_SECONDS = float(os.getenv("LTX_MAX_AUDIO_SECONDS", "10"))
FRAME_RATE = 24.0
FRAME_STEP = 8
MAX_AUDIO_FRAMES = 241
# The longest clip the request shape can express, used only as the field bound.
# The effective cap is MAX_VIDEO_FRAMES / MAX_AUDIO_FRAMES below.
FRAME_CEILING = 481
# Text/image clip length. 121 frames (~5.04s) is the only length validated on
# this pinned pipeline, so longer clips are an explicit operator decision rather
# than a default. The app has its own matching switch; a mismatch surfaces here
# as a rejected request instead of as a silently shortened clip.
MAX_VIDEO_FRAMES = min(FRAME_CEILING, int(os.getenv("LTX_MAX_VIDEO_FRAMES", "121")))

# width/height are the FINAL size; A2VidPipelineTwoStage runs stage 1 at half
# (stage_1_width=width // 2). LTX_2_PARAMS puts canonical stage 1 at 768x512, so
# the canonical audio-conditioned output is 1536x1024. Asking for 768x512 runs
# stage 1 at 384x256, which upstream's assert_resolution does not reject - it
# only checks divisibility by 64 - but which is far below the trained size.
SIZES = {(768, 512), (1024, 576)}
AUDIO_SIZES = SIZES | {(1536, 1024)}
CANONICAL_AUDIO_SIZE = (1536, 1024)


def assert_media_host(url: str) -> str:
    """Accepts only the storage hosts this deployment is allowed to read."""
    from urllib.parse import urlsplit
    parsed = urlsplit(url)
    host = parsed.hostname or ""
    if (
        parsed.scheme != "https"
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
        or not any(host.endswith(suffix) for suffix in MEDIA_HOST_SUFFIXES)
    ):
        raise ValueError("Unsupported media host.")
    return url


def snap_frames(seconds: float, max_frames: int = MAX_AUDIO_FRAMES) -> int:
    """Frames covering `seconds`, on the 8k+1 grid the transformer requires."""
    frames = max(1, round(seconds * FRAME_RATE))
    snapped = ((frames - 1 + FRAME_STEP - 1) // FRAME_STEP) * FRAME_STEP + 1
    return min(max_frames, max(33, snapped))


class VideoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    prompt: str = Field(min_length=4, max_length=24000)
    image_base64: str | None = Field(default=None, max_length=25_165_824)
    # Conditioning speech for lip-synced generation, as a storage URL. A URL
    # rather than an inline payload keeps requests under the body size limit.
    audio_url: str | None = Field(default=None, max_length=8192)
    seed: int = Field(default=42, ge=0, le=2**32 - 1)
    width: int = 1024
    height: int = 576
    # Omitted with audio: the pipeline derives the length from the speech.
    num_frames: int | None = Field(default=None, ge=33, le=FRAME_CEILING)

    @model_validator(mode="after")
    def bounds(self):
        if self.num_frames is None and not self.audio_url:
            self.num_frames = min(97, MAX_VIDEO_FRAMES)
        allowed = AUDIO_SIZES if self.audio_url else SIZES
        if (self.width, self.height) not in allowed:
            raise ValueError("Use a supported resolution.")
        if (self.width % 64) or (self.height % 64):
            raise ValueError("Two-stage resolutions must be multiples of 64.")
        if self.num_frames is not None:
            if (self.num_frames - 1) % FRAME_STEP:
                raise ValueError(f"Use {FRAME_STEP}k+1 frames.")
            limit = MAX_AUDIO_FRAMES if self.audio_url else MAX_VIDEO_FRAMES
            if self.num_frames > limit:
                raise ValueError(
                    f"This deployment generates at most {limit} frames "
                    f"({limit / FRAME_RATE:.2f}s) for this mode."
                )
        if self.audio_url:
            assert_media_host(self.audio_url)
        if self.image_base64:
            from PIL import Image
            try:
                raw = base64.b64decode(self.image_base64, validate=True)
                with Image.open(io.BytesIO(raw)) as image:
                    if image.format not in {"PNG", "JPEG", "WEBP"} or max(image.size) > 4096 or min(image.size) < 64:
                        raise ValueError("Unsupported image dimensions or type")
                    image.verify()
            except Exception:
                raise ValueError("Supply a valid PNG, JPEG, or WebP image under 18 MiB.") from None
        return self


AUDIO_CHANNELS = 2
AUDIO_RATE = 48000
# Shared volume mount in the deployed worker; overridable so tests stay local.
ARTIFACTS_DIR = os.getenv("LTX_ARTIFACTS_DIR", "/artifacts")


def normalize_conditioning_audio(source: str, destination: str) -> str:
    """
    Rewrites speech as stereo PCM at a fixed rate.

    The LTX audio VAE's first convolution expects two channels. TTS providers
    commonly return mono - ElevenLabs' mp3_44100_128 does - which otherwise
    fails deep inside the pipeline with a channel-count mismatch, after the
    model has already been loaded. Converting up front keeps that cost off the
    GPU and makes any decodable mono or stereo input usable.
    """
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", source,
         "-vn", "-ac", str(AUDIO_CHANNELS), "-ar", str(AUDIO_RATE),
         "-c:a", "pcm_s16le", destination],
        check=True, capture_output=True, timeout=120,
    )
    return destination


def audio_shape(path: str) -> tuple[int, float]:
    """Channel count and measured duration; never an estimate."""
    process = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_streams", "-show_format", "-of", "json", path],
        capture_output=True, text=True, check=True, timeout=30,
    )
    result = json.loads(process.stdout)
    streams = [s for s in result.get("streams", []) if s["codec_type"] == "audio"]
    if not streams:
        raise ValueError("The conditioning file has no audio stream.")
    return int(streams[0]["channels"]), float(result["format"]["duration"])


def audio_seconds(path: str) -> float:
    return audio_shape(path)[1]


def prepare_conditioning_audio(url: str, request_id: str, artifacts=None) -> tuple[float, str]:
    """
    Downloads, measures, validates and normalizes the speech on CPU, before any
    GPU container is started.

    The GPU never fetches or transcodes: it reads a ready stereo PCM file from
    the shared artifacts volume. An over-long, undecodable, or wrong-shaped line
    is therefore rejected at zero GPU cost rather than after a model load.
    """
    import tempfile
    import httpx
    assert_media_host(url)
    with tempfile.TemporaryDirectory(prefix="ltx-audio-") as directory:
        destination = Path(directory) / "conditioning"
        total = 0
        with httpx.stream("GET", url, follow_redirects=False, timeout=60) as response:
            response.raise_for_status()
            with open(destination, "wb") as output:
                for chunk in response.iter_bytes():
                    total += len(chunk)
                    if total > MAX_AUDIO_BYTES:
                        raise ValueError("The conditioning audio exceeds 16 MiB.")
                    output.write(chunk)
        seconds = audio_seconds(str(destination))
        if seconds < MIN_AUDIO_SECONDS:
            raise ValueError(f"The conditioning audio is only {seconds:.2f}s; supply at least {MIN_AUDIO_SECONDS}s of speech.")
        if seconds > MAX_AUDIO_SECONDS:
            raise ValueError(
                f"The conditioning audio is {seconds:.2f}s, above the {MAX_AUDIO_SECONDS:.0f}s limit for one shot. Shorten this dialogue line."
            )

        prepared = Path(ARTIFACTS_DIR) / "audio"
        prepared.mkdir(parents=True, exist_ok=True)
        target = prepared / f"{request_id}.wav"
        normalize_conditioning_audio(str(destination), str(target))
        # Confirm the normalized file is what the audio VAE expects before the
        # GPU is asked for anything.
        channels, normalized_seconds = audio_shape(str(target))
        if channels != AUDIO_CHANNELS:
            raise ValueError("The conditioning audio could not be converted to stereo.")
        if abs(normalized_seconds - seconds) > 0.25:
            raise ValueError("The conditioning audio changed length during conversion.")
    if artifacts is not None:
        artifacts.commit()
    return seconds, str(target)


def probe(path: str, require_audio: bool = False) -> dict:
    process = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", path], capture_output=True, text=True, check=True, timeout=30)
    result = json.loads(process.stdout)
    video = next((s for s in result["streams"] if s["codec_type"] == "video"), None)
    audio = next((s for s in result["streams"] if s["codec_type"] == "audio"), None)
    if not video or (require_audio and not audio):
        raise ValueError("The render did not contain the required video/audio streams.")
    return {"duration": float(result["format"]["duration"]), "has_audio": bool(audio), "width": video["width"], "height": video["height"], "bytes": Path(path).stat().st_size}


def safe_failure(error: Exception) -> str:
    # Provider logs contain diagnostics; API responses never include secrets/URLs.
    import logging
    logging.exception("LTX worker operation failed")
    if isinstance(error, ValueError):
        return str(error)[:300]
    return "The worker could not finish this job. Check the Modal logs before retrying."


def create_api(jobs, artifacts, models, worker, exporter):
    web = FastAPI(title="OmniNarrative video worker", docs_url=None, redoc_url=None)
    lock = threading.Lock()

    def authenticate(authorization):
        expected = os.getenv("STUDIO_LTX_TOKEN", "")
        if not expected or not hmac.compare_digest(authorization or "", f"Bearer {expected}"):
            raise HTTPException(401, "Unauthorized")

    def submit(kind, payload):
        request_id = str(payload["request_id"])
        def requirements(value):
            # Signed storage URLs expire; refreshing a signature is not a new edit.
            if isinstance(value, list):
                return [requirements(item) for item in value]
            if isinstance(value, dict):
                from urllib.parse import urlsplit, urlunsplit
                def stable_url(url):
                    return urlunsplit((*urlsplit(url)[:3], "", ""))
                result = {}
                for key, item in value.items():
                    if key in {"url", "music", "audio_url"} and isinstance(item, str):
                        result[key] = stable_url(item)
                    elif key == "voices":
                        result[key] = [stable_url(url) for url in item]
                    else:
                        result[key] = requirements(item)
                return result
            return value
        fingerprint = hashlib.sha256(json.dumps(requirements(payload), sort_keys=True).encode()).hexdigest()
        key = f"{kind}:{request_id}"
        with lock:
            existing = jobs.get(key)
            if existing:
                if existing["fingerprint"] != fingerprint:
                    raise HTTPException(409, "This request ID belongs to different requirements.")
                if not existing.get("call_id"):
                    raise HTTPException(409, "Submission is uncertain. Check worker logs; do not submit a duplicate.")
                return {"id": existing["id"], "status": jobs[existing["id"]]["status"]}
            job_id = str(uuid4())
            record = {"id": job_id, "kind": kind, "status": "queued", "created_at": time.time()}
            # Reserve before spawning. A crash in this window cannot cause a blind retry.
            jobs[key] = {"id": job_id, "fingerprint": fingerprint}
            jobs[job_id] = record
            call = worker().generate.spawn(job_id, payload) if kind == "video" else exporter.spawn(job_id, payload)
            jobs[key] = {"id": job_id, "fingerprint": fingerprint, "call_id": call.object_id}
            jobs[job_id] = {**jobs[job_id], "call_id": call.object_id}
            return {"id": job_id, "status": "queued"}

    @web.middleware("http")
    async def protect(request: Request, call_next):
        try:
            authenticate(request.headers.get("authorization"))
        except HTTPException:
            from fastapi.responses import JSONResponse
            return JSONResponse({"error": "Unauthorized"}, status_code=401)
        length = request.headers.get("content-length", "0")
        if not length.isdigit() or int(length) > 27_000_000:
            from fastapi.responses import JSONResponse
            return JSONResponse({"error": "Request too large"}, status_code=413)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @web.get("/health")
    def health():
        models.reload()
        audio_ready = Path("/models/ltx25/audio-ready").exists()
        modes = ["text-to-video", "image-to-video"]
        if audio_ready:
            modes.append("audio-to-video")
        return {
            "status": "ready",
            "models_cached": Path("/models/ltx25/ready").exists(),
            "audio_models_cached": audio_ready,
            "modes": modes,
            "native_audio": True,
            "max_audio_seconds": MAX_AUDIO_SECONDS,
            # Published so the app can read the real caps rather than keep its
            # own copy of them.
            "frame_rate": FRAME_RATE,
            "frame_step": FRAME_STEP,
            "max_video_frames": MAX_VIDEO_FRAMES,
            "max_audio_frames": MAX_AUDIO_FRAMES,
            "max_video_seconds": round(MAX_VIDEO_FRAMES / FRAME_RATE, 2),
        }

    @web.post("/jobs", status_code=202)
    def video(payload: VideoRequest):
        models.reload()
        if not Path("/models/ltx25/ready").exists():
            raise HTTPException(503, "Model cache is not prepared yet.")
        request = payload.model_dump(mode="json")
        if payload.audio_url:
            if not Path("/models/ltx25/audio-ready").exists():
                raise HTTPException(503, "The audio-conditioned model cache is not prepared yet.")
            # Prepared on CPU: an unusable line must never start a GPU container,
            # and the GPU receives audio already in the shape the VAE needs.
            try:
                seconds, prepared = prepare_conditioning_audio(
                    payload.audio_url, str(payload.request_id), artifacts
                )
            except ValueError as error:
                raise HTTPException(422, str(error)[:300]) from None
            except Exception:
                raise HTTPException(502, "The conditioning audio could not be prepared.") from None
            request["audio_seconds"] = round(seconds, 3)
            request["audio_path"] = prepared
            request["num_frames"] = payload.num_frames or snap_frames(seconds, MAX_AUDIO_FRAMES)
        return submit("video", request)

    @web.post("/exports", status_code=202)
    def export(payload: dict):
        from ltx_exporter import ExportRequest
        from pydantic import ValidationError
        try:
            validated = ExportRequest.model_validate(payload)
        except ValidationError:
            raise HTTPException(422, "Invalid timeline or text settings.") from None
        return submit("export", validated.model_dump(mode="json"))

    def get_job(job_id):
        if not re.fullmatch(r"[a-f0-9-]{36}", job_id):
            raise HTTPException(404, "Job not found")
        record = jobs.get(job_id)
        if not record:
            raise HTTPException(404, "Job not found")
        if record["status"] in {"queued", "rendering"} and record.get("call_id"):
            import modal
            try:
                modal.FunctionCall.from_id(record["call_id"]).get(timeout=0)
                record = jobs[job_id]
            except TimeoutError:
                pass
            except Exception:
                record = {**record, "status": "error", "error": "Container execution failed. Check Modal logs before retrying."}
                jobs[job_id] = record
        return {k: v for k, v in record.items() if k != "call_id"}

    @web.get("/jobs/{job_id}")
    def status(job_id: str):
        return get_job(job_id)

    @web.get("/jobs/{job_id}/file")
    def file(job_id: str):
        if get_job(job_id)["status"] != "complete":
            raise HTTPException(409, "Video is not ready")
        artifacts.reload()
        path = Path(f"/artifacts/{job_id}.mp4")
        if not path.is_file():
            raise HTTPException(410, "Artifact is no longer available")
        return FileResponse(path, media_type="video/mp4", filename=f"{job_id}.mp4")

    return web
