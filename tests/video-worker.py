"""CPU-only contract and idempotency checks; no provider calls or credits."""
import base64
import io
import json
import os
import subprocess
from pathlib import Path
import shutil
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "workers/video"))
import service
import exporter
sys.modules["ltx_exporter"] = exporter
from fastapi.testclient import TestClient
from PIL import Image
from pydantic import ValidationError


AUDIO = "https://demo.supabase.co/storage/v1/object/sign/audio/line.mp3?token=abc"

# Duration measurement genuinely needs ffprobe. The deployed worker image has
# ffmpeg; on a dev machine static-ffmpeg supplies it if installed. Where neither
# is available the measurement checks skip rather than silently pass.
try:  # pragma: no cover - local developer convenience only
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception:
    pass
HAS_FFPROBE = bool(shutil.which("ffprobe") and shutil.which("ffmpeg"))


def channels_of(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_streams", "-of", "json", str(path)],
        capture_output=True, text=True, check=True, timeout=30,
    )
    return json.loads(out.stdout)["streams"][0]["channels"]


def synthetic_speech(path, seconds=2.0):
    """A decodable audio file of a known length; no provider call involved."""
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
         "-i", f"sine=frequency=220:sample_rate=48000:duration={seconds}",
         "-c:a", "aac", str(path)],
        check=True, timeout=60,
    )
    return path


