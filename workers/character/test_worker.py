"""CPU-only tests: real validation/image decoding, mocked GPU and web framework."""
import base64
import contextlib
import io
import os
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent))
from PIL import Image
from pydantic import ValidationError
from inference import QwenEngine, authenticate, validate_payload


class HTTPException(Exception):
    def __init__(self, status_code, detail):
        self.status_code, self.detail = status_code, detail


class WorkerTests(unittest.TestCase):
    def setUp(self):
        output = io.BytesIO()
        Image.new("RGB", (24, 32), "blue").save(output, format="PNG")
        self.image = {"mimeType": "image/png", "data": base64.b64encode(output.getvalue()).decode()}
        self.payload = {"prompt": "A character in the approved outfit.", "images": [self.image], "seed": 42}

    def test_payload_limits(self):
        self.assertEqual(validate_payload(self.payload)["seed"], 42)
        for extra in [{"images": []}, {"images": [self.image] * 7}, {"seed": -1}, {"prompt": ""}]:
            with self.assertRaises(ValidationError):
                validate_payload({**self.payload, **extra})

    def test_authentication_fails_closed(self):
        fake = types.SimpleNamespace(HTTPException=HTTPException)
        with patch.dict(sys.modules, {"fastapi": fake}), patch.dict(os.environ, {"STUDIO_QWEN_TOKEN": "x" * 40}):
            authenticate("Bearer " + "x" * 40)
            for value in [None, "Bearer wrong"]:
                with self.assertRaises(HTTPException) as error:
                    authenticate(value)
                self.assertEqual(error.exception.status_code, 401)
        with patch.dict(sys.modules, {"fastapi": fake}), patch.dict(os.environ, {"STUDIO_QWEN_TOKEN": "short"}):
            with self.assertRaises(HTTPException) as error:
                authenticate("Bearer short")
            self.assertEqual(error.exception.status_code, 503)

    def test_real_image_decoding_and_gpu_call_contract(self):
        engine = QwenEngine.__new__(QwenEngine)
        output = Image.new("RGB", (32, 24), "green")
        engine.pipeline = MagicMock(return_value=types.SimpleNamespace(images=[output]))
        generator = MagicMock()
        fake_torch = types.SimpleNamespace(inference_mode=contextlib.nullcontext, Generator=lambda **_: generator)
        with patch.dict(sys.modules, {"torch": fake_torch}):
            result = engine.generate(self.payload)
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["mimeType"], "image/png")
        actual = Image.open(io.BytesIO(base64.b64decode(result["data"])))
        self.assertEqual(actual.size, (32, 24))
        args = engine.pipeline.call_args.kwargs
        self.assertEqual(args["image"][0].size, (24, 32))
        self.assertEqual(args["num_inference_steps"], 40)
        self.assertEqual(args["width"], 1024)
        generator.manual_seed.assert_called_once_with(42)

    def test_invalid_reference_bytes_rejected_before_gpu(self):
        engine = QwenEngine.__new__(QwenEngine)
        engine.pipeline = MagicMock()
        fake_torch = types.SimpleNamespace()
        with patch.dict(sys.modules, {"torch": fake_torch}), self.assertRaises(Exception):
            engine.generate({**self.payload, "images": [{"mimeType": "image/png", "data": "!" * 64}]})
        engine.pipeline.assert_not_called()


if __name__ == "__main__":
    unittest.main()
