"""Run: uvicorn local:app --host 127.0.0.1 --port 8001 (from this folder)."""
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from fastapi import FastAPI, Header, HTTPException
from pydantic import ValidationError
from inference import QwenEngine, authenticate, validate_payload

app = FastAPI(docs_url=None, redoc_url=None)
executor = ThreadPoolExecutor(max_workers=1)
jobs = {}
guard = Lock()
engine = None

def generate(payload):
    global engine
    if engine is None:
        engine = QwenEngine()
    return engine.generate(payload)

@app.post("/jobs")
def submit(payload: dict, authorization: str | None = Header(default=None)):
    authenticate(authorization)
    try:
        payload = validate_payload(payload)
    except ValidationError:
        raise HTTPException(422, "Invalid image request") from None
    with guard:
        for key, (future, created) in list(jobs.items()):
            if future.done() and time.time() - created > 3600:
                del jobs[key]
        if sum(not future.done() for future, _ in jobs.values()) >= 8:
            raise HTTPException(429, "The local GPU queue is full")
        job_id = str(uuid.uuid4())
        jobs[job_id] = (executor.submit(generate, payload), time.time())
    return {"id": job_id}

@app.get("/jobs/{job_id}")
def result(job_id: str, authorization: str | None = Header(default=None)):
    authenticate(authorization)
    with guard:
        item = jobs.get(job_id)
    if item is None:
        raise HTTPException(404, "Job expired or worker restarted")
    future = item[0]
    if not future.done():
        return {"status": "rendering" if future.running() else "queued"}
    try:
        return future.result()
    except Exception:
        return {"status": "error"}
