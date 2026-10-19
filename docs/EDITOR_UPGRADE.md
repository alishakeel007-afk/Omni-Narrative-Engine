# Recommended editor upgrade

Decision: extend the existing React clip editor and CPU FFmpeg exporter. Keep immutable source takes, stable clip IDs, server-side ownership, undo history and export snapshots. Add editable speech transcripts first. Do not replace the editor or deploy another model as part of this change.

## Editable subtitles from actual speech

Transcribe the audio of each **completed source take**, not the authored script. LTX can change, omit or add words; script-derived captions would conceal that difference. Cache transcription by take ID plus audio checksum and model revision. Keep original recognition results separate from user corrections.

Store source-relative word and cue intervals, text, confidence/review flags and language. A caption references its source take and clip instance. Map it to the film timeline with `filmStart + sourceTime - sourceIn`; intersect with the trim window. On split, both resulting instances refer to the same transcript and show only their own intersecting cues. Reorder changes film placement without retranscribing. A new take receives a new transcript; retain corrections on the older take.

React should preview editable cues using the same clock and transforms as the clip player. Keep caption style (font, size, position, foreground, outline, background, line breaks) separate from cue text/timing. Export SRT/VTT alongside the film and optionally burn styled ASS captions into the MP4 with CPU FFmpeg. Use the same font files in preview and export. Flag low confidence, overlapping voices and silent sections for review; never fill silence with the authored script.

## Practical model choices

| Option | License / requirements | Integration and suggested placement |
|---|---|---|
| Whisper | MIT code and weights; official model guidance lists roughly 1 GB VRAM for tiny/base, 2 GB small, 6 GB turbo and 10 GB large. | Start with English base/small on CPU for short FYP films. A queue job extracts mono audio, runs recognition, and saves editable cues. This is the smallest new service surface. [Official repository](https://github.com/openai/whisper). |
| WhisperX | BSD-2-Clause project; alignment/VAD/diarization models have their own terms. CPU int8 is supported; the documented large-v2 GPU path uses under 8 GB with the stated settings. | Add forced alignment if word timing materially improves captions. More dependencies and model caches than plain Whisper. Skip diarization initially: a native mixed soundtrack does not reliably identify the project's named characters. [README](https://github.com/m-bain/whisperX), [license](https://github.com/m-bain/whisperX/blob/main/LICENSE). |
| Qwen-Image-Edit-2509 | Apache-2.0 model card; supports multiple image inputs. The official example uses BF16 on CUDA. | An optional later **thumbnail background editor**, in a separate on-demand Modal worker. Supply approved references and uploaded layout examples as inputs. A planning estimate is 40 GB for 20B BF16 parameter storage before activations/other components; budget an 80 GB GPU or benchmark offloading/quantization separately. This is a sizing inference, not a measured minimum for this app. [Official model card](https://huggingface.co/Qwen/Qwen-Image-Edit-2509). |

CPU recognition has no GPU charge on a local machine, but consumes local runtime/RAM. A separate small Modal transcription worker would avoid loading the much larger LTX pipeline for subtitles. Benchmark a representative three-minute film before selecting CPU vs GPU. Do not use an A100 merely because the video generator already uses one.

As a reference for later GPU budgeting, Modal currently lists A100 80 GB at $0.000694 per GPU second: 60 seconds of GPU time is about $0.0416, before CPU, RAM, model loading, idle time, storage and other charges. Thus a hypothetical 30–120 second thumbnail inference is $0.021–$0.083 GPU-only; it is **not** an observed per-thumbnail price. Measure cold and warm runs before committing to a thumbnail backend. [Modal pricing](https://modal.com/pricing).

## Other editing improvements

1. Add waveform display, mute, gain, clip fades and a film-wide music track. Native LTX audio is one mixed soundtrack; it does not provide separate dialogue/music stems. Label that limitation when offering audio controls.
2. Add cut/dissolve/fade transitions as explicit timeline objects with duration. Account for overlap in the playback clock, subtitle placement, total duration, undo and FFmpeg export (`xfade` plus `acrossfade`). Never approximate a transition by silently trimming source takes.
3. Make editing assistance propose operations by stable clip ID. Preview the changes, list affected captions and let the user accept or discard the proposal. Reuse the current history and server validation.
4. Provide a separate thumbnail canvas. Store image placement/crop, uploaded references, background, and **editable headline text as layout objects**. Render the headline with SVG/canvas/HTML and an export font, so spelling, placement and later edits are deterministic. Use an image-editing model for background/composition, not for baking the final title into pixels.

Video subtitles represent what the viewer hears at particular times. A thumbnail headline is static editorial copy. Keep their content, styles, storage and export controls separate.

Suggested sequence: transcript data model and source-time mapping → CPU Whisper pilot → editable cue UI and ASS/SRT export → waveform/music/transition objects → thumbnail canvas → benchmark Qwen editing only if background editing is needed. All model additions above remain recommendations.
