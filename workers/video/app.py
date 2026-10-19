"""Deploy: .venv-modal/Scripts/python.exe -m modal deploy workers/video/app.py.

CPU API and export service; one GPU container for native audiovisual generation.
Importing/deploying does not invoke generation or download model weights.
"""
from pathlib import Path
import os
import modal

APP_NAME = "ltx25-fyp-api"
UPSTREAM = "be6d6d0a69d11a0a399c462ed92606692e5f8697"
MODEL_REVISION = "49b093a39c19169a8a81721dcc541e07e945232f"
folder = Path(__file__).parent
hf_secret = modal.Secret.from_name(os.getenv("LTX_HF_SECRET", "my-huggingface-secret"))
api_secret = modal.Secret.from_name("ltx25-api-secret")
base_image = (
    modal.Image.debian_slim(python_version="3.12")
    .env({"LTX_MAX_VIDEO_FRAMES": os.getenv("LTX_MAX_VIDEO_FRAMES", "121"),
          "LTX_MAX_AUDIO_SECONDS": os.getenv("LTX_MAX_AUDIO_SECONDS", "10")})
    .apt_install("ffmpeg", "fonts-dejavu-core")
    .pip_install_from_requirements(str(folder / "requirements.txt"))
)
api_image = (
    base_image
    .add_local_file(str(folder / "service.py"), "/root/ltx_service.py", copy=True)
    .add_local_file(str(folder / "exporter.py"), "/root/ltx_exporter.py", copy=True)
    .add_local_file(str(folder.parent.parent / "public/fonts/Manrope.ttf"), "/root/Manrope.ttf", copy=True)
)
gpu_image = (
    base_image.apt_install("git", "libglib2.0-0", "libgl1")
    .pip_install("torch==2.9.1", "torchvision==0.24.1", "torchaudio==2.9.1", index_url="https://download.pytorch.org/whl/cu128")
    .pip_install("transformers==5.14.1", "accelerate==1.12.0", "diffusers==0.35.1", "sentencepiece==0.2.1", "safetensors==0.8.0", "numpy==2.2.6", "scipy==1.15.3", "einops==0.8.1", "av==15.1.0", "colour-science==0.4.6", "OpenImageIO==3.0.12.0", "cloudpickle==3.1.2")
    .pip_install(f"git+https://github.com/Lightricks/LTX-2.git@{UPSTREAM}#subdirectory=packages/ltx-core", f"git+https://github.com/Lightricks/LTX-2.git@{UPSTREAM}#subdirectory=packages/ltx-pipelines")
    .run_commands("python -c 'from ltx_pipelines.distilled import DistilledPipeline; from ltx_pipelines.a2vid_two_stage import A2VidPipelineTwoStage; print(\"LTX import ready\")'")
    .env({"HF_HOME": "/models/hf", "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
          "LTX_A2V_STEPS": os.getenv("LTX_A2V_STEPS", "30"),
          "LTX_MAX_AUDIO_SECONDS": os.getenv("LTX_MAX_AUDIO_SECONDS", "10")})
    .add_local_file(str(folder / "service.py"), "/root/ltx_service.py", copy=True)
    .add_local_file(str(folder / "inference.py"), "/root/ltx_inference.py")
)
app = modal.App(APP_NAME)
models = modal.Volume.from_name("omninarrative-ltx25-models", create_if_missing=True)
artifacts = modal.Volume.from_name("omninarrative-ltx25-artifacts", create_if_missing=True)
jobs = modal.Dict.from_name("omninarrative-ltx25-jobs", create_if_missing=True)


