# Parallel scene conversations

Implemented on `new-ui`: persistent scene jobs, take revision threads, immutable requirement snapshots, scoped result publishing, and a background worker. The additive database migrations are applied. The web app and worker run separately; opening the web preview does not process queued generation jobs.

## Use the interface

1. Approve a story plan and open **Scenes**.
2. Send “Generate Scene 1,” then request Scene 2. Each request becomes a card; the composer is available again as soon as the job is accepted.
3. Choose **Refine this take** on a finished generation, or **Refine when ready** on an unfinished one. The composer names the exact revision target. Send the change in that thread.
4. **Back to all scenes** restores the overview. Other scene jobs continue independently. Threads and job results remain after a refresh.
5. Review the output and choose **Use this image** or **Add to film** explicitly. Original takes remain available; completion never selects a new take or changes the timeline automatically.

Scene-number targeting supports “Scene 2,” “2nd scene,” and “second scene.” Inside a revision thread, requests stay attached to its scene; return to the overview to target another scene. Generic image requests without a scene target retain the existing chat-image flow.

## Start and check the worker

```text
npm run studio:worker:check
npm run studio:worker
```

The first command only reads queue health. The second starts processing persisted jobs and can use configured LLM/media API credits. Run it in a separate terminal alongside `npm run dev`. `npm run dev:with-worker` explicitly starts both together. `npm run build` also builds the worker bundle; `npm start` starts only the web app, and a production Node worker needs its own long-lived process running `npm run studio:worker`. A serverless Next.js request is not the job runner. Restart the worker after changing its source code.

Two database-backed slots limit media jobs globally, including provider polling and review. A separate director lane answers non-generation scene questions while both render slots are occupied. Multiple web/worker processes share the same slots. Actual rendering overlap is subject to provider/account capacity.

With `STUDIO_VIDEO_BACKEND=modal-ltx`, both slots can submit independent video jobs and the director lane remains responsive, but the cost-controlled Modal deployment has `max_containers=1`: GPU inference is serialized there. Increase that Modal limit deliberately if simultaneous GPU rendering is needed; concurrent GPUs increase spending. Image jobs retain their configured image provider. See [native video setup](../workers/video/README.md).

## Requirements and character continuity

Every job records the approved story/world, scene and dialogue, character profiles and reference IDs, main conversation, source revision, accumulated thread instructions, and parent take. Director context produces a consolidated visual direction; raw effective requirements remain saved for auditing. A thread that exceeds the model context budget fails visibly instead of silently discarding requirements.

Refined images supply the actual parent image alongside character references. Character videos automatically queue a reference-image prerequisite when a checked frame is missing. This prerequisite also consumes provider credits. The video waits for that frame and a successful appearance check. Revisions of character videos reuse their saved reference frame. These video revisions generate a new take from the saved frame and directions; temporal video-to-video editing is not implemented.

The existing identity/appearance checks still gate image/video selection and export. Changed story, scene, dialogue, or character requirements make older queued or completed job results stale. Results remain available for review but cannot be selected against the changed requirements. Generative-model likeness remains probabilistic; these checks do not guarantee zero drift.

## Persistence and recovery

`FilmSceneThread`, `FilmSceneRevision`, `FilmSceneJob`, and `FilmSceneSlot` are PostgreSQL records protected by ownership checks and row-level policies. Each submitted request has a unique key. Only a short scheduling transaction holds the global advisory lock; model/provider calls happen outside it. Thread sequence numbers serialize that thread's dependencies, while independent threads run concurrently.

Workers save provider IDs before polling, renew a five-minute lease, and recover an interrupted accepted job from its saved ID. An interruption in the submission window without a confirmed provider ID becomes **needs attention**. It is not automatically resubmitted; check the provider account before requesting another paid render.

Each finished take is appended to its own scene using a fresh-state merge and optimistic revision retry. A simultaneous scene completion or Plan reply is preserved. No worker writes an old whole-project snapshot over the latest workspace. Existing takes and selected timeline entries are retained.

Queued cancellation stops unstarted work, including an unused automatic reference prerequisite. Cancellation cannot undo an already accepted provider render; that result finishes and remains available. Retry of an accepted job resumes its saved provider ID. Changes to requirements need a new submission with a new snapshot.

## Verification

```text
npm run test:studio:parallel
npm run test:studio:parallel:browser
npm run test:studio
npm run test:studio:browser
```

Queue tests use local database/provider fixtures to verify real overlapping worker execution, the two-slot limit, the independent director lane, scoped merges, parent pixels, cumulative requirements, reference-image-to-video dependencies, video revision frames, cancellation, stale results, idempotency, ownership, and interrupted-provider recovery. Browser fixtures check the actual studio UI, concurrent cards, revision targeting, explicit selection, persistence, and mobile rendering. They do not make live media requests or spend generation credits.
