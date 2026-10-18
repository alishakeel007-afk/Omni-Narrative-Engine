"""Shared local/Modal Qwen inference. Imports GPU libraries only when loading."""
import base64
import io
import os
import secrets


def authenticate(authorization: str | None):
    from fastapi import HTTPException
    token = os.environ.get("STUDIO_QWEN_TOKEN", "")
    if not token or len(token) < 32:
        raise HTTPException(503, "Configure a worker token of at least 32 characters")
    if not secrets.compare_digest(authorization or "", f"Bearer {token}"):
        raise HTTPException(401, "Unauthorized")


def validate_payload(payload):
    from pydantic import BaseModel, Field
    class ImageInput(BaseModel):
        mimeType: str = Field(pattern=r"^image/(png|jpeg|webp)$")
        data: str = Field(min_length=32, max_length=5_600_000)
    class Job(BaseModel):
        prompt: str = Field(min_length=1, max_length=60_000)
        images: list[ImageInput] = Field(min_length=1, max_length=6)
        seed: int = Field(ge=0, le=4_294_967_295)
    return Job.model_validate(payload).model_dump()


class QwenEngine:
    def __init__(self):
        import torch
        from diffusers import QwenImageEditPlusPipeline
        if not torch.cuda.is_available():
            raise RuntimeError("Qwen inference requires a capable NVIDIA CUDA GPU")
        self.pipeline = QwenImageEditPlusPipeline.from_pretrained(
            "Qwen/Qwen-Image-Edit-2511", torch_dtype=torch.bfloat16,
            cache_dir=os.environ.get("HF_HOME"), use_safetensors=True,
        ).to("cuda")
        self.pipeline.set_progress_bar_config(disable=True)
        self.pipeline.vae.enable_tiling()
        # Optional operator-supplied, trained LoRA. Never accepts paths from chat.
        if os.environ.get("STUDIO_QWEN_LORA_REPO"):
            self.pipeline.load_lora_weights(
                os.environ["STUDIO_QWEN_LORA_REPO"],
                weight_name=os.environ.get("STUDIO_QWEN_LORA_WEIGHTS", "pytorch_lora_weights.safetensors"),
                use_safetensors=True,
            )

    def generate(self, payload):
        import torch
        from PIL import Image, ImageOps
        payload = validate_payload(payload)
        images = []
        for item in payload["images"]:
            image = Image.open(io.BytesIO(base64.b64decode(item["data"], validate=True)))
            if image.width * image.height > 24_000_000:
                raise ValueError("Reference image dimensions are too large")
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((1024, 1024))
            images.append(image)
        with torch.inference_mode():
            output = self.pipeline(
                image=images, prompt=payload["prompt"],
                generator=torch.Generator(device="cuda").manual_seed(payload["seed"]),
                num_inference_steps=40, true_cfg_scale=4.0,
                guidance_scale=1.0, negative_prompt=" ",
                num_images_per_prompt=1, width=1024, height=576,
            ).images[0]
        buffer = io.BytesIO()
        output.save(buffer, format="PNG")
        return {"status": "complete", "mimeType": "image/png", "data": base64.b64encode(buffer.getvalue()).decode("ascii")}
