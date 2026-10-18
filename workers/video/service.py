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


class VideoRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    prompt: str = Field(min_length=4, max_length=24000)
    image_base64: str | None = Field(default=None, max_length=25_165_824)
    seed: int = Field(default=42, ge=0, le=2**32 - 1)
    width: int = 1024
    height: int = 576
    num_frames: int = Field(default=97, ge=33, le=121)

    @model_validator(mode="after")
    def bounds(self):
        if (self.width, self.height) not in {(768, 512), (1024, 576)} or (self.num_frames - 1) % 8:
            raise ValueError("Use a supported resolution and 8k+1 frames, at most 121.")
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
                    if key in {"url", "music"} and isinstance(item, str):
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
        return {"status": "ready", "models_cached": Path("/models/ltx25/ready").exists(), "modes": ["text-to-video", "image-to-video"], "native_audio": True}

    @web.post("/jobs", status_code=202)
    def video(payload: VideoRequest):
        models.reload()
        if not Path("/models/ltx25/ready").exists():
            raise HTTPException(503, "Model cache is not prepared yet.")
        return submit("video", payload.model_dump(mode="json"))

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
