const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { loadTs } = require("../scripts/test-studio.cjs");
const { memoryQueue } = require("./scene-queue-memory.cjs");
(async () => {
  const { db, tables } = memoryQueue();
  const { EMPTY_STUDIO } = loadTs("types/studio.ts");
  const { identityProfile } = loadTs("lib/studio/identity.ts");
  const state = structuredClone(EMPTY_STUDIO);
  state.title = "The Lightkeeper";
  state.premise = "Keep the city safe";
  state.world = "A green coast";
  state.messages.push({
    id: "decision",
    role: "user",
    text: "Keep every important character detail and the quiet atmosphere.",
    tab: "plan",
    createdAt: new Date().toISOString(),
  });
  state.scenes = [1, 2].map((n) => ({
    id: `scene-${n}`,
    title: `Scene ${n} opening`,
    description: `A lighthouse in scene ${n}`,
    characterIds: [],
    dialogues: [],
    takes: [],
  }));
  const project = await db.filmWorkspace.create({
    data: { userId: "owner", state, title: state.title },
  });
  let starts = 0,
    hold = true,
    polls = [],
    throwSubmission = false;
  const contexts = [],
    renderInputs = [];
  const mocks = {
    "@/lib/prisma": { prisma: db },
    "./ai": {
      askModel: async (prompt) => {
        contexts.push(prompt);
        return {
          prompt: "Preserve the setting and requested light.",
          reply: "Here is the revised direction.",
        };
      },
      directorReply: async () => ({
        reply: "Try a low camera angle.",
        choices: [],
      }),
    },
    "./media": {
      startMedia: async (snapshot, workspace, scene, kind, direct, options) => {
        starts++;
        renderInputs.push({
          snapshot,
          workspace,
          scene,
          kind,
          direct,
          options,
        });
        if (throwSubmission) throw new Error("Unconfirmed response");
        const identity = snapshot.characters
          .filter((character) =>
            snapshot.scenes
              .find((item) => item.id === scene)
              .characterIds.includes(character.id),
          )
          .map(identityProfile);
        return {
          id: randomUUID(),
          providerId: `provider-${starts}`,
          status: "queued",
          kind,
          prompt: options.instructions,
          createdAt: new Date().toISOString(),
          identity,
          ...(identity.length
            ? { continuity: { status: "pending", method: "visual-review" } }
            : {}),
        };
      },
      magicHour: async (path) => {
        if (hold) await new Promise((resolve) => polls.push(resolve));
        return {
          status: "complete",
          downloads: [{ url: "https://storage.example/storage/v1/object/public/generated-images/result.png" }],
        };
      },
      archiveTake: async (_workspace, _scene, take) => {
        take.stored = true;
      },
    },
    "./qwen": { pollQwenImage: async () => {} },
    "./continuity": {
      reviewTake: async () => ({ status: "passed", method: "visual-review" }),
    },
    fetch: async () =>
      new Response(
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=",
          "base64",
        ),
        { headers: { "Content-Type": "image/png" } },
      ),
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage.example";
  const cache = {};
  const queue = loadTs("lib/studio/scene-jobs.ts", mocks, cache);
  const worker = loadTs("lib/studio/scene-worker.ts", mocks, cache);
  const input = (text, extra = {}) => ({
    requestId: randomUUID(),
    text,
    ...extra,
  });
  assert.equal(
    queue.resolveScene(state, "Generate the 2nd scene").id,
    "scene-2",
  );
  assert.equal(
    queue.resolveScene(state, "Render the first scene").id,
    "scene-1",
  );
  assert.equal(queue.requestedKind("Don't generate scene 1"), "chat");
  assert.equal(queue.requestedKind("How do I generate scene 1?"), "chat");
  const request = input("Generate Scene 1", { kind: "image" });
  const first = await queue.enqueueSceneJob("owner", project.id, request);
  assert.equal(
    (await queue.enqueueSceneJob("owner", project.id, request)).id,
    first.id,
  );
  const second = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Generate Scene 2", { kind: "image" }),
  );
  await assert.rejects(
    queue.enqueueSceneJob("stranger", project.id, input("Generate Scene 1")),
    (error) => error.status === 404,
  );
  const a = await worker.acquireSceneJob(),
    b = await worker.acquireSceneJob();
  assert.ok(a && b);
  assert.equal(await worker.acquireSceneJob(), null);
  const work = [worker.runSceneJob(a), worker.runSceneJob(b)];
  while (polls.length < 2)
    await new Promise((resolve) => setTimeout(resolve, 1));
  assert.equal(starts, 2, "Both providers start before either finishes");
  assert.equal(
    await worker.acquireSceneJob(),
    null,
    "Global two-slot allowance holds while providers render",
  );
  const question = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("How should I pace Scene 1?", { kind: "chat" }),
  );
  const conversation = await worker.acquireSceneJob("chat");
  assert.equal(conversation.job.id, question.id);
  await worker.runSceneJob(conversation);
  assert.equal(tables.filmSceneJob.get(question.id).status, "complete");
  assert.equal(
    starts,
    2,
    "Director replies must not wait for rendering slots or start another render",
  );
  const latest = tables.filmWorkspace.get(project.id);
  latest.state.messages.push({
    id: "new-chat",
    role: "user",
    text: "A new planning decision while rendering.",
    tab: "plan",
  });
  latest.revision++;
  latest.state.revision = latest.revision;
  hold = false;
  polls.splice(0).forEach((resolve) => resolve());
  await Promise.all(work);
  const saved = tables.filmWorkspace.get(project.id).state;
  assert.equal(saved.scenes[0].takes.length, 1);
  assert.equal(saved.scenes[1].takes.length, 1);
  assert.ok(
    saved.messages.some((message) => message.id === "new-chat"),
    "Publishing both jobs must preserve concurrent chat",
  );
  assert.ok(
    contexts.every(
      (prompt) =>
        prompt.includes("quiet atmosphere") && prompt.includes("green coast"),
    ),
    "Jobs retain global requirements",
  );
  assert.equal(tables.filmSceneJob.get(first.id).status, "complete");
  const parent = saved.scenes[0].takes[0];
  const branch = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Keep everything but make the lighting warmer.", {
      parentTakeId: parent.id,
      sceneId: "scene-1",
    }),
  );
  assert.notEqual(branch.threadId, first.threadId);
  assert.ok(branch.snapshot.history.some((turn) => turn.text === request.text));
  const branchClaim = await worker.acquireSceneJob();
  await worker.runSceneJob(branchClaim);
  const afterBranch = tables.filmWorkspace.get(project.id).state;
  assert.equal(afterBranch.scenes[0].takes.length, 2);
  assert.equal(
    afterBranch.scenes[0].takes[0].id,
    parent.id,
    "Original take is preserved",
  );
  assert.equal(afterBranch.scenes[0].takes[1].parentTakeId, parent.id);
  assert.ok(
    renderInputs.at(-1).options.parentReferenceId,
    "The parent image is passed as actual image conditioning",
  );
  assert.ok(
    [...tables.filmReference.values()][0].content.includes("image/png"),
  );
  const waitingParent = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Generate Scene 2 again", { kind: "image" }),
  );
  const child = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Make its light warmer.", {
      parentJobId: waitingParent.id,
      sceneId: "scene-2",
    }),
  );
  assert.equal(child.status, "waiting");
  const parentClaim = await worker.acquireSceneJob();
  assert.equal(parentClaim.job.id, waitingParent.id);
  assert.equal(
    await worker.acquireSceneJob(),
    null,
    "A child waits for its actual parent result",
  );
  await worker.runSceneJob(parentClaim);
  const childClaim = await worker.acquireSceneJob();
  assert.equal(childClaim.job.id, child.id);
  await worker.runSceneJob(childClaim);
  const cancelled = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Generate Scene 2", { kind: "image" }),
  );
  await queue.changeSceneJob("owner", project.id, cancelled.id, "cancel");
  assert.equal(await worker.acquireSceneJob(), null);
  const stale = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Generate Scene 1", { kind: "image" }),
  );
  tables.filmWorkspace.get(project.id).state.scenes[0].description =
    "A completely changed scene";
  const beforeStale = starts;
  await worker.runSceneJob(await worker.acquireSceneJob());
  assert.equal(tables.filmSceneJob.get(stale.id).status, "stale");
  assert.equal(starts, beforeStale);
  const uncertain = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Generate Scene 1", { kind: "image" }),
  );
  throwSubmission = true;
  await worker.runSceneJob(await worker.acquireSceneJob());
  throwSubmission = false;
  assert.equal(tables.filmSceneJob.get(uncertain.id).status, "needs_attention");
  await assert.rejects(
    queue.changeSceneJob("owner", project.id, uncertain.id, "retry"),
  );
  const recovery = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Generate Scene 1", { kind: "image" }),
  );
  const crashed = await worker.acquireSceneJob();
  tables.filmSceneJob.get(recovery.id).phase = "poll";
  tables.filmSceneJob.get(recovery.id).providerTake = {
    ...parent,
    id: randomUUID(),
    providerId: "already-accepted",
    sourceRequirements: recovery.snapshot.requirements,
    jobId: recovery.id,
    status: "queued",
    stored: false,
  };
  tables.filmSceneSlot.get(crashed.slotId).leaseUntil = new Date(0);
  const beforeRecovery = starts;
  await worker.runSceneJob(await worker.acquireSceneJob());
  assert.equal(
    starts,
    beforeRecovery,
    "Restart recovery must use the saved provider ID",
  );
  assert.equal(tables.filmSceneJob.get(recovery.id).status, "complete");
  const castState = tables.filmWorkspace.get(project.id).state;
  castState.characters = [
    {
      id: "keeper",
      name: "Keeper",
      appearance: "Red coat and brass goggles",
      locked: true,
      referenceId: "character-pixels",
    },
  ];
  castState.scenes[1].characterIds = ["keeper"];
  const characterVideo = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Generate Scene 2"),
  );
  const referenceJob = tables.filmSceneJob.get(characterVideo.dependsOnId);
  assert.equal(referenceJob.kind, "image");
  assert.equal(characterVideo.status, "waiting");
  assert.equal(characterVideo.snapshot.direct, false);
  await queue.changeSceneJob("owner", project.id, characterVideo.id, "cancel");
  assert.equal(
    tables.filmSceneJob.get(referenceJob.id).status,
    "cancelled",
    "Cancelling an unstarted video also stops its unused automatic reference job",
  );
  const readyVideo = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Generate Scene 2"),
  );
  await worker.runSceneJob(await worker.acquireSceneJob());
  const frame = tables.filmSceneJob.get(readyVideo.dependsOnId).result.take;
  assert.equal(frame.continuity.status, "passed");
  await worker.runSceneJob(await worker.acquireSceneJob());
  assert.equal(renderInputs.at(-1).direct, false);
  assert.equal(
    renderInputs.at(-1).snapshot.scenes.find((scene) => scene.id === "scene-2")
      .selectedImageId,
    frame.id,
  );
  const movie = tables.filmSceneJob.get(readyVideo.id).result.take;
  assert.equal(movie.parentTakeId, frame.id);
  const movieRevision = await queue.enqueueSceneJob(
    "owner",
    project.id,
    input("Keep the character and make the light warmer.", {
      parentTakeId: movie.id,
      sceneId: "scene-2",
    }),
  );
  await worker.runSceneJob(await worker.acquireSceneJob());
  assert.equal(
    renderInputs.at(-1).direct,
    false,
    "A character video revision must reuse its saved reference frame",
  );
  assert.equal(tables.filmSceneJob.get(movieRevision.id).status, "complete");
  let account = null;
  const endpoint = loadTs(
    "app/api/studio/[id]/jobs/route.ts",
    {
      ...mocks,
      "@/lib/supabase/server": {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: account } }) },
        }),
      },
    },
    cache,
  );
  const routeContext = { params: Promise.resolve({ id: project.id }) };
  assert.equal(
    (await endpoint.GET(new Request("https://local/jobs"), routeContext))
      .status,
    401,
  );
  account = { id: "stranger" };
  assert.equal(
    (await endpoint.GET(new Request("https://local/jobs"), routeContext))
      .status,
    404,
  );
  account = { id: "owner" };
  const acceptedBefore = starts;
  const posted = await endpoint.POST(
    new Request("https://local/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        ...input("How can I improve Scene 1?", { kind: "chat" }),
      }),
    }),
    routeContext,
  );
  assert.equal(posted.status, 202);
  assert.equal(
    starts,
    acceptedBefore,
    "The HTTP endpoint only queues work and never calls a provider",
  );
  assert.equal(
    (await endpoint.GET(new Request("https://local/jobs"), routeContext))
      .status,
    200,
  );
  console.log(
    "PASS: real two-job overlap, durable global slots, scoped concurrent merges, exact scene targeting, immutable context, revision branches and parent pixels, dependency ordering, cancellation, stale prevention, uncertain submission protection, ownership, replay, and saved-provider recovery.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
