"""Pinned native LTX-2.5 distilled pipeline, including native audio decode."""
from pathlib import Path
import base64
import tempfile


class Engine:
    def __init__(self, model_dir: str):
        import torch
        from ltx_pipelines.distilled import DistilledPipeline
        from ltx_pipelines.utils.model_paths import ModelPaths
        from ltx_pipelines.utils.types import OffloadMode
        root = Path(model_dir)
        self.torch = torch
        self.pipeline = DistilledPipeline(
            model_paths=ModelPaths.from_split(
                transformer_path=str(root / "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors"),
                text_encoder_path=str(root / "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors"),
                video_vae_path=str(root / "vae/ltx-2.5-video-vae-conv-bf16.safetensors"),
                audio_vae_path=str(root / "vae/ltx-2.5-audio-vae-bf16.safetensors"),
            ),
            spatial_upsampler_path=str(root / "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"),
            loras=[], offload_mode=OffloadMode.CPU,
        )

    def generate(self, payload: dict, output: str):
        from PIL import Image, ImageOps
        from ltx_pipelines.utils.media_io import encode_video
        from ltx_core.model.video_vae import get_video_chunks_number
        from ltx_pipelines.utils.types import ImageConditioningInput
        with tempfile.TemporaryDirectory(prefix="ltx-") as directory:
            images = []
            if payload.get("image_base64"):
                path = Path(directory) / "reference.png"
                path.write_bytes(base64.b64decode(payload["image_base64"], validate=True))
                with Image.open(path) as image:
                    ImageOps.exif_transpose(image).convert("RGB").save(path)
                images = [ImageConditioningInput(str(path), 0, 1.0)]
            with self.torch.inference_mode():
                result = self.pipeline(
                    prompt=payload["prompt"], seed=payload["seed"],
                    width=payload["width"], height=payload["height"],
                    frame_rate=24.0, num_frames=payload["num_frames"], images=images,
                    enhance_prompt=False,
                )
                encode_video(video=result.video, audio=result.audio, fps=24.0,
                             output_path=output,
                             video_chunks_number=get_video_chunks_number(result.num_frames, result.tiling_config))
        self.torch.cuda.empty_cache()
