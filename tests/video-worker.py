"""CPU-only contract and idempotency checks; no provider calls or credits."""
import base64
import io
import os
from pathlib import Path
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


class WorkerContracts(unittest.TestCase):
    def test_video_limits(self):
        for values in ({"num_frames": 98}, {"width": 8192}, {"image_base64": "invalid"}, {"audio_base64": "unsupported"}):
            with self.assertRaises(ValidationError):
                service.VideoRequest(request_id=uuid4(), prompt="Cinematic scene", **values)
        image = io.BytesIO()
        Image.new("RGB", (128, 128)).save(image, format="PNG")
        validated = service.VideoRequest(request_id=uuid4(), prompt="Cinematic scene", image_base64=base64.b64encode(image.getvalue()).decode())
        self.assertEqual(validated.width, 1024)

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


if __name__ == "__main__": unittest.main()
