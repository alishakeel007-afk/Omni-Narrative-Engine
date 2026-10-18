"""Deployment template: modal deploy modal_app.py. Does not deploy on import."""
from pathlib import Path
import modal

folder = Path(__file__).parent
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_requirements(str(folder / "requirements.txt"))
    .add_local_file(str(folder / "inference.py"), "/root/inference.py")
)
app = modal.App("omninarrative-character")
api_image = modal.Image.debian_slim(python_version="3.11").pip_install("fastapi>=0.115,<1", "pydantic>=2.10,<3").add_local_file(str(folder / "inference.py"), "/root/inference.py")
cache = modal.Volume.from_name("omninarrative-qwen-cache", create_if_missing=True)
secret = modal.Secret.from_name("omninarrative-character")
registry = modal.Dict.from_name("omninarrative-character-jobs", create_if_missing=True)

@app.cls(image=image, gpu="A100-80GB", timeout=1200, min_containers=0,
         max_containers=1, scaledown_window=30, memory=65536,
         volumes={"/model-cache": cache}, secrets=[secret])
class CharacterWorker:
    @modal.enter()
    def load(self):
        import os
        os.environ["HF_HOME"] = "/model-cache"
        from inference import QwenEngine
        self.engine = QwenEngine()
        cache.commit()

    @modal.method()
    def generate(self, payload):
        return self.engine.generate(payload)

@app.function(image=api_image, secrets=[secret], min_containers=0, max_containers=1)
@modal.asgi_app()
def api():
    from fastapi import FastAPI, Header, HTTPException
    from pydantic import ValidationError
    from inference import authenticate, validate_payload
    web = FastAPI(docs_url=None, redoc_url=None)

    @web.post("/jobs")
    def submit(payload: dict, authorization: str | None = Header(default=None)):
        authenticate(authorization)
        try:
            payload = validate_payload(payload)
        except ValidationError:
            raise HTTPException(422, "Invalid image request") from None
        call = CharacterWorker().generate.spawn(payload)
        registry[call.object_id] = True
        return {"id": call.object_id}

    @web.get("/jobs/{job_id}")
    def result(job_id: str, authorization: str | None = Header(default=None)):
        authenticate(authorization)
        if job_id not in registry:
            raise HTTPException(404, "Job not found")
        try:
            return modal.FunctionCall.from_id(job_id).get(timeout=0)
        except TimeoutError:
            return {"status": "rendering"}
        except Exception:
            return {"status": "error"}
    return web
