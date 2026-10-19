# Story flow plan: idea path, script path, and "Let Omni do it"

Status: **draft, waiting for approval**
Date: 2026-10-20

This plan turns our discussion into code changes. It keeps the four steps
(Setup → Script & Characters → Generate → Edit), the durable queue, idempotent
request IDs, and reference-based continuity exactly as they are.

---

## 1. The flow we agreed on

### Common start
1. The user logs in and presses **Create your story**.
2. They choose **I have an idea** or **I have a script**.

### Path A: "I have an idea" (guided)
1. The user writes the rough idea (or picks a starter idea).
2. **How many scenes?** The user decides (1–12). "Let Omni decide" is also offered.
3. **Who's in your story?** The user sets how many characters. For each character they can:
   - give a name and a written appearance, or
   - upload a photo (Omni analyses the visible appearance), or
   - leave the slot empty, and Omni invents the name and appearance.
4. Optional setup pages (title, look, audience, tone, genre, ending, length, language) stay as they are. Each still has Ask Omni with 2–4 options.
5. **Build my script.** On the backend, Omni writes the scenes using the chosen scene count and cast. It then **fills every scene detail automatically**: location, time, lighting, camera, background people, expressions, wardrobe, music, ambience and so on.
6. The user goes **straight to Step 3 (Generate)**. Step 2 is marked complete and stays reachable if they want to review or edit.
7. **Confirmation:** "Generate all N ready scenes now?" On **Yes**, every eligible scene goes into the durable queue. On **Not now**, they stay on Generate and can start manually.
8. Step 4 (Edit & Export) is unchanged.

### Path B: "I have a script" (custom)
1. The user pastes the script.
2. **How many scenes?** and **Who's in your story?** work the same way as Path A. Omni pre-fills the character slots from the names found in the script, and the user can correct them, add photos, or leave appearances to Omni.
3. **Build my script.** Omni restructures the user's script into scenes. It keeps their characters, order, dialogue and intent.
4. **Who decides the details?** This is a new choice with two big buttons:
   - **Let Omni do it.** Omni fills all empty scene details on the backend, exactly like Path A, then goes to Generate with the same "Generate all N scenes?" confirmation.
   - **I'll direct.** The user walks through the existing small Step 2 pages for each scene: action, cast, dialogue, location, time, lighting, props, camera, **background people**, **expressions**, delivery, wardrobe, music, ambience and sound. Every field keeps its **Ask Omni** button. In this mode Omni gives one direct answer instead of options.
5. Once they are done, Generate builds scene by scene (or all at once), then Edit & Export.

### Rules that apply to both paths
- The original rough idea or script stays the anchor for every Ask Omni call.
- "Let Omni do it" **only fills empty fields**. Anything the user wrote is never overwritten.
- A reference photo is optional. Characters without one generate from their written appearance and never block generation.
- Locking a character still requires an approved reference.
- The user can go back from Generate to Setup or Script & Characters without losing work.

---

## 2. Phases

Each phase is a small change that is tested on its own.

### Phase 1: Scene count and cast in Setup
**What:** Add the "How many scenes?" and "Who's in your story?" pages to Setup.

- `types/studio.ts`: add `storyPlan?: { sceneCount?: number; characterCount?: number }` plus the `MAX_STORY_SCENES` / `MAX_STORY_CHARACTERS` constants (12, matching the existing script schema and character limit).
- `app/api/studio/[id]/route.ts`:
  - The `workflow` patch accepts `storyPlan`. `null` clears a count, so Omni decides it again.
  - The count can't be lowered below the number of characters already created.
  - `createCharacter` raises the planned count if the user adds more characters than planned.
- `components/film/setup-step.tsx`: two new pages right after the idea/script page:
  - Scene count: pills 1–12 plus **Let Omni decide**.
  - Cast: a count picker and the existing `CharacterPanel` (name, appearance, photo upload, concept portrait), reused rather than rebuilt. Shows "You've set up X of N. Omni will create the rest."
- `screens/FilmStudioScreen.tsx`: pass the character handlers (`onCharacter`, `onReference`, `onUpload`, `onVoice`, `onAction`) into `SetupStep`.

**Done when:** counts save and reload. Characters created in Setup show up with their photos, and the user can skip both pages.

> Already started (uncommitted): the `storyPlan` type and constants, the route's
> `storyPlan` patch handling, and the `createCharacter` count bump. The Setup UI
> isn't written yet. If you don't approve this plan, I'll revert those edits.

