# LTX 2.5 generation and reference workflow

Reviewed and tested on 20 October 2026. The official documentation index's 60
Markdown pages were retrieved for review. The decisions below focus on the model,
prompting, native Python, conditioning, compatibility, and audio workflows used by
this project. Hosted API options are distinguished from the self-hosted worker.

## User workflow

1. Generate one opening reference image for a scene.
2. Check its scenario and any locked character references. The image must finish
   and pass its checks before it can be selected. The page shows concrete mismatch
   notes, a check retry, additional image instructions, and image regeneration.
3. Click **Use this reference**. Selection shows progress immediately, then a
   selected state after the server confirms the save. A blocked or failed click
   displays an explanation next to the scene.
4. Choose the video length, optionally add video instructions, and generate the
   video from the approved image. Review and select the completed video.

Video submission is guarded on the server as well as in the page. It no longer
silently creates an image and proceeds directly into video generation. Scenario
checks also run for images without locked cast members. Uncertain or unavailable
checks are distinguished from a confirmed mismatch. A sampled check is not proof
that every video frame is identical.

New reference images record image-specific requirements. Changing a video's length
or dialogue does not invalidate an otherwise matching opening image. Visual scene,
cast, reference or wardrobe changes still do.

### Writing within a scene's duration

Script import and the default-duration selector explain that the speech budget is
per scene, shared across speakers. The dialogue editor counts unsaved text locally
as the writer types, including a new line alongside existing lines. At 5 seconds,
the English guidance is about 10 spoken words; at 10/15/20 seconds it is about
20/31/41 words. The estimate reserves 20% of the clip for action and pauses.
Actual delivery can differ, so these are planning estimates, not timing guarantees.

An over-budget scene displays its estimated speech time, ways to shorten or split
it, and the shortest enabled longer duration that fits, when one exists. Duration
can be changed beside the dialogue. Visual direction is not counted as speech.
Drafts can still be saved for editing; video submission is blocked locally and on
the server before a new render is queued. The same guidance appears at generation
for scenes that Omni directed. Dialogue assistance uses the scene's own duration
and the budget remaining after its other lines, rather than the project default
or a separate full budget for each speaker. A full budget returns guidance without
making a model request. None of these guidance checks calls a paid provider.

## Prompt and pipeline decisions

- Use present-tense prose covering shot, setting, action, subjects, camera and
  audio. Image-conditioned prompts focus on movement and sound while the first
  frame establishes appearance. Authored multi-shot sequences use explicit prose
  cuts, recurring visual descriptors and continuous sound, instead of numbered
  shot lists. Automatically written scenes prefer one shot, or two to four when
  a cut has a clear purpose.
- Preserve exact dialogue and named speakers. Keep silent scenes wordless and
  enforce the existing duration-dependent speech budget before submission.
- Image regeneration includes both prior scenario/appearance mismatch notes and
  the writer's extra instructions. An image prompt requests one opening frame,
  rather than asking a still image to depict a complete movement sequence.
- Keep native first-frame conditioning, stable request-based seeds, 24 fps,
  `8k+1` frame counts, two-stage distilled rendering, CPU offload and the pinned
  compatible model stack. Structured prompts leave the additional prompt-enhancer
  pass off, avoiding an unnecessary rewrite and inference delay.
- The hosted API's Fast/Pro duration and resolution tables do not configure this
  Modal deployment. Its native frame cap was raised to 481 and its render timeout
  to 1800 seconds. The pinned convolutional VAE remains in use. DFR and the newer
  diffusion decoder require separate asset/runtime validation; they are not
  exposed as working quality modes without that validation.

