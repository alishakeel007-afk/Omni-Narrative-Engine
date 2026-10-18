"""CPU-only smoke test: modal run workers/video/check_export.py."""
import modal
if modal.is_local():
    from app import api_image
else:
    api_image = modal.Image.debian_slim()

app = modal.App("ltx25-export-check")


@app.function(image=api_image, timeout=180)
def check():
    import json
    from pathlib import Path
    import re
    import shutil
    import subprocess
    import tempfile
    from uuid import uuid4
    import ltx_exporter as exporter
    from ltx_service import probe
    from PIL import Image
    with tempfile.TemporaryDirectory() as directory:
        source = Path(directory) / "source.mp4"
        output = Path(directory) / "film.mp4"
        exporter.run(["-f", "lavfi", "-i", "color=c=0x171717:s=768x512:r=24:d=2", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(source)])
        exporter.download = lambda url, destination: shutil.copyfile(source, destination)
        clip = {"url": "https://test.supabase.co/synthetic", "start": .25, "end": 1.75, "volume": .75, "fade_in": .1, "fade_out": .1}
        text = {"text": "LTX 100%: 'ready'", "x": .5, "y": .85, "size": 40, "color": "#ffffff", "start": .2, "end": 1.1}
        exporter.render({"request_id": str(uuid4()), "clips": [{**clip, "texts": [text]}, {**clip, "volume": .35}]}, str(output))
        info = probe(str(output), require_audio=True)
        assert abs(info["duration"] - 3) < .15, info
        assert (info["width"], info["height"]) == (1024, 576)
        audio = subprocess.run(["ffmpeg", "-i", str(output), "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True, check=True).stderr
        peak = float(re.search(r"max_volume: ([-\d.]+)", audio)[1])
        assert peak > -35, peak
        samples = []
        for time in (.5, 1.35, 2):
            frame = Path(directory) / f"{time}.png"
            exporter.run(["-ss", str(time), "-i", str(output), "-frames:v", "1", str(frame)])
            image = Image.open(frame).convert("RGB")
            samples.append(sum(1 for pixel in image.getdata() if min(pixel) > 200))
        assert samples[0] > 500 and samples[1] < 20 and samples[2] < 20, samples
        return {"status": "passed", "checks": "MP4 video/audio, two trimmed clips, audible signal, timed literal text, fades", "duration": info["duration"], "peak_db": peak, "caption_pixels": samples}


@app.local_entrypoint()
def main():
    print(check.remote())
