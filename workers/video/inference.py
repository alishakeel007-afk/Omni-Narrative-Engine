"""Pinned native LTX-2.5 pipelines: distilled text/image-to-video, and
audio-conditioned (lip-synced) video via A2VidPipelineTwoStage.

Only one pipeline is resident at a time. The audio pipeline builds two
DiffusionStage instances from the same 22B transformer, so holding it alongside
the distilled pipeline would not fit the container.
"""
from pathlib import Path
import base64
import os
import tempfile

FRAME_RATE = 24.0

TRANSFORMERS = {
    "distilled": "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors",
    "dev": "diffusion_models/ltx-2.5-22b-dev-transformer-bf16.safetensors",
}
DISTILLED_LORA = "loras/ltx-2.5-22b-distilled-lora-450-bf16.safetensors"
TEXT_ENCODER = "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors"
VIDEO_VAE = "vae/ltx-2.5-video-vae-conv-bf16.safetensors"
AUDIO_VAE = "vae/ltx-2.5-audio-vae-bf16.safetensors"
SPATIAL_UPSCALER = "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors"


def _number(name: str, fallback: float) -> float:
    value = os.getenv(name)
    return float(value) if value else fallback


def _guider_params():
    """
    Guidance settings for the audio-conditioned stages.

    Upstream resolves these from the checkpoint version via resolve_cli_params.
    These fallbacks match the documented LTX-2.3/2.4 presets and every value is
    overridable, so the live spike can be retuned without a code change.
    """
    from ltx_core.components.guiders import MultiModalGuiderParams
    blocks = os.getenv("LTX_A2V_STG_BLOCKS", "28").strip()
    return MultiModalGuiderParams(
        cfg_scale=_number("LTX_A2V_CFG_SCALE", 3.0),
        stg_scale=_number("LTX_A2V_STG_SCALE", 1.0),
        rescale_scale=_number("LTX_A2V_RESCALE_SCALE", 0.7),
        modality_scale=_number("LTX_A2V_MODALITY_SCALE", 3.0),
        skip_step=int(_number("LTX_A2V_SKIP_STEP", 0)),
        stg_blocks=[int(item) for item in blocks.split(",") if item.strip()],
    )


def _model_paths(model_dir: str, transformer: str):
    from ltx_pipelines.utils.model_paths import ModelPaths
    root = Path(model_dir)
    return ModelPaths.from_split(
        transformer_path=str(root / TRANSFORMERS[transformer]),
        text_encoder_path=str(root / TEXT_ENCODER),
        video_vae_path=str(root / VIDEO_VAE),
        audio_vae_path=str(root / AUDIO_VAE),
    )


def _reference_images(payload: dict, directory: str):
    """Writes the optional conditioning image and returns pipeline inputs."""
    if not payload.get("image_base64"):
        return []
    from PIL import Image, ImageOps
    from ltx_pipelines.utils.types import ImageConditioningInput
    path = Path(directory) / "reference.png"
    path.write_bytes(base64.b64decode(payload["image_base64"], validate=True))
    with Image.open(path) as image:
        ImageOps.exif_transpose(image).convert("RGB").save(path)
    return [ImageConditioningInput(str(path), 0, 1.0)]


def _conditioning_audio(payload: dict) -> str:
    """
    The CPU API already downloaded, measured, validated and converted the speech
    to the stereo PCM the audio VAE needs, leaving it on the shared volume. The
    GPU only reads it, so no fetch or transcode happens on billed GPU time.
    """
    from ltx_service import AUDIO_CHANNELS, audio_shape
    path = payload.get("audio_path")
    if not path:
        raise ValueError("No prepared conditioning audio was supplied for this job.")
    if not Path(path).is_file():
        raise ValueError("The prepared conditioning audio is no longer on the volume.")
    channels, _ = audio_shape(path)
    if channels != AUDIO_CHANNELS:
        raise ValueError("The prepared conditioning audio is not stereo.")
    return path


class DistilledEngine:
    kind = "distilled"

    def __init__(self, model_dir: str):
        import torch
        from ltx_pipelines.distilled import DistilledPipeline
        from ltx_pipelines.utils.types import OffloadMode
        self.torch = torch
        self.pipeline = DistilledPipeline(
            model_paths=_model_paths(model_dir, "distilled"),
            spatial_upsampler_path=str(Path(model_dir) / SPATIAL_UPSCALER),
            loras=[], offload_mode=OffloadMode.CPU,
        )

    def generate(self, payload: dict, output: str):
        from ltx_pipelines.utils.media_io import encode_video
        from ltx_core.model.video_vae import get_video_chunks_number
        with tempfile.TemporaryDirectory(prefix="ltx-") as directory:
            images = _reference_images(payload, directory)
            with self.torch.inference_mode():
                result = self.pipeline(
                    prompt=payload["prompt"], seed=payload["seed"],
                    width=payload["width"], height=payload["height"],
                    frame_rate=FRAME_RATE, num_frames=payload["num_frames"], images=images,
                    enhance_prompt=False,
                )
                encode_video(video=result.video, audio=result.audio, fps=FRAME_RATE,
                             output_path=output,
                             video_chunks_number=get_video_chunks_number(result.num_frames, result.tiling_config))


