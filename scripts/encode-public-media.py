"""Prepare public backgrounds from completed AI video jobs. No API calls."""
import json
import re
import subprocess
from pathlib import Path
import imageio_ffmpeg

root = Path(__file__).resolve().parent.parent
films = root / "public" / "films"
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
manifest = {"provenance": "Original AI-generated landscape footage, generated with Magic Hour LTX 2.5.", "native4k": False, "note": "Native 4K generation was rejected by the account tier. 4K files are Lanczos-upscaled delivery versions, not native 4K detail.", "films": []}
for slug in ["emerald-world", "forest-light"]:
    source = films / f"{slug}-source.mp4"
    if not source.exists():
        raise SystemExit(f"Missing completed video: {source.name}")
    probe = subprocess.run([ffmpeg, "-hide_banner", "-i", str(source)], capture_output=True, text=True)
    match = re.search(r"Video:.*?\b(\d{3,5})x(\d{3,5})\b", probe.stderr)
    native = f"{match[1]}x{match[2]}" if match else "unknown"
    outputs = [
        ("web.mp4", ["-an", "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "2"]),
        ("4k.mp4", ["-an", "-vf", "scale=3840:2160:flags=lanczos", "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-threads", "2"]),
        ("poster.jpg", ["-ss", "1", "-frames:v", "1", "-update", "1", "-vf", "scale=1920:1080:flags=lanczos", "-q:v", "3"]),
    ]
    for suffix, options in outputs:
        output = films / f"{slug}-{suffix}"
        if output.exists():
            print(f"Reusing {output.name}", flush=True)
            continue
        subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), *options, str(output)], check=True)
        print(f"Prepared {output.name}: {output.stat().st_size:,} bytes", flush=True)
    manifest["films"].append({"id": slug, "sourceResolution": native, "webResolution": "1280x720", "deliveryResolution": "3840x2160", "deliveryUpscaled": True, "durationSeconds": 5, "audio": False})
(films / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print("PASS: 4K delivery files, lightweight web files and poster frames are ready.", flush=True)
