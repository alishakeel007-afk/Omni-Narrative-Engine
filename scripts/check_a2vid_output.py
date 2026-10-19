"""
Objective review aids for one audio-conditioned clip.

These are measurements, not a quality verdict. They answer three questions that
can be answered numerically:

  1. Is the clip's speech the audio that was supplied, or something the model
     generated instead?  -> waveform correlation and duration against the source.
  2. Does the mouth move, and does it move when the speech is loud?
     -> correlation between mouth-region motion and the audio envelope.
  3. Is there speech where the source is silent (invented dialogue)?
     -> energy in the output during source-silent spans.

Lip-sync *quality* still needs a person to watch the file. This script only
narrows down whether that is worth doing.

  python scripts/check_a2vid_output.py --source <input.mp3> --clip <output.mp4>
"""
import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception:
    pass

RATE = 16000


def run(args):
    return subprocess.run(args, capture_output=True, check=True, timeout=300)


def probe(path):
    out = run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)])
    return json.loads(out.stdout)


def mono(path, directory, name):
    """Decode to a single-channel float array at a fixed rate for comparison."""
    wav = Path(directory) / f"{name}.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path),
         "-vn", "-ac", "1", "-ar", str(RATE), "-f", "wav", str(wav)])
    raw = np.frombuffer(wav.read_bytes()[44:], dtype=np.int16).astype(np.float64)
    return raw / 32768.0


def envelope(signal, hop):
    """Short-window RMS, the loudness contour used for timing comparisons."""
    usable = len(signal) - len(signal) % hop
    return np.sqrt((signal[:usable].reshape(-1, hop) ** 2).mean(axis=1))


def best_correlation(a, b):
    """Peak normalised cross-correlation, allowing for a small offset."""
    length = min(len(a), len(b))
    a, b = a[:length], b[:length]
    a = a - a.mean()
    b = b - b.mean()
    if a.std() < 1e-9 or b.std() < 1e-9:
        return 0.0, 0
    correlation = np.correlate(a / (a.std() * len(a)), b / b.std(), mode="full")
    index = int(np.argmax(np.abs(correlation)))
    return float(np.abs(correlation[index])), index - (len(a) - 1)


def mouth_motion(clip, directory, fps):
    """
    Frame-to-frame change in the lower-centre of the frame, where a
    forward-facing speaker's mouth sits. Not face detection: a coarse proxy.
    """
    frames_dir = Path(directory) / "frames"
    frames_dir.mkdir(exist_ok=True)
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(clip),
         "-vf", f"fps={fps},scale=192:-1,crop=in_w/3:in_h/5:in_w/3:in_h*0.55",
         str(frames_dir / "f%04d.png")])
    from PIL import Image
    frames = sorted(frames_dir.glob("f*.png"))
    if len(frames) < 3:
        return np.array([]), 0
    stack = np.stack([np.asarray(Image.open(f).convert("L"), dtype=np.float64) for f in frames])
    return np.abs(np.diff(stack, axis=0)).mean(axis=(1, 2)), len(frames)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--clip", required=True)
    parser.add_argument("--fps", type=float, default=12.0)
    parser.add_argument("--contact-sheet", help="write a strip of sampled frames here")
    args = parser.parse_args()

    report = {}
    with tempfile.TemporaryDirectory(prefix="a2vid-check-") as directory:
        clip_info = probe(args.clip)
        streams = {s["codec_type"]: s for s in clip_info["streams"]}
        report["clip"] = {
            "duration_s": round(float(clip_info["format"]["duration"]), 3),
            "size_bytes": int(clip_info["format"]["size"]),
            "has_video": "video" in streams,
            "has_audio": "audio" in streams,
            "resolution": f'{streams.get("video", {}).get("width")}x{streams.get("video", {}).get("height")}',
            "video_codec": streams.get("video", {}).get("codec_name"),
            "audio_codec": streams.get("audio", {}).get("codec_name"),
        }
        if not report["clip"]["has_audio"]:
            print(json.dumps(report, indent=2))
            sys.exit("The clip has no audio stream.")

        source = mono(args.source, directory, "source")
        clip = mono(args.clip, directory, "clip")
        report["source"] = {"duration_s": round(len(source) / RATE, 3)}

        # 1. Speech preservation.
        hop = RATE // 50  # 20 ms
        source_env = envelope(source, hop)
        clip_env = envelope(clip, hop)
        sample_corr, sample_offset = best_correlation(source, clip)
        env_corr, env_offset = best_correlation(source_env, clip_env)
        report["speech_preservation"] = {
            "waveform_correlation": round(sample_corr, 4),
            "waveform_offset_ms": round(sample_offset / RATE * 1000, 1),
            "envelope_correlation": round(env_corr, 4),
            "envelope_offset_ms": round(env_offset * hop / RATE * 1000, 1),
            "reading": (
                "preserved (same waveform)" if sample_corr > 0.5
                else "same timing, re-rendered audio" if env_corr > 0.7
                else "does not match the supplied speech"
            ),
        }

        # 3. Invented speech where the source is silent.
        quiet = source_env < max(source_env.max() * 0.08, 1e-6)
        shared = min(len(quiet), len(clip_env))
        if quiet[:shared].sum() > 5:
            loud_in_silence = float(clip_env[:shared][quiet[:shared]].mean() / (clip_env[:shared].mean() + 1e-9))
            report["extra_speech"] = {
                "source_silent_frames": int(quiet[:shared].sum()),
                "relative_energy_in_silence": round(loud_in_silence, 3),
                "reading": "possible added audio in silent spans" if loud_in_silence > 0.6 else "silent spans stay quiet",
            }
        else:
            report["extra_speech"] = {"reading": "source has no sustained silence to test"}

        # 2. Mouth motion against loudness.
        motion, frame_count = mouth_motion(args.clip, directory, args.fps)
        if motion.size:
            step = max(1, int(round(RATE / args.fps / hop)))
            speech = envelope(clip, hop)[::step][: len(motion)]
            motion_trimmed = motion[: len(speech)]
            corr, offset = best_correlation(speech, motion_trimmed)
            report["mouth_motion"] = {
                "frames_sampled": frame_count,
                "mean_motion": round(float(motion.mean()), 4),
                "motion_vs_loudness_correlation": round(corr, 4),
                "offset_frames": offset,
                "reading": (
                    "static mouth region" if float(motion.mean()) < 0.5
                    else "moves in time with the speech" if corr > 0.35
                    else "moves, but not clearly in time with the speech"
                ),
            }
        else:
            report["mouth_motion"] = {"reading": "too few frames to measure"}

        if args.contact_sheet:
            # A strip of evenly spaced frames, so the mouth can be inspected
            # directly rather than trusted to the motion proxy above.
            sheet = Path(args.contact_sheet)
            sheet.parent.mkdir(parents=True, exist_ok=True)
            run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(args.clip),
                 "-vf", "fps=2,scale=320:-1,tile=4x3", "-frames:v", "1", str(sheet)])
            report["contact_sheet"] = str(sheet)

    print(json.dumps(report, indent=2))
    print("\nThese are measurements only. Watch the clip before calling lip-sync good.")


if __name__ == "__main__":
    main()