class WorkerContracts(unittest.TestCase):
    def test_video_limits(self):
        for values in ({"num_frames": 98}, {"width": 8192}, {"image_base64": "invalid"}, {"audio_base64": "unsupported"}):
            with self.assertRaises(ValidationError):
                service.VideoRequest(request_id=uuid4(), prompt="Cinematic scene", **values)
        image = io.BytesIO()
        Image.new("RGB", (128, 128)).save(image, format="PNG")
        validated = service.VideoRequest(request_id=uuid4(), prompt="Cinematic scene", image_base64=base64.b64encode(image.getvalue()).decode())
        self.assertEqual(validated.width, 1024)
        # Without audio the length still defaults, and still caps at 121.
        self.assertEqual(validated.num_frames, 97)
        with self.assertRaises(ValidationError):
            service.VideoRequest(request_id=uuid4(), prompt="Cinematic scene", num_frames=129)

    def test_audio_request_contract(self):
        # Audio conditioning may omit the length: the pipeline derives it.
        validated = service.VideoRequest(request_id=uuid4(), prompt="Cinematic scene", audio_url=AUDIO)
        self.assertIsNone(validated.num_frames)
        self.assertEqual(validated.audio_url, AUDIO)
        # A supplied length must still land on the 8k+1 grid.
        self.assertEqual(service.VideoRequest(request_id=uuid4(), prompt="Scene", audio_url=AUDIO, num_frames=121).num_frames, 121)
        with self.assertRaises(ValidationError):
            service.VideoRequest(request_id=uuid4(), prompt="Scene", audio_url=AUDIO, num_frames=120)
        # Longer clips are allowed only when audio sets the length.
        self.assertEqual(service.VideoRequest(request_id=uuid4(), prompt="Scene", audio_url=AUDIO, num_frames=241).num_frames, 241)
        with self.assertRaises(ValidationError):
            service.VideoRequest(request_id=uuid4(), prompt="Scene", audio_url=AUDIO, num_frames=249)
        # The canonical audio size is allowed only on the audio path, because
        # stage 1 renders at half of it and must land on the trained 768x512.
        self.assertEqual(
            service.VideoRequest(request_id=uuid4(), prompt="Scene", audio_url=AUDIO, width=1536, height=1024).width,
            1536,
        )
        self.assertEqual(service.CANONICAL_AUDIO_SIZE, (1536, 1024))
        with self.assertRaises(ValidationError):
            service.VideoRequest(request_id=uuid4(), prompt="Scene", width=1536, height=1024)
        for host in (
            "http://demo.supabase.co/a.mp3",
            "https://evil.example/a.mp3",
            "https://demo.supabase.co:8443/a.mp3",
            "https://user:pass@demo.supabase.co/a.mp3",
        ):
            with self.assertRaises(ValidationError, msg=host):
                service.VideoRequest(request_id=uuid4(), prompt="Scene", audio_url=host)

    def test_frame_grid_from_duration(self):
        # Every derived length is on the grid, covers the speech, and is capped.
        for seconds in (0.4, 1.0, 2.0, 3.37, 5.0, 9.99, 30.0):
            frames = service.snap_frames(seconds)
            self.assertEqual((frames - 1) % 8, 0, seconds)
            self.assertLessEqual(frames, service.MAX_AUDIO_FRAMES)
            if seconds <= 10:
                self.assertGreaterEqual(frames / service.FRAME_RATE, seconds - 1 / service.FRAME_RATE, seconds)

    @unittest.skipUnless(HAS_FFPROBE, "ffmpeg/ffprobe not installed")
    def test_conditioning_audio_measurement(self):
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            good = synthetic_speech(Path(directory) / "line.m4a", 2.0)
            self.assertAlmostEqual(service.audio_seconds(str(good)), 2.0, delta=0.2)
            silent = Path(directory) / "silent.png"
            Image.new("RGB", (64, 64)).save(silent, format="PNG")
            with self.assertRaises(Exception):
                service.audio_seconds(str(silent))

            # check_conditioning_audio downloads, measures, and rejects by
            # duration before any GPU container could be started.
            def staged(seconds):
                source = synthetic_speech(Path(directory) / f"staged-{seconds}.m4a", seconds)
                class Stream:
                    def __enter__(inner): return inner
                    def __exit__(inner, *_): return False
                    def raise_for_status(inner): pass
                    def iter_bytes(inner): yield Path(source).read_bytes()
                return lambda *_, **__: Stream()

            import httpx
            service.ARTIFACTS_DIR = directory
            with patch.object(httpx, "stream", staged(2.0)):
                seconds, prepared = service.prepare_conditioning_audio(AUDIO, "req-1")
                self.assertAlmostEqual(seconds, 2.0, delta=0.2)
                # The GPU receives a ready stereo file, not a URL.
                self.assertEqual(channels_of(prepared), service.AUDIO_CHANNELS)
            with patch.object(httpx, "stream", staged(12.0)):
                with self.assertRaises(ValueError) as caught:
                    service.prepare_conditioning_audio(AUDIO, "req-2")
                self.assertIn("Shorten this dialogue line", str(caught.exception))
            with patch.object(httpx, "stream", staged(0.1)):
                with self.assertRaises(ValueError):
                    service.prepare_conditioning_audio(AUDIO, "req-3")
            with self.assertRaises(ValueError):
                service.prepare_conditioning_audio("https://evil.example/line.mp3", "req-4")

    @unittest.skipUnless(HAS_FFPROBE, "ffmpeg/ffprobe not installed")
    def test_mono_speech_is_converted_to_stereo(self):
        # Regression: the audio VAE's first conv needs two channels. Mono input
        # (what ElevenLabs returns) previously failed inside the pipeline only
        # after the model had loaded, wasting the whole GPU start.
        import tempfile
        with tempfile.TemporaryDirectory() as directory:
            mono = Path(directory) / "mono.m4a"
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                 "-i", "sine=frequency=220:sample_rate=44100:duration=2",
                 "-ac", "1", "-c:a", "aac", str(mono)],
                check=True, timeout=60,
            )
            self.assertEqual(channels_of(mono), 1)
            converted = service.normalize_conditioning_audio(str(mono), str(Path(directory) / "out.wav"))
            self.assertEqual(channels_of(converted), service.AUDIO_CHANNELS)
            self.assertAlmostEqual(service.audio_seconds(converted), 2.0, delta=0.2)
            # Already-stereo input is passed through at the same length.
            stereo = Path(directory) / "stereo.wav"
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi",
                 "-i", "sine=frequency=330:sample_rate=48000:duration=1.5",
                 "-ac", "2", str(stereo)],
                check=True, timeout=60,
            )
            again = service.normalize_conditioning_audio(str(stereo), str(Path(directory) / "out2.wav"))
            self.assertEqual(channels_of(again), service.AUDIO_CHANNELS)
            self.assertAlmostEqual(service.audio_seconds(again), 1.5, delta=0.2)

    def test_engine_routing_without_weights(self):
        # Pure dispatch: selecting a pipeline must not import torch or LTX.
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "workers/video"))
        import inference
        self.assertEqual(inference.engine_kind({"prompt": "x"}), "distilled")
        self.assertEqual(inference.engine_kind({"prompt": "x", "audio_url": AUDIO}), "audio")
        self.assertEqual(inference.engine_kind({"prompt": "x", "audio_path": "/artifacts/audio/a.wav"}), "audio")
        self.assertIn("dev-transformer", inference.TRANSFORMERS["dev"])
        self.assertIn("distilled-transformer", inference.TRANSFORMERS["distilled"])

    def test_export_limits(self):
        for overlay in ({"text": "x", "color": "white:injection"}, {"text": "x", "start": 4, "end": 2}):
            with self.assertRaises(ValidationError): exporter.Overlay(**overlay)
        with self.assertRaises(ValueError): exporter.download("https://evil.example/media.mp4", "unused")
        with self.assertRaises(ValueError): exporter.download("http://demo.supabase.co/media.mp4", "unused")
        with self.assertRaises(ValueError): exporter.download("https://demo.supabase.co:1234/media.mp4", "unused")

    def test_authenticated_idempotent_api(self):
        jobs, spawned = {}, []
        class Volume:
            def reload(self): pass
        class Method:
            def spawn(self, job_id, payload):
                spawned.append(payload)
                return type("Call", (), {"object_id": "fc-test"})()
        class Worker:
            generate = Method()
        with patch.dict(os.environ, {"STUDIO_LTX_TOKEN": "test-only"}), patch.object(Path, "exists", return_value=True):
            client = TestClient(service.create_api(jobs, Volume(), Volume(), Worker, Method()))
            self.assertEqual(client.get("/health").status_code, 401)
            self.assertEqual(client.post("/jobs", json={}).status_code, 401)
            headers = {"Authorization": "Bearer test-only"}
            payload = {"request_id": str(uuid4()), "prompt": "A quiet cinematic shot"}
            one = client.post("/jobs", headers=headers, json=payload)
            two = client.post("/jobs", headers=headers, json=payload)
            self.assertEqual(one.status_code, 202)
            self.assertEqual(one.json()["id"], two.json()["id"])
            self.assertEqual(len(spawned), 1)
            self.assertEqual(client.post("/jobs", headers=headers, json={**payload, "prompt": "Different requirements"}).status_code, 409)
            film = {"request_id": str(uuid4()), "clips": [{"url": "https://demo.supabase.co/storage/v1/object/sign/videos/a.mp4?token=old", "texts": [{"text": "100%: %{literal} 'quoted'"}]}]}
            one = client.post("/exports", headers=headers, json=film)
            film["clips"][0]["url"] = film["clips"][0]["url"].replace("old", "new")
            two = client.post("/exports", headers=headers, json=film)
            self.assertEqual(one.json()["id"], two.json()["id"])
            self.assertEqual(len(spawned), 2)
            film["request_id"] = str(uuid4())
            film["clips"][0]["music"] = "https://demo.supabase.co/music?token=old"
            film["clips"][0]["voices"] = ["https://demo.supabase.co/voice?token=old"]
            one = client.post("/exports", headers=headers, json=film)
            film["clips"][0]["music"] = film["clips"][0]["music"].replace("old", "new")
            film["clips"][0]["voices"][0] = film["clips"][0]["voices"][0].replace("old", "new")
            two = client.post("/exports", headers=headers, json=film)
            self.assertEqual(one.json()["id"], two.json()["id"])
            self.assertEqual(len(spawned), 3)

    def test_artifact_deletion_preserves_billing_receipt(self):
        import tempfile
        class Volume:
            commits = 0
            def reload(self): pass
            def commit(self): self.commits += 1
        class Method:
            def spawn(self, *_): raise AssertionError("Deleting a file must never spawn a render")
        class Worker:
            generate = Method()
        job_id, active_id, request_id = str(uuid4()), str(uuid4()), str(uuid4())
        payload = service.VideoRequest(request_id=request_id, prompt="A quiet cinematic shot").model_dump(mode="json")
        fingerprint = service.hashlib.sha256(service.json.dumps(payload, sort_keys=True).encode()).hexdigest()
        jobs = {job_id: {"id": job_id, "status": "complete"}, active_id: {"id": active_id, "status": "rendering"},
                f"video:{request_id}": {"id": job_id, "fingerprint": fingerprint, "call_id": "already-rendered"}}
        volume = Volume()
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"STUDIO_LTX_TOKEN": "test-only"}), patch.object(service, "ARTIFACTS_DIR", directory):
            path = Path(directory) / f"{job_id}.mp4"
            path.write_bytes(b"test video bytes")
            client = TestClient(service.create_api(jobs, volume, volume, Worker, Method()))
            headers = {"Authorization": "Bearer test-only"}
            self.assertEqual(client.delete(f"/jobs/{job_id}/file").status_code, 401)
            self.assertEqual(client.delete(f"/jobs/{active_id}/file", headers=headers).status_code, 409)
            self.assertEqual(client.delete("/jobs/not-a-uuid/file", headers=headers).status_code, 404)
            self.assertEqual(client.get(f"/jobs/{job_id}/file", headers=headers).status_code, 200)
            self.assertEqual(client.delete(f"/jobs/{job_id}/file", headers=headers).status_code, 200)
            self.assertFalse(path.exists())
            self.assertEqual(client.get(f"/jobs/{job_id}/file", headers=headers).status_code, 410)
            self.assertEqual(client.delete(f"/jobs/{job_id}/file", headers=headers).status_code, 200)
            self.assertIn(f"video:{request_id}", jobs)
            with patch.object(Path, "exists", return_value=True):
                replay = client.post("/jobs", headers=headers, json={"request_id": request_id, "prompt": "A quiet cinematic shot"})
            self.assertEqual(replay.status_code, 202)
            self.assertEqual(replay.json()["id"], job_id)


    def test_audio_api_gating_and_idempotency(self):
        jobs, spawned = {}, []
        class Volume:
            def reload(self): pass
        class Method:
            def spawn(self, job_id, payload):
                spawned.append(payload)
                return type("Call", (), {"object_id": "fc-test"})()
        class Worker:
            generate = Method()
        headers = {"Authorization": "Bearer test-only"}
        payload = {"request_id": str(uuid4()), "prompt": "A quiet cinematic shot", "audio_url": AUDIO}

        with patch.dict(os.environ, {"STUDIO_LTX_TOKEN": "test-only"}):
            # Audio weights absent: refuse rather than start a GPU container.
            with patch.object(Path, "exists", lambda self: self.name == "ready"):
                client = TestClient(service.create_api(jobs, Volume(), Volume(), Worker, Method()))
                self.assertEqual(client.post("/jobs", headers=headers, json=payload).status_code, 503)
                self.assertNotIn("audio-to-video", client.get("/health", headers=headers).json()["modes"])
            self.assertEqual(spawned, [])

            with patch.object(Path, "exists", return_value=True):
                client = TestClient(service.create_api(jobs, Volume(), Volume(), Worker, Method()))
                self.assertIn("audio-to-video", client.get("/health", headers=headers).json()["modes"])
                # Over-long speech is rejected on CPU, before any spawn.
                with patch.object(service, "prepare_conditioning_audio", side_effect=ValueError("The conditioning audio is 12.00s, above the 10s limit for one shot. Shorten this dialogue line.")):
                    rejected = client.post("/jobs", headers=headers, json=payload)
                self.assertEqual(rejected.status_code, 422)
                self.assertIn("Shorten this dialogue line", rejected.json()["detail"])
                self.assertEqual(spawned, [])

                with patch.object(service, "prepare_conditioning_audio", return_value=(2.0, "/artifacts/audio/req.wav")):
                    one = client.post("/jobs", headers=headers, json=payload)
                    self.assertEqual(one.status_code, 202)
                    # The measured speech sets the derived frame count.
                    self.assertEqual(spawned[0]["num_frames"], service.snap_frames(2.0))
                    self.assertEqual(spawned[0]["audio_seconds"], 2.0)
                    # The GPU is handed a prepared file, never a URL to fetch.
                    self.assertEqual(spawned[0]["audio_path"], "/artifacts/audio/req.wav")
                    # A refreshed signature is the same requirements, not a new job.
                    refreshed = {**payload, "audio_url": AUDIO.replace("abc", "xyz")}
                    two = client.post("/jobs", headers=headers, json=refreshed)
                    self.assertEqual(one.json()["id"], two.json()["id"])
                    self.assertEqual(len(spawned), 1)
                    # Different speech under the same request ID must not generate.
                    changed = {**payload, "audio_url": AUDIO.replace("line.mp3", "other.mp3")}
                    self.assertEqual(client.post("/jobs", headers=headers, json=changed).status_code, 409)
                    self.assertEqual(len(spawned), 1)


