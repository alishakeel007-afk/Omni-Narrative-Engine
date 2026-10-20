const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { loadTs } = require("../scripts/test-studio.cjs");

class StudioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

(async () => {
  const env = {
    STUDIO_VIDEO_BACKEND: "modal-ltx",
    STUDIO_LTX_URL: "https://worker.example",
    STUDIO_LTX_TOKEN: "test-only",
  };
  let job, loseResponse = true, paidCalls = 0, directorCalls = 0, mediaCalls = 0;
  let pollFailure = false;
  const requests = new Map(), calls = [], limits = [], published = [];
  const state = { title: "Film", characters: [], messages: [], scenes: [{ id: "scene", title: "The Fade", takes: [] }] };
  const ltx = loadTs("lib/studio/ltx.ts", {
    "@/lib/env": { getEnvValue: (names) => names.map((name) => env[name]).find(Boolean) || "" },
    "./store": { StudioError },
    AbortSignal: { timeout: (ms) => { limits.push(ms); return new AbortController().signal; } },
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(job.snapshot.ltxSubmission.requestId, body.request_id, "Final input commits before contacting the provider");
      // Model the worker's reservation and requirements check before billing.
      const existing = requests.get(body.request_id);
      if (existing && JSON.stringify(existing.body) !== JSON.stringify(body))
        return Response.json({ detail: "This request ID belongs to different requirements." }, { status: 409 });
      if (!existing) {
        paidCalls++;
        requests.set(body.request_id, { body, id: randomUUID() });
      }
      calls.push(body);
      if (loseResponse) {
        loseResponse = false;
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }
      return Response.json({ id: requests.get(body.request_id).id });
    },
  });
  const prisma = {
    $transaction: async (callback) => callback(prisma),
    $queryRaw: async strings => String(strings).includes("FilmWorkspace") ? [{ state: structuredClone(state) }] : [{ token: "lease", leaseUntil: new Date(Date.now() + 300000) }],
    filmSceneJob: {
      findFirst: async () => structuredClone(job),
      findUnique: async () => structuredClone(job),
      findUniqueOrThrow: async () => structuredClone(job),
      findMany: async () => [structuredClone(job)],
      update: async ({ data }) => {
        job = { ...job, ...structuredClone(data) };
        return structuredClone(job);
      },
      updateMany: async ({ where, data }) => {
        if (where.status !== job.status) return { count: 0 };
        job = { ...job, ...structuredClone(data) };
        return { count: 1 };
      },
    },
    filmSceneSlot: { findFirst: async () => ({}), updateMany: async () => ({ count: 1 }) },
    filmSceneThread: { findMany: async () => [] },
  };
  const store = { StudioError, loadStudio: async () => ({ state: structuredClone(state) }) };
  const jobApi = loadTs("lib/studio/scene-jobs.ts", {
    "@/lib/prisma": { prisma },
    "./store": store,
    "./ltx": ltx,
  });
  const worker = loadTs("lib/studio/scene-worker.ts", {
    "@/lib/prisma": { prisma },
    "./store": store,
    "./identity": { sceneRequirements: () => "requirements" },
    "./ai": { askModel: async () => { directorCalls++; return { prompt: "Saved director direction", reply: "Ready" }; } },
    "./media": {
      startMedia: async (_state, _workspace, _scene, _kind, _direct, options) => {
        mediaCalls++;
        return ltx.startLtxVideo({
          prompt: options.instructions || "The scene as written",
          identity: [], continuityKey: "key", seconds: 5, requestId: options.requestId,
        }, options.onLtxSubmission);
      },
    },
    "./ltx": {
      ...ltx,
      pollLtxVideo: async (_workspace, _scene, take) => {
        if (pollFailure) { pollFailure = false; throw new DOMException("timeout", "TimeoutError"); }
        Object.assign(take, { status: "complete", stored: true, url: "https://storage.example/video.mp4" });
      },
    },
    "./scene-jobs": {
      json: (value) => JSON.parse(JSON.stringify(value)),
      publishSceneTake: async (_user, _workspace, _scene, take) => { published.push(take); return true; },
    },
  });
  function fresh(overrides = {}) {
    return {
      id: randomUUID(), userId: "owner", workspaceId: "workspace", sceneId: "scene", threadId: "thread",
      kind: "video", status: "running", phase: "prepare", providerTake: null, cancelRequested: false,
      snapshot: { state: structuredClone(state), requirements: "requirements", history: [], plan: true, direct: true },
      ...overrides,
    };
  }
  const run = () => worker.runSceneJob({ slotId: 1, token: "lease", job: structuredClone(job) });

  // A response is lost AFTER acceptance. A restart and manual retry must use
  // the persisted final prompt and stable ID without another director call.
  job = fresh();
  await run();
  assert.equal(job.status, "needs_attention");
  assert.equal(job.phase, "submitting");
  assert.equal(job.providerTake, null);
  assert.match(job.error, /120 seconds/);
  assert.equal(job.snapshot.ltxSubmission.requestId, job.id);
  assert.equal(directorCalls, 1);
  const listing = await jobApi.listSceneJobs("owner", "workspace");
  assert.equal(listing.jobs[0].retryable, true);
  assert.equal("snapshot" in listing.jobs[0], false, "Private submission inputs never enter the queue response");
  await jobApi.changeSceneJob("owner", "workspace", job.id, "retry");
  assert.equal(job.status, "queued");
  assert.equal(job.phase, "submitting");
  assert.equal(job.error, null);
  await run();
  assert.equal(job.status, "complete");
  assert.equal(paidCalls, 1);
  assert.equal(directorCalls, 1);
  assert.equal(mediaCalls, 1);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(job.providerTake.providerId, requests.get(job.id).id);
  assert.equal(job.providerTake.jobId, job.id);
  assert.equal(published.length, 1);
  assert.deepEqual(limits, [120000, 120000]);

  // Existing scene-as-written failures predate persisted final inputs. They
  // rebuild from their immutable snapshot, retaining the original request ID.
  job = fresh({ status: "needs_attention", phase: "submitting" });
  job.snapshot.plan = false;
  const originalId = job.id;
  requests.set(originalId, { id: "legacy-accepted", body: {
    request_id: originalId, prompt: "The scene as written",
    seed: require("node:crypto").createHash("sha256").update(originalId).digest().readUInt32BE(0),
    width: 1024, height: 576, num_frames: 121,
  } });
  const billedBeforeLegacyRetry = paidCalls;
  await jobApi.changeSceneJob("owner", "workspace", job.id, "retry");
  await run();
  assert.equal(job.status, "complete");
  assert.equal(calls.at(-1).request_id, originalId);
  assert.equal(job.providerTake.providerId, "legacy-accepted");
  assert.equal(paidCalls, billedBeforeLegacyRetry);
  assert.equal(directorCalls, 1);

  // Uncertain non-idempotent providers and unsaved rewrites remain guarded,
  // and the page must not offer a button that the server will reject.
  for (const kind of ["image", "video"]) {
    job = fresh({ kind, status: "needs_attention", phase: "submitting" });
    assert.equal((await jobApi.listSceneJobs("owner", "workspace")).jobs[0].retryable, false);
    await assert.rejects(() => jobApi.changeSceneJob("owner", "workspace", job.id, "retry"), /cannot be automatically retried/);
  }

  // Once a provider ID exists, a polling failure resumes it without any POST.
  job = fresh({ phase: "poll", providerTake: { id: "take", provider: "modal-ltx", providerId: "accepted", kind: "video", status: "queued" } });
  pollFailure = true;
  await run();
  assert.equal(job.status, "failed");
  const submissions = calls.length;
  await jobApi.changeSceneJob("owner", "workspace", job.id, "retry");
  await run();
  assert.equal(job.status, "complete");
  assert.equal(calls.length, submissions);
  job = fresh();
  job.snapshot.plan = false;
  job.snapshot.instructions = "Keep the notebook closed and preserve the blue evening light.";
  await run();
  assert.equal(job.status, "complete");
  assert.equal(calls.at(-1).prompt, job.snapshot.instructions, "Scene-as-written jobs retain additional generation instructions");
  console.log("PASS: lost submission response recovery, durable final input, legacy timeout retries, single billing, retry availability, and saved-render polling recovery.");
})().catch((error) => { console.error(error); process.exitCode = 1; });
