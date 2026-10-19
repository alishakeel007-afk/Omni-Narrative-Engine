# Guided story workflow revision

19 October 2026, Asia/Karachi. This revision follows the request to simplify the crowded interface, repair AI help, use Cloudflare images, connect progress and use “story” throughout the product.

## Interface

- Each of the four stages now contains small, resumable pages. Only the current decision is shown, with a single Back/Continue row and a menu for revisiting a part. Moving between pages does not count as completing work.
- Setup starts with the rough idea or supplied script, then title, visual feel and individual optional creative choices. It finishes with format settings and review. Unrelated example ideas disappear once a visitor enters their own story.
- Script review separates order, individual characters, action, cast/length, dialogue, individual scene directions and optional camera cuts. Scene directions have a shortcut to skip the remaining optional details. Identity, character motivation/relationships, and reference approval are separate views.
- Generation shows one scene at a time, followed by assembly review. The editor separates playback, trim/order, text, audio and export. Original takes, saved edits, ownership and undo remain intact.
- One arrow track connects all four numbered stages, starting below 1 and passing below the other numbers. The overview scrolls away with the page. Saved requirements still drive completion. The public preview uses the same connected presentation.
- Navigation includes Stories, New story, How it works and Settings. Mobile Profile, Change password and Settings now use the same working destinations as desktop.
- User-facing labels/messages use “story”. New workspace links use `/story/[id]`; existing `/film/[id]` links redirect. Internal types and database tables retain their names.

## AI help

Field helpers support idea development, title, visual feel, audience, purpose, tone, genre, ending, character name/appearance/motivation/relationships, scene title/action, existing or new dialogue, scene setting/light/props/camera/delivery/music/ambience/effects/wardrobe, shots, text overlays and editing advice. Numeric editing controls remain direct controls.

The original rough idea is retained when script generation refines the premise. Requests carry the current story draft and the selected scene, character or line. Typed field drafts are passed to help even while a blur-save is in flight. Prompts require proposals to preserve the writer's people, setting, conflict and intent. No model call is made merely by opening a page.

Previously, a help request saved its old project snapshot after the model responded. An intervening edit or job completion could turn a successful answer into a revision conflict. Help now returns a proposal without writing that snapshot, including during another media operation. Applying a choice remains explicit. Errors and retry controls appear beside the field. Network, empty-response and JSON failures in Gemini can reach the configured text fallback; visual analysis never falls back to a text-only model.

## Cloudflare images

The default story image backend is Cloudflare Workers AI, using the server-only `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` variables saved in `.env.local`. Concept portraits, scene images and director images all use the shared submission path.

`lib/studio/cloudflare.ts` sends multipart input to FLUX.2 klein 4B, attaches actual owned reference pixels, resizes each reference within 512×512, and maps up to four inputs to character identities. Output is validated and converted to PNG before durable storage. Character-conditioned images still need the existing appearance review. Errors never trigger an automatic call to another paid image provider. Explicit legacy backend settings and historical takes remain supported.

Protocol sources: [Cloudflare model documentation](https://developers.cloudflare.com/workers-ai/models/flux-2-klein-4b/), [multipart/reference input documentation](https://developers.cloudflare.com/changelog/post/2026-01-15-flux-2-klein-4b-workers-ai/).

## Verification and limits

- Production application and queue-worker builds pass, including type/lint checks and 17 static pages.
- All 15 Node suites pass. New tests cover assistant ownership/scoped IDs, concurrent saves, context preservation, transport fallback and the Cloudflare multipart/reference/storage contract. External provider calls are replaced in these tests.
- `tests/studio-guided-browser.cjs` passes on the real public application at desktop/mobile sizes: one-question guest flow, saved idea, context-sensitive presentation, gated settings and protected story routes.
- Its authenticated run passes against the actual application/API using the previously manually signed-in QA browser: saved answers, connected scrolling progress, character/scene/tool separation, navigation and mobile account links. The helper's error/retry/acceptance interaction is verified with a simulated provider response; saves use the actual API.
- `tests/studio-live-editor.cjs` passes actual playback, pointer trimming, split, reorder, overlay typing/save, delete/undo, refresh and desktop/mobile layout using existing clips in a separate QA workspace.
- Automatic approval review rejected the proposed live AI text-help tests because external story-context transmission and possible usage costs were not explicitly approved under the earlier no-paid-generation constraint. Those calls were not run. No new paid image/video generation or export was submitted. Cloudflare credentials are present, but live token permission, inference and actual output quality remain unverified.

Local screenshots are under `.run-screenshots/guided-*` and `.run-screenshots/live-editor-*`. The QA browser profile and screenshots are ignored by Git. No credentials were retrieved from the browser, no additional models were deployed, and this revision did not deploy the website.