@app.function(image=api_image, secrets=[hf_secret, api_secret], volumes={"/models": models}, timeout=7200)
def prepare_models(download: bool = False, audio: bool = False):
    """
    `audio=True` additionally fetches the base (dev) transformer and the
    distilled LoRA that the audio-conditioned pipeline needs. That is a large,
    separate download, so it is opt-in and tracked by its own marker file.
    """
    import os
    from huggingface_hub import HfApi, hf_hub_url, get_hf_file_metadata, snapshot_download
    from ltx_service import AUDIO_MODEL_FILES, MODEL_FILES
    token = os.getenv("HF_TOKEN")
    if not token or not os.getenv("STUDIO_LTX_TOKEN"):
        raise RuntimeError("HF_TOKEN or STUDIO_LTX_TOKEN is missing from the configured Modal secrets.")
    wanted = MODEL_FILES + (AUDIO_MODEL_FILES if audio else [])
    info = HfApi().model_info("Lightricks/LTX-2.5", revision=MODEL_REVISION, token=token)
    sizes = {}
    for name in wanted:
        metadata = get_hf_file_metadata(hf_hub_url(info.id, name, revision=MODEL_REVISION), token=token)
        sizes[name] = metadata.size
    if download:
        snapshot_download(info.id, revision=MODEL_REVISION, allow_patterns=wanted, token=token, local_dir="/models/ltx25")
        Path("/models/ltx25/ready").write_text(MODEL_REVISION)
        if audio:
            Path("/models/ltx25/audio-ready").write_text(MODEL_REVISION)
        models.commit()
    return {
        "secrets_present": True,
        "model_access": True,
        "downloaded": download,
        "audio": audio,
        "revision": MODEL_REVISION,
        "bytes": sizes,
        "total_gib": round(sum(size for size in sizes.values() if size) / 1024**3, 2),
    }


@app.cls(image=gpu_image, gpu=os.getenv("LTX_GPU", "A100-80GB"),
         memory=int(os.getenv("LTX_GPU_MEMORY_MB", "98304")),
         timeout=int(os.getenv("LTX_GPU_TIMEOUT", "1200")), startup_timeout=900,
         min_containers=0, max_containers=1, scaledown_window=30,
         volumes={"/models": models, "/artifacts": artifacts}, secrets=[hf_secret])
class VideoWorker:
    @modal.enter()
    def load(self):
        from ltx_inference import Engine
        if not Path("/models/ltx25/ready").exists():
            raise RuntimeError("Run prepare_models with download=True before generation.")
        # Engine builds its pipeline on first use, so container start does not
        # load weights for a pipeline this job may not need.
        self.engine = Engine("/models/ltx25")

    @modal.method()
    def generate(self, job_id: str, payload: dict):
        import resource
        import time
        import torch
        from ltx_service import probe, safe_failure
        started = time.time()
        jobs[job_id] = {**jobs[job_id], "status": "rendering", "started_at": started}
        # The CPU API leaves prepared conditioning audio on this volume.
        artifacts.reload()
        torch.cuda.reset_peak_memory_stats()

        def usage():
            # ru_maxrss is KiB on Linux and is a high-water mark, so it still
            # reports the peak even when a failure unwinds the allocation.
            return {
                "peak_host_gib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024**2, 2),
                "peak_gpu_gib": round(torch.cuda.max_memory_allocated() / 1024**3, 2),
                "gpu_total_gib": round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2),
            }

        try:
            output = f"/artifacts/{job_id}.mp4"
            self.engine.generate(payload, output)
            metadata = probe(output, require_audio=True)
            artifacts.commit()
            jobs[job_id] = {**jobs[job_id], "status": "complete", "seconds": round(time.time() - started, 2), **usage(), **metadata}
        except Exception as error:
            jobs[job_id] = {**jobs[job_id], "status": "error", "seconds": round(time.time() - started, 2), **usage(), "error": safe_failure(error)}
        return {"id": job_id, "status": jobs[job_id]["status"]}


@app.function(image=api_image, volumes={"/artifacts": artifacts}, timeout=900,
              min_containers=0, max_containers=1)
def render_export(job_id: str, payload: dict):
    import time
    from ltx_exporter import render
    from ltx_service import probe, safe_failure
    started = time.time()
    jobs[job_id] = {**jobs[job_id], "status": "rendering"}
    try:
        artifacts.reload()
        output = f"/artifacts/{job_id}.mp4"
        render(payload, output)
        metadata = probe(output, require_audio=True)
        artifacts.commit()
        jobs[job_id] = {**jobs[job_id], "status": "complete", "seconds": round(time.time() - started, 2), **metadata}
    except Exception as error:
        jobs[job_id] = {**jobs[job_id], "status": "error", "error": safe_failure(error)}
    return {"id": job_id, "status": jobs[job_id]["status"]}


@app.function(image=api_image, secrets=[api_secret], volumes={"/models": models, "/artifacts": artifacts},
              min_containers=0, max_containers=1, timeout=180)
@modal.concurrent(max_inputs=1)
@modal.asgi_app()
def api():
    from ltx_service import create_api
    return create_api(jobs, artifacts, models, VideoWorker, render_export)


@app.local_entrypoint()
def main(download: bool = False, audio: bool = False):
    """Without --download this only checks access and reports download sizes."""
    print(prepare_models.remote(download, audio))