class AudioEngine:
    """
    Audio-conditioned generation. The supplied speech is frozen conditioning, so
    the model animates to it rather than regenerating it, and the clip length is
    derived from the audio by the pipeline itself.
    """
    kind = "audio"

    def __init__(self, model_dir: str):
        import torch
        from ltx_pipelines.a2vid_two_stage import A2VidPipelineTwoStage
        from ltx_core.loader import LTXV_LORA_COMFY_RENAMING_MAP, LoraPathStrengthAndSDOps
        from ltx_core.loader.registry import ModelRegistry
        from ltx_pipelines.utils.types import OffloadMode
        root = Path(model_dir)
        self.torch = torch
        self.steps = int(_number("LTX_A2V_STEPS", 30))
        # Upstream's own negative prompt, so this is not an extra variable when
        # comparing our run against the reference configuration.
        from ltx_pipelines.utils.constants import DEFAULT_NEGATIVE_PROMPT
        self.negative_prompt = os.getenv("LTX_A2V_NEGATIVE_PROMPT") or DEFAULT_NEGATIVE_PROMPT
        # Both stages load the same transformer and differ only by the distilled
        # LoRA. A shared registry is what lets them reuse one cached state dict.
        self.pipeline = A2VidPipelineTwoStage(
            model_paths=_model_paths(model_dir, "dev"),
            # sd_ops must be the Comfy key-renaming map upstream's own CLI uses.
            # An empty tuple is not None, so the registry tries tuple.name on it.
            distilled_lora=[
                LoraPathStrengthAndSDOps(
                    str(root / DISTILLED_LORA),
                    _number("LTX_A2V_LORA_STRENGTH", 1.0),
                    LTXV_LORA_COMFY_RENAMING_MAP,
                )
            ],
            spatial_upsampler_path=str(root / SPATIAL_UPSCALER),
            loras=[],
            registry=ModelRegistry(),
            offload_mode=OffloadMode.CPU,
        )

    def _stage_2_override(self):
        """
        Diagnostic: LTX_A2V_SKIP_STAGE2=1 hands stage 2 a single-sigma schedule.
        A schedule of length 1 describes zero denoising steps, so the output is
        the upsampled stage-1 result and we can see which stage produced noise.
        Chunks are lazy iterators, so intercepting the intermediate tensor
        directly would consume the stream the pipeline still needs.
        """
        if os.getenv("LTX_A2V_SKIP_STAGE2") != "1":
            return {}
        return {"stage_2_sigmas": self.torch.tensor([0.0])}

    def generate(self, payload: dict, output: str):
        from ltx_pipelines.utils.media_io import encode_video
        from ltx_core.model.video_vae import get_video_chunks_number
        with tempfile.TemporaryDirectory(prefix="ltx-a2v-") as directory:
            images = _reference_images(payload, directory)
            audio_path = _conditioning_audio(payload)
            with self.torch.inference_mode():
                result = self.pipeline(
                    prompt=payload["prompt"],
                    negative_prompt=self.negative_prompt,
                    seed=payload["seed"],
                    width=payload["width"], height=payload["height"],
                    # None lets the pipeline snap the length to the speech.
                    num_frames=payload.get("num_frames"),
                    frame_rate=FRAME_RATE,
                    num_inference_steps=self.steps,
                    video_guider_params=_guider_params(),
                    images=images,
                    audio_path=audio_path,
                    enhance_prompt=False,
                    **self._stage_2_override(),
                )
                encode_video(video=result.video, audio=result.audio, fps=FRAME_RATE,
                             output_path=output,
                             video_chunks_number=get_video_chunks_number(result.num_frames, result.tiling_config))


def engine_kind(payload: dict) -> str:
    return "audio" if payload.get("audio_path") or payload.get("audio_url") else "distilled"


class Engine:
    """
    Routes each job to the pipeline it needs, keeping at most one resident.
    Switching kinds releases the previous pipeline before building the next.
    """

    def __init__(self, model_dir: str):
        self.model_dir = model_dir
        self.current = None

    def _engine(self, kind: str):
        if self.current is not None and self.current.kind == kind:
            return self.current
        if self.current is not None:
            import gc
            import torch
            self.current = None
            gc.collect()
            torch.cuda.empty_cache()
        self.current = AudioEngine(self.model_dir) if kind == "audio" else DistilledEngine(self.model_dir)
        return self.current

    def generate(self, payload: dict, output: str):
        engine = self._engine(engine_kind(payload))
        try:
            engine.generate(payload, output)
        finally:
            import torch
            torch.cuda.empty_cache()
