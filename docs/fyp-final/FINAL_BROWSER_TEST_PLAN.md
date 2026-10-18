# Final Browser Test Plan

## Purpose and rules

This plan is for final manual FYP verification. It does **not** establish production certification. Record every result as PASS, FAIL, or PENDING; do not mark a provider-dependent action as PASS unless its result was heard or seen in the browser.

Use only disposable projects named `FYP Demo — Guided` and `FYP Demo — Custom`. Do not delete, overwrite, regenerate, or complete valuable saved projects during this test. Provider actions (story generation, TTS, image generation) can consume quota; run each only once per disposable scene after the non-provider checks have passed.

## Start the application

From PowerShell:

```powershell
Set-Location D:\project\Omni-Narrative-Engine
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Keep `.env.local` private; it must contain the server-only configuration already required by the application.

For a production-build check instead:

```powershell
Set-Location D:\project\Omni-Narrative-Engine
npm run build
npm run start -- -p 3005
```

Open [http://localhost:3005](http://localhost:3005). Use one server mode at a time.

Useful routes:

- `/` — Home
- `/story/mode` — Guided/Custom selector
- `/video` — Guided Video Studio (direct entry)
- `/story-builder` — Custom Story Builder (direct entry)
- `/projects` — My Projects
- `/dashboard` — Dashboard

Preview routes are normally opened by the application so they retain the owned project context. If testing a direct preview URL, use only a project ID from the signed-in disposable project and confirm that an unauthorized or invalid ID shows a safe recovery/error state.

## Minimal disposable test data

Create two short two-scene projects:

1. **Guided:** English, two scenes, one narration-only scene and one scene with a single dialogue line. Keep one scene intentionally silent for music if the stage allows it.
2. **Custom:** a manually written title, two manually authored scenes, one dialogue line, and one visual-only or narration-only scene. Add a third temporary scene solely to test reordering and deletion before saving.

For Urdu, use a separate short one-scene disposable project. Do not overwrite English media. A successful provider call only proves that one clip generated; listening remains required.

## Result record

Copy this block for every test session:

| ID | Area | Action | Expected result | Status (PASS/FAIL/PENDING) | Evidence / issue ID |
|---|---|---|---|---|---|
| | | | | PENDING | |

Capture screenshots or a short screen recording for failures. Record provider error text without keys, URLs, tokens, or user data.

## A. Authentication and account isolation

| ID | Action | Expected result |
|---|---|---|
| A1 | Sign in with the demonstration account. | Home loads; profile menu identifies the signed-in session. |
| A2 | Sign out, then open `/projects`, `/video`, and `/story-builder`. | Protected routes require authentication or show their designed safe entry state; no project data is revealed. |
| A3 | Sign in again. | The same owned disposable projects are available. |
| A4 | In a separate browser profile/account, attempt to use a copied disposable-project preview or resume URL. | The project is not loaded; an unauthorized/missing-project state is shown. |

## B. Navigation

| ID | Action | Expected result |
|---|---|---|
| B1 | From Home, choose **Open Video Studio**. | `/story/mode` opens with Guided and Custom cards and local images. |
| B2 | Use navbar **Video Studio**. | The same mode selector opens and Video Studio is active in navigation. |
| B3 | Select Guided Mode. | The eight-stage Guided Video Studio opens. |
| B4 | Select Custom Mode. | Custom Story Builder opens without creating or changing Guided data. |
| B5 | Open Profile → My Projects and Dashboard. | Project actions are visible and do not redirect to an unrelated workflow. |
| B6 | Resume each disposable project. | Guided resumes `/video` at its saved stage; Custom resumes `/story-builder` with its own project. |

## C. Guided Mode — Stages 1–8

| ID | Action | Expected result | Provider required? |
|---|---|---|---|
| C1 | Create/open the Guided disposable project; move through setup. | Required fields validate; save state is visible. | No |
| C2 | Generate a short story. | Structured scenes/characters appear, or a clear provider failure is displayed without losing setup. | Yes — Groq/Gemini |
| C3 | Edit one dialogue line, narration, visual context, and one music decision. | Only dependent media is marked **Outdated — Regenerate recommended**; unrelated media stays current. | No |
| C4 | Reorder scenes, delete the middle/temporary scene, save, refresh, and reopen. | Exact retained scene set and order restore; stable media stays with the correct scene; deleted scene does not return. | No |
| C5 | Generate one dialogue/narration clip. | User-triggered audio generation reports progress; saved valid clip can play. | Yes — Deepgram/ElevenLabs |
| C6 | Generate one missing scene visual. | Progress and retry states are clear; valid existing images are not silently overwritten. | Yes — image provider |
| C7 | Generate a cinematic score for one eligible scene; choose intentional silence for another. | Score can preview/save; silence remains valid and is never shown as missing imported music. | Browser synthesis + storage |
| C8 | Open Stage 8 preview, refresh it, then use Back to Video Studio. | Correct owned project restores; Back returns to the meaningful editing stage rather than setup. | No |

## D. Custom Mode

| ID | Action | Expected result | Provider required? |
|---|---|---|---|
| D1 | Enter title, manually author two scenes, narration, characters, dialogue, genre, and direction. | Manual text remains after switching scenes/stages. | No |
| D2 | Add a temporary scene, reorder it, delete it, save, and refresh. | Scene order and stable IDs restore; deleted scene stays absent. | No |
| D3 | Choose **Suggest 3 Next Scenes**. | Exactly three selectable, context-aware alternatives appear; none auto-applies. | Yes — configured story provider |
| D4 | Apply one suggestion to an empty editor, edit it, then ignore later suggestions. | Applied text stays editable; existing manual content is not replaced without confirmation. | No after suggestion |
| D5 | Save to My Projects, sign out/in, and resume. | Manual title, scenes, dialogue, and current stage restore once; no duplicate project is created. | No |
| D6 | Generate one narration/dialogue clip and one image from authored content. | Explicit actions create media only for the selected missing/outdated content, or show a recoverable failure. | Yes — TTS/image |
| D7 | Generate/persist a cinematic score for one eligible scene; mark another silent. | Existing music remains intact; silence is represented as intentional. | Browser synthesis + storage |
| D8 | Open the Custom preview from the workflow and My Projects. | Correct project/order/media restore; no Guided project is loaded. | No |

## E. Media and preview reliability

| ID | Action | Expected result |
|---|---|---|
| E1 | Preview a complete two-scene story. | Images change at scene boundaries; narration and dialogue play sequentially without duplicate or overlapping speech. |
| E2 | Use Play, Pause, Resume, Restart, and rapidly switch controls once. | Current scene/progress are understandable; playback resumes/cleans up safely. |
| E3 | Navigate away during playback. | Audio stops; returning does not resume stale playback automatically. |
| E4 | Test a visual-only scene and a scene with intentional music silence. | Timeline continues with a fallback visual duration; silence is valid. |
| E5 | Leave one optional music clip missing and one voice clip unavailable. | Preview remains usable with a clear affected-scene warning; optional music does not block it. |
| E6 | Listen during speech with scene music. | Music ducks during narration/dialogue and returns smoothly where supported. |
| E7 | Play a short English clip and, separately, a short Urdu clip. | Correct clip order and playback; document subjective pronunciation/expressiveness separately. |

## F. Persistence and recovery

| ID | Action | Expected result |
|---|---|---|
| F1 | Refresh immediately after a confirmed save in Guided and Custom. | The correct owned project, stage, scene order, media URLs, and freshness state restore. |
| F2 | Resume from My Projects after logout/login. | Resume opens the correct workflow at saved stage; Watch Story opens preview only for eligible completed projects. |
| F3 | Edit a previously complete project so a required asset becomes outdated. | It is shown as Needs Attention; completion is not silently retained as fully ready. |
| F4 | Retry a failed manual save after restoring connectivity. | UI reports Saved only after confirmation; no duplicate project/import occurs. |
| F5 | Switch between the two disposable projects and refresh each preview. | No cached scenes/media cross project or account boundaries. |

## G. Accessibility and responsive layout

| ID | Action | Expected result |
|---|---|---|
| G1 | Test Home, selector, both workflows, My Projects, and preview at a narrow mobile width. | No clipped primary controls or horizontal overflow; cards stack legibly. |
| G2 | Navigate primary controls with keyboard only. | Visible focus, logical tab order, labelled form fields, and operable buttons. |
| G3 | Check warning/error cards in light and dark theme if supported. | Heading, description, icon, and details have readable contrast. |
| G4 | Use preview controls with keyboard and screen-reader labels where available. | Play/Pause/Restart and progress/current-scene information are understandable. |

## Provider-dependent checks and cost control

The following need configured live services and may consume quota: Guided/Custom story suggestions and generation (Groq/Gemini), English Deepgram audio, Urdu ElevenLabs audio, and image generation. Run at most one intentionally short request per provider and retain it for subsequent preview/persistence checks. Cinematic scoring is browser-side but its save still requires an authenticated project and storage availability.

If a provider fails, record the user-facing error, verify that authored text and prior media remain intact, then continue non-provider checks. Do not retry repeatedly during the demo.

## Sign-off

The final demonstration is ready only when all core navigation, save/resume, preview, and one representative media path per supported language have recorded PASS results. MP4 composition and export are intentionally not part of this plan.
