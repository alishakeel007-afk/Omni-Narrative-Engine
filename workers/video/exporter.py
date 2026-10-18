"""Bounded FFmpeg assembly. All media is downloaded to local files before decode."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlparse
from uuid import UUID

import httpx
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Overlay(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(max_length=500)
    x: float = Field(default=0.5, ge=0, le=1)
    y: float = Field(default=0.9, ge=0, le=1)
    size: int = Field(default=36, ge=16, le=96)
    color: str = Field(default="#ffffff", pattern=r"^#[0-9a-fA-F]{6}$")
    start: float = Field(default=0, ge=0, le=60)
    end: float = Field(default=0, ge=0, le=60)

    @model_validator(mode="after")
    def timing(self):
        if self.end and self.end <= self.start:
            raise ValueError("Text end must follow text start.")
        return self


class Clip(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(max_length=8192)
    start: float = Field(default=0, ge=0, le=60)
    end: float = Field(default=0, ge=0, le=60)
    volume: float = Field(default=1, ge=0, le=1)
    fade_in: float = Field(default=0, ge=0, le=5)
    fade_out: float = Field(default=0, ge=0, le=5)
    texts: list[Overlay] = Field(default_factory=list, max_length=8)
    voices: list[str] = Field(default_factory=list, max_length=12)
    music: str | None = None
    voice_delay: float = Field(default=0, ge=0, le=60)
    voice_volume: float = Field(default=1, ge=0, le=1)
    music_volume: float = Field(default=0.2, ge=0, le=1)


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID
    clips: list[Clip] = Field(min_length=1, max_length=12)


def download(url, destination):
    parsed = urlparse(url)
    host = parsed.hostname or ""
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443) or not any(host.endswith(suffix) for suffix in (".supabase.co", ".supabase.in", ".magichour.ai")):
        raise ValueError("Unsupported media host.")
    total = 0
    with httpx.stream("GET", url, follow_redirects=False, timeout=60) as response:
        response.raise_for_status()
        with open(destination, "wb") as output:
            for chunk in response.iter_bytes():
                total += len(chunk)
                if total > 100 * 1024 * 1024:
                    raise ValueError("A source clip exceeds 100 MiB.")
                output.write(chunk)


def media_info(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], capture_output=True, check=True, text=True, timeout=30)
    return json.loads(result.stdout)


def run(arguments):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *arguments], check=True, capture_output=True, timeout=300)


def render(payload, output):
    request = ExportRequest.model_validate(payload)
    font = os.getenv("LTX_FONT_PATH", "/root/Manrope.ttf")
    total_duration = 0
    with tempfile.TemporaryDirectory(prefix="film-") as temporary:
        directory = Path(temporary)
        completed = []
        for index, clip in enumerate(request.clips):
            source = directory / f"source-{index}.mp4"
            download(clip.url, source)
            metadata = media_info(source)
            source_duration = float(metadata["format"]["duration"])
            end = clip.end or source_duration
            if clip.start >= end or end > source_duration + 0.1:
                raise ValueError("A trim range is outside its source clip.")
            duration = min(end, source_duration) - clip.start
            total_duration += duration
            if total_duration > 180:
                raise ValueError("This version exports films up to three minutes.")
            arguments = ["-i", str(source)]
            audio_sources = []
            filters = []
            has_audio = any(stream["codec_type"] == "audio" for stream in metadata["streams"])
            if has_audio:
                filters.append(f"[0:a]atrim=start={clip.start}:end={end},asetpts=PTS-STARTPTS,aresample=48000,volume={clip.volume}[base]")
            else:
                filters.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={duration}[base]")
            audio_sources.append("[base]")
            offset = clip.voice_delay
            for voice_index, url in enumerate(clip.voices):
                voice = directory / f"voice-{index}-{voice_index}.audio"
                download(url, voice)
                arguments.extend(["-i", str(voice)])
                input_index = len(audio_sources)
                label = f"voice{voice_index}"
                filters.append(f"[{input_index}:a]aresample=48000,volume={clip.voice_volume},adelay={int(offset*1000)}:all=1,apad,atrim=duration={duration}[{label}]")
                audio_sources.append(f"[{label}]")
                offset += float(media_info(voice)["format"]["duration"])
            if clip.music:
                music = directory / f"music-{index}.audio"
                download(clip.music, music)
                arguments.extend(["-stream_loop", "-1", "-i", str(music)])
                filters.append(f"[{len(audio_sources)}:a]aresample=48000,volume={clip.music_volume},atrim=duration={duration},asetpts=PTS-STARTPTS[music]")
                audio_sources.append("[music]")
            fade = ""
            if clip.fade_in:
                fade += f",afade=t=in:d={min(clip.fade_in,duration)}"
            if clip.fade_out:
                fade += f",afade=t=out:st={max(0,duration-clip.fade_out)}:d={min(clip.fade_out,duration)}"
            filters.append(f"{''.join(audio_sources)}amix=inputs={len(audio_sources)}:normalize=0,apad,atrim=duration={duration}{fade},alimiter=limit=0.98:level=0[aout]")
            visual = f"[0:v]trim=start={clip.start}:end={end},setpts=PTS-STARTPTS,scale=1024:576:force_original_aspect_ratio=decrease,pad=1024:576:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24"
            for text_index, text in enumerate(clip.texts):
                text_file = directory / f"text-{index}-{text_index}.txt"
                text_file.write_text(text.text, encoding="utf-8")
                text_end = min(text.end or duration, duration)
                visual += f",drawtext=fontfile='{font}':textfile='{text_file}':expansion=none:fontsize={text.size}:fontcolor={text.color}:x=(w-text_w)*{text.x}:y=(h-text_h)*{text.y}:borderw=2:bordercolor=black:enable='between(t,{text.start},{text_end})'"
            filters.append(visual + "[vout]")
            target = directory / f"clip-{index}.mp4"
            run([*arguments, "-filter_complex", ";".join(filters), "-map", "[vout]", "-map", "[aout]", "-t", str(duration), "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", str(target)])
            completed.append(target)
        manifest = directory / "timeline.txt"
        manifest.write_text("\n".join(f"file '{path.as_posix()}'" for path in completed))
        run(["-f", "concat", "-safe", "0", "-i", str(manifest), "-c", "copy", "-movflags", "+faststart", output])
