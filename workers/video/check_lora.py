"""CPU-only contract check for the audio pipeline's constructor arguments.

Two GPU runs were lost to argument-shape mistakes that only surfaced after the
model had loaded. This exercises the same construction against the real LTX
libraries on a CPU container - no GPU, no weights, no generation - so the next
shape error costs cents instead of a GPU start.

  modal run workers/video/check_lora.py
"""
import modal

# The container re-imports this module, and `app.py` is not mounted there, so
# the image has to come from a local-only import. The VOLUME must not: a Modal
# function's object set has to be identical locally and remotely, and declaring
# the volume only on one side made the container reject the call with
# "Function has 1 dependencies but container got 2 object ids". Volumes resolve
# by name without `app.py`, so this one is declared unconditionally.
models = modal.Volume.from_name("omninarrative-ltx25-models", create_if_missing=True)
if modal.is_local():
    from app import gpu_image
else:
    gpu_image = modal.Image.debian_slim()

app = modal.App("ltx25-lora-check")


@app.function(image=gpu_image, timeout=900, volumes={"/models": models})
def check():
    import inspect
    from ltx_core.loader import LTXV_LORA_COMFY_RENAMING_MAP, LoraPathStrengthAndSDOps
    from ltx_core.loader.registry import ModelRegistry
    from ltx_pipelines.a2vid_two_stage import A2VidPipelineTwoStage
    from ltx_inference import DISTILLED_LORA, TRANSFORMERS, _guider_params

    results = {}

    # 1. The exact LoRA value the engine builds must survive registry id
    #    generation. The previous failure was AttributeError on tuple.name.
    entry = LoraPathStrengthAndSDOps(f"/models/ltx25/{DISTILLED_LORA}", 1.0, LTXV_LORA_COMFY_RENAMING_MAP)
    registry = ModelRegistry()
    identifier = registry._generate_id([entry.path], entry.sd_ops)
    results["lora_id_ok"] = bool(identifier)
    results["sd_ops_type"] = type(entry.sd_ops).__name__

    # The old value is confirmed to be the bug, not a guess.
    try:
        registry._generate_id([entry.path], ())
        results["empty_tuple_rejected"] = False
    except AttributeError as error:
        results["empty_tuple_rejected"] = "name" in str(error)

    # 2. Every keyword the engine passes must exist in the real signatures.
    init_params = set(inspect.signature(A2VidPipelineTwoStage.__init__).parameters)
    call_params = set(inspect.signature(A2VidPipelineTwoStage.__call__).parameters)
    needed_init = {"model_paths", "distilled_lora", "spatial_upsampler_path", "loras", "registry", "offload_mode"}
    needed_call = {"prompt", "negative_prompt", "seed", "width", "height", "num_frames",
                   "frame_rate", "num_inference_steps", "video_guider_params", "images",
                   "audio_path", "enhance_prompt"}
    results["missing_init_kwargs"] = sorted(needed_init - init_params)
    results["missing_call_kwargs"] = sorted(needed_call - call_params)

    # 3. The guider params object must actually construct.
    guider = _guider_params()
    results["guider"] = {
        "cfg_scale": guider.cfg_scale,
        "stg_scale": guider.stg_scale,
        "rescale_scale": guider.rescale_scale,
        "modality_scale": guider.modality_scale,
        "stg_blocks": list(guider.stg_blocks),
    }
    results["transformers"] = {k: v.rsplit("/", 1)[-1] for k, v in TRANSFORMERS.items()}
    results["stage_2_sigmas_accepted"] = "stage_2_sigmas" in call_params

    # 4. Which params does the REAL 2.5 checkpoint resolve to? This is the
    #    authoritative answer for guidance and step defaults, read from the
    #    checkpoint metadata rather than inferred from a filename.
    from pathlib import Path
    from ltx_pipelines.utils.constants import detect_params, detect_model_version
    for name, relative in TRANSFORMERS.items():
        path = Path("/models/ltx25") / relative
        if not path.is_file():
            results[f"{name}_params"] = "checkpoint not on volume"
            continue
        params = detect_params(str(path))
        guider = params.video_guider_params
        results[f"{name}_params"] = {
            "model_version": str(detect_model_version(str(path))),
            "num_inference_steps": params.num_inference_steps,
            "stage_1_width": params.stage_1_width,
            "stage_1_height": params.stage_1_height,
            "num_frames": params.num_frames,
            "frame_rate": params.frame_rate,
            "cfg_scale": guider.cfg_scale,
            "stg_scale": guider.stg_scale,
            "rescale_scale": guider.rescale_scale,
            "modality_scale": guider.modality_scale,
            "stg_blocks": list(guider.stg_blocks or []),
        }

    # 5. Resolution semantics: width/height are FINAL, stage 1 runs at half.
    #    assert_resolution only enforces divisibility, so it does NOT catch a
    #    stage 1 that lands below the trained size - which is what bit us.
    from ltx_pipelines.utils.helpers import assert_resolution
    resolutions = {}
    for label, (w, h) in {"requested_768x512": (768, 512), "canonical_1536x1024": (1536, 1024)}.items():
        try:
            assert_resolution(height=h, width=w, is_two_stage=True)
            accepted = True
        except ValueError:
            accepted = False
        resolutions[label] = {"accepted_by_assert": accepted, "stage_1": f"{w // 2}x{h // 2}"}
    results["resolutions"] = resolutions

    results["passed"] = (
        results["lora_id_ok"]
        and results["empty_tuple_rejected"] is True
        and not results["missing_init_kwargs"]
        and not results["missing_call_kwargs"]
        and results["stage_2_sigmas_accepted"]
    )
    return results


@app.local_entrypoint()
def main():
    import json
    print(json.dumps(check.remote(), indent=2))