Sources: [prompting guide](https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide),
[image-to-video](https://docs.ltx.io/open-source-model/usage-guides/image-to-video),
[two-stage generation](https://docs.ltx.io/open-source-model/usage-guides/two-stage-generation),
[native pipeline repository](https://github.com/Lightricks/LTX-2),
[workflow compatibility](https://docs.ltx.io/open-source-model/reference/workflow-asset-compatibility),
[hosted model support matrix](https://docs.ltx.io/models/ltx-2-5).

## Real duration tests

Each test used one fictional writer's opening frame, a continuous camera move,
1024 x 576 output, 24 fps, and jointly generated stereo audio. There was one
provider request per duration. The saved MP4s were inspected with ffprobe, checked
for non-silent audio, and sampled into six-frame contact sheets for visual review.

| Requested | Measured video | Frames | Stereo audio | Render time |
| --- | --- | --- | --- | --- |
| 10 seconds | 10.041667 seconds | 241 | Present | 268.00 seconds |
| 15 seconds | 15.041667 seconds | 361 | Present | 232.08 seconds |
| 20 seconds | 20.041667 seconds | 481 | Present | 247.57 seconds |

On 21 October 2026, the existing 20-second render became the home-page hero:
`public/films/ltx-hero-20s.mp4`, with its actual first-frame poster at
`public/posters/ltx-hero-20s.jpg`. It includes the original generated stereo audio;
the hero starts muted and has a sound toggle. The old five-second hero and the
unused 10-/15-second demo assets were removed. There is no separate examples page.
The measurements above remain as the validation record; no replacement render was
submitted to make this change.

All three retained the writer, clothing and room without an obvious scene change
in the sampled frames. These are bounded examples, not a guarantee of identity
consistency for every prompt or frame. Warm-cache differences mean these render
times should not be used as a scaling formula. Longer and more complex scenes
can still need more time and memory.

The current deployment enables `STUDIO_CLIP_SECONDS=5,10,15,20` and
`STUDIO_CLIP_MAX_SECONDS=20`. A restarted web process and scene worker must read
the updated environment. Durations remain checked against the worker's actual
reported capability before submission. GPU rendering still takes minutes; instant
button feedback is separate from render completion.

## Interaction and performance changes

### Keeping or deleting takes

Every finished image/video offers a confirmed permanent deletion. When replacing
failed matching checks, the writer chooses **Keep old images/videos & generate** or
**Delete old images/videos & generate**. Cleanup must succeed before the latter
submits a new paid generation. Choosing Keep marks the mismatched take as saved
for later immediately and persists that choice, including across page reloads.
Its details sit behind a collapsed Saved takes disclosure while the new take
occupies the main area. Previously kept mismatches do not trigger the same prompt
again. Choosing Delete removes the old file before the new render is submitted.
Standalone deletion uses a trash icon with an accessible name and confirmation.

Deletion clears an affected selection and removes the application's stored object
through the [Supabase Storage API](https://supabase.com/docs/guides/storage/management/delete-objects).
For native LTX takes it also removes the Modal volume's MP4. It does not refund
generation credits, delete character profile references, or delete exported films.
External legacy providers may have their own retention; this action clears the
application's archived copy and the native worker artifact it controls.

An owner-scoped, workspace-serialized reservation commits before file removal.
Deletion is blocked while a source is used in the timeline, an export is active,
or generation is ongoing. Small receipts prevent deleted takes returning through
Undo, retries or late publication. A cleanup failure is visible and retryable;
pending source details are removed after cleanup succeeds. Neither deletion nor
its retry submits a new render.

### Queue and controls

- All scene/editor dropdowns use the shared accessible Select control. An option
  turns green on hover, including the current selection. Away from hover, the
  selection keeps a white surface and green outline. The popup escapes clipped
  panels, repositions on scroll/resize, and stays open when the pointer leaves.
  Selection, an outside click, Escape or keyboard focus departure dismisses it.
  Keyboard navigation, typeahead, disabled choices and touch are supported.
- Boxed selected controls across the public and signed-in flows use green fill.
  Motion controls and story progress steps retain their original styling. Colour
  swatches keep their actual colour with a green selection ring.

- Queue polling does not overlap, stops fetching while the page is hidden, and
  ignores a response that predates a local queue mutation.
- Unchanged project revisions do not replace the client state. Older revisions
  cannot overwrite a saved selection, and pending navigation remains visible
  while serialized edits finish.
- Normal generation-page queue reads reuse the verified owner-scoped project,
  omit unused revision threads, and avoid fetching every job's private project
  snapshot. Only uncertain submissions need snapshots for recovery. Submission
  responses also omit private snapshots.
- Visual rechecks run outside the project's edit lock and merge their result
  into the latest state. Ordinary edits do not wait behind the model review.
- Independent reference-image reads run in parallel for image generation and
  visual review while preserving their reference-to-character mapping.
- Buttons show immediate local progress and retain actionable error messages.
  Rapid repeated clicks are guarded before React rerenders.

The delayed-response browser regression uses 1–1.4 second simulated requests and
requires local click feedback within 350 ms. It covers selection failures,
blocked references, image/video ordering, instructions, duplicate protection and
mobile layout. It does not claim the network or GPU completes within that time.

## Urdu

The official LTX-2.5 model metadata lists English, German, Spanish, French,
Japanese, Korean, Chinese, Italian and Portuguese. Urdu is not listed. Native
Urdu speech quality and pronunciation must therefore not be presented as validated.

The documented audio-to-video workflow provides a possible route: synthesize and
verify an Urdu speech track first, supply it as fixed audio with an approved
opening frame, and validate the resulting mouth movement and preserved speech.
That is distinct from asking text-to-video to invent Urdu speech. This project's
existing audio-conditioned path remains experimental and Urdu generation remains
disabled until actual output passes validation.

Dub-It is a separate LTX-2.3 beta whose documented validated languages also do
not include Urdu; its guide explicitly says LTX-2.5 support is unvalidated.
It must not be substituted as a supported Urdu solution for this model.

Sources: [official model metadata](https://huggingface.co/Lightricks/LTX-2.5),
[audio-to-video workflow](https://docs.ltx.io/open-source-model/usage-guides/audio-to-video),
[Dub-It compatibility and languages](https://docs.ltx.io/open-source-model/feature-guides/audio/dub-it-beta).