### Phase 2: Script build respects the user's choices
**What:** The script uses the chosen scene count and cast, and never loses work the user did in Setup.

- `route.ts` `script` action: pass `sceneCount` and the cast to `generateFilmScript` (the `sceneCount` parameter already exists but is never passed).
- `lib/film/ai.ts` `generateFilmScript`: the prompt lists the user's characters (name plus appearance, if given) as **required**, says how many more Omni should invent, and asks for exactly `sceneCount` scenes.
- `lib/film/ai.ts` `applyFilmScript`, two current bugs to fix:
  - It overwrites an unlocked character's appearance with the model's. It should keep any appearance the user wrote or that came from a photo, and only fill empty ones.
  - It drops user-created characters that have no reference and that the model forgot. It should keep every character the user created.
- Script path: before the cast page, detect the character names in the pasted script and offer them as pre-filled slots.

**Done when:** a build with 5 scenes and 2 named characters produces exactly 5 scenes, keeps both characters with their appearances and photos, and adds Omni-created characters only up to the count.

### Phase 3: "Let Omni do it": automatic scene details
**What:** A new backend action fills every empty scene detail in one AI call.

- New route action `autoDirect`:
  - one Gemini → Groq call that returns the direction for all scenes at once (schema-validated)
  - writes **only empty** fields, for every scene and every cast member's wardrobe and expression
  - idempotent through a `requestId`, so a retry doesn't run it twice
  - saves `state.directionMode = "omni" | "director"`
- `lib/film/progress.ts`: on the Omni path, Step 2 counts as complete once the script and auto-direction exist.

**Done when:** after `autoDirect`, every scene has direction values. Fields the user had already written are unchanged, and running it again changes nothing.

### Phase 4: New direction fields
**What:** Add the details we discussed that don't exist yet.

- `SceneDirection` gets:
  - `background`: background people/extras ("two students studying in the corner", "empty corridor")
  - `expression`: keyed per character, like `wardrobe` ("Rohan: nervous, avoiding eye contact")
- `components/film/creative-decisions.tsx`: add the matching small pages, each with Ask Omni.
- `lib/film/prompt.ts` and the image prompt: include both fields in what goes to Cloudflare and Modal LTX.

**Done when:** the new fields save, show Ask Omni, and appear in the generated prompt (checked by a unit test on the prompt builder).

### Phase 5: The two paths in the UI, with the confirmation
**What:** Wire the paths together.

- **Idea path:** "Build my script" runs build → `autoDirect` → opens Generate.
- **Script path:** after the build, a page in Step 2 asks **"Who decides the details?"**
  - **Let Omni do it**: runs `autoDirect` and opens Generate.
  - **I'll direct**: shows the existing Step 2 pages.
- **Confirmation on arriving at Generate through "Let Omni do it":**
  - one dialog: *"Generate all N ready scenes now? This starts N image + video jobs."*
  - **Yes** submits the same batch as "Generate all ready scenes": durable jobs with idempotent request IDs, 2 rendering slots.
  - **Not now** stays on Generate with nothing submitted.
  - It's shown **only once** per build (stored in the project, not just the browser), so a refresh never asks again or submits twice.
- The user can still go back to Setup or Script & Characters at any time. Going back never cancels jobs already in the queue.

**Done when:** idea → build → confirmation → Yes queues every eligible scene exactly once. A refresh after Yes doesn't submit again, and "I'll direct" never auto-submits.

### Phase 6: Tests
- Extend `tests/studio-workflow.cjs` for the `storyPlan` patch and count validation.
- Extend `tests/studio-script.cjs` for scene count, cast preservation, and the appearance-not-overwritten rule.
- New `tests/studio-autodirect.cjs`: only empty fields filled, idempotent, both modes.
- Extend `tests/studio-generate.cjs`: the confirmation submits once, with no duplicate paid requests.
- Browser check of the full idea path and script path on `localhost:3000`.

---

## 3. Not changing
- The four-step structure and the step indicator.
- The durable queue, worker slots, idempotency and the provider fallback order.
- The reference, locking and continuity policy (unlocked characters never block).
- Edit & Export.

## 4. Open questions
1. **Scene count limit:** is 12 the right maximum? It matches the current script schema.
2. **Script path pre-fill:** should Omni detect the characters from the pasted script automatically (one AI call), or should the user list them?
3. **Cost line in the confirmation:** should it show an estimate (for example, "about N minutes of video"), or just the scene count?