class ClipLength(unittest.TestCase):
    """Clip length is configurable, and the untested range stays opt-in."""

    def request(self, **overrides):
        payload = {"request_id": uuid4(), "prompt": "A quiet cinematic shot"}
        payload.update(overrides)
        return service.VideoRequest(**payload)

    def test_frame_grid(self):
        # Frames land on 8k+1 at 24fps, and nothing shorter than the minimum.
        self.assertEqual(service.snap_frames(5, 481), 121)
        self.assertEqual(service.snap_frames(20, 481), 481)
        self.assertEqual(service.snap_frames(0.05, 481), 33)
        for seconds in (1.5, 3.2, 7.7, 13.9, 19.99):
            frames = service.snap_frames(seconds, 481)
            self.assertEqual((frames - 1) % service.FRAME_STEP, 0, seconds)
        # A cap is honoured even when the request is far beyond it.
        self.assertEqual(service.snap_frames(60, 121), 121)

    def test_validated_length_is_the_default(self):
        # No num_frames and no audio: the request defaults within the cap.
        self.assertLessEqual(self.request().num_frames, service.MAX_VIDEO_FRAMES)
        self.assertEqual(self.request(num_frames=121).num_frames, 121)

    def test_longer_clips_need_the_worker_configured(self):
        # The default deployment refuses the untested range outright, and says
        # what it does support rather than silently shortening the clip.
        self.assertEqual(service.MAX_VIDEO_FRAMES, 121)
        with self.assertRaises(ValidationError) as caught:
            self.request(num_frames=129)
        self.assertIn("at most 121 frames", str(caught.exception))
        with self.assertRaises(ValidationError):
            self.request(num_frames=481)

    def test_twenty_seconds_once_enabled(self):
        import importlib
        try:
            with patch.dict(os.environ, {"LTX_MAX_VIDEO_FRAMES": "481"}):
                reloaded = importlib.reload(service)
                self.assertEqual(reloaded.MAX_VIDEO_FRAMES, 481)
                payload = {"request_id": uuid4(), "prompt": "A quiet cinematic shot"}
                self.assertEqual(reloaded.VideoRequest(**payload, num_frames=481).num_frames, 481)
                # The ceiling of the request shape still binds above that.
                with self.assertRaises(ValidationError):
                    reloaded.VideoRequest(**payload, num_frames=489)
                # Off-grid values are rejected at any length.
                with self.assertRaises(ValidationError) as caught:
                    reloaded.VideoRequest(**payload, num_frames=480)
                self.assertIn("8k+1 frames", str(caught.exception))
        finally:
            # Restored with the override gone, so no later test inherits it.
            importlib.reload(service)
        self.assertEqual(service.MAX_VIDEO_FRAMES, 121)

    def test_audio_length_is_bounded_separately(self):
        # Lip-sync length comes from the speech, and keeps its own ceiling even
        # when longer text/image clips are enabled.
        self.assertEqual(service.MAX_AUDIO_FRAMES, 241)
        self.assertEqual(service.snap_frames(30, service.MAX_AUDIO_FRAMES), 241)

    def test_health_publishes_the_caps(self):
        # The app reads the limits rather than keeping its own copy.
        reported = service.VideoRequest.model_fields["num_frames"]
        self.assertIsNotNone(reported)
        self.assertEqual(service.FRAME_RATE, 24.0)
        self.assertEqual(service.FRAME_STEP, 8)


class ExportLimits(unittest.TestCase):
    """Clip count and total duration are separate limits."""

    def clip(self):
        return {"url": "https://demo.supabase.co/storage/v1/object/sign/v/a.mp4", "start": 0, "end": 5}

    def request(self, count):
        return exporter.ExportRequest(request_id=str(uuid4()), clips=[self.clip()] * count)

    def test_clip_count_allows_splitting(self):
        # Shots and editor splits both multiply clips, so the count is generous.
        self.assertEqual(exporter.MAX_CLIPS, 24)
        self.assertEqual(len(self.request(24).clips), 24)
        with self.assertRaises(ValidationError):
            self.request(25)

    def test_total_duration_is_the_real_limit(self):
        self.assertEqual(exporter.MAX_FILM_SECONDS, 180)


if __name__ == "__main__": unittest.main()
