const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");
class StudioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=",
  "base64",
);

async function testConsistency() {
  const { EMPTY_STUDIO } = loadTs("types/studio.ts");
  let imageConfig = { STUDIO_IMAGE_BACKEND: "magic-hour", STUDIO_MAGIC_HOUR_IMAGE_MODEL: "qwen-edit" };
  const configuredBackend = loadTs("lib/studio/image-backend.ts", {
    "@/lib/env": { getEnvValue: (names) => imageConfig[names[0]] || "" },
  });
  assert.equal(configuredBackend.imageBackend().referenceLimit, 3);
  imageConfig.STUDIO_IMAGE_BACKEND = "cloudflare";
  assert.equal(configuredBackend.imageBackend().referenceLimit, 4);
  assert.equal(configuredBackend.imageBackend().cloudflare, true);
  imageConfig.STUDIO_IMAGE_BACKEND = "qwen";
  assert.equal(configuredBackend.imageBackend().referenceLimit, 6);
  const identity = loadTs("lib/studio/identity.ts");
  const character = {
    id: "elara",
    name: "Elara",
    appearance: "Dark curls, a blue coat and brass goggles.",
    locked: true,
    referenceId: "front",
    references: [
      { id: "front", label: "Front" },
      { id: "side", label: "Left profile" },
      { id: "body", label: "Full body" },
    ],
  };
  const profile = identity.identityProfile(character);
  assert.deepEqual(Array.from(profile.referenceIds), ["front", "side", "body"]);
  const partner = {
    ...character,
    id: "jax",
    name: "Jax",
    referenceId: "robot",
    references: [
      { id: "robot", label: "Front" },
      { id: "robot-side", label: "Side" },
    ],
  };
  assert.deepEqual(
    Array.from(
      identity.conditioningReferences(
        [profile, identity.identityProfile(partner)],
        4,
      ),
    ),
    ["front", "robot", "side", "robot-side"],
  );
  const state = structuredClone(EMPTY_STUDIO);
  state.characters = [character];
  const scene = {
    id: "scene",
    title: "Rooftop",
    description: "Elara looks over the city.",
    characterIds: ["elara"],
    dialogues: [],
    takes: [],
    selectedVideoId: "take",
  };
  state.scenes = [scene];
  state.timeline = ["scene"];
  const take = {
    id: "take",
    providerId: "provider",
    kind: "video",
    status: "complete",
    url: "https://videos.magichour.ai/video.mp4",
    prompt: "Scene",
    identity: [profile],
    continuity: { status: "pending", method: "visual-review" },
  };
  scene.takes = [take];
  assert.match(
    identity.continuityProblem(state, scene, take),
    /successful appearance check/,
  );
  take.continuity.status = "failed";
  assert.match(identity.filmContinuityProblem(state), /drift/);
  take.continuity.status = "review";
  assert.match(
    identity.filmContinuityProblem(state),
    /successful appearance check/,
  );
  take.continuity.status = "passed";
  assert.equal(identity.filmContinuityProblem(state), undefined);
  character.references.push({ id: "new-view", label: "Right profile" });
  assert.match(identity.filmContinuityProblem(state), /changed/);
  character.references.pop();
  character.locked = false;
  assert.match(identity.filmContinuityProblem(state), /lock/);
  character.locked = true;
  const unknown = { ...scene, characterIds: ["missing"] };
  assert.match(identity.continuityProblem(state, unknown, take), /missing/);
  console.log(
    "PASS: multiple reference views, fair cast conditioning, unlocked/stale/failed/uncertain take rejection and film export gate.",
  );

  let verdict = "match";
  let omitCharacter = false;
  let reviewAttachments;
  let fetches = 0;
  const checker = loadTs("lib/studio/continuity.ts", {
    "./store": {
      StudioError,
      referenceData: async () => ({
        mimeType: "image/png",
        data: png.toString("base64"),
      }),
    },
    "@/lib/env": { getEnvValue: () => "https://example.supabase.co" },
    "./ai": {
      askModel: async (_, attachments) => {
        reviewAttachments = attachments;
        return {
          checks: omitCharacter
            ? []
            : [
                {
                  characterId: "elara",
                  verdict,
                  notes: "Visible hair and outfit comparison.",
                  timestamps: ["00:01"],
                },
              ],
        };
      },
    },
    fetch: async () => {
      fetches++;
      return new Response(png, { headers: { "Content-Type": "video/mp4" } });
    },
  });
  assert.equal((await checker.reviewTake("project", take)).status, "passed");
  assert.equal(reviewAttachments.length, 4);
  assert.equal(reviewAttachments.at(-1).mimeType, "video/mp4");
  verdict = "mismatch";
  assert.equal((await checker.reviewTake("project", take)).status, "failed");
  verdict = "uncertain";
  assert.equal((await checker.reviewTake("project", take)).status, "review");
  omitCharacter = true;
  await assert.rejects(
    () => checker.reviewTake("project", take),
    /incomplete result/,
  );
  const previousFetches = fetches;
  await assert.rejects(
    () =>
      checker.reviewTake("project", {
        ...take,
        url: "http://127.0.0.1/private",
      }),
    /Unsupported/,
  );
  assert.equal(fetches, previousFetches);
  console.log(
    "PASS: multi-image plus video review inputs, conservative uncertainty, mismatch detection, incomplete result rejection and media-source restriction.",
  );
  let visionBody;
  const vision = loadTs("lib/studio/ai.ts", {
    "./store": { StudioError },
    "@/lib/env": { getEnvValue: () => "test-key" },
    fetch: async (_, options) => {
      visionBody = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  });
  await vision.askModel("Review", [
    { mimeType: "image/png", data: png.toString("base64") },
    { mimeType: "video/webm", data: "dGVzdA==" },
  ]);
  const parts = visionBody.contents[0].parts;
  assert.equal(parts.length, 3);
  assert.equal(parts[2].videoMetadata.fps, 24);
  assert.equal(parts[1].inlineData.mimeType, "image/png");

  const workerCalls = [];
  const uploads = [];
  const env = {
    STUDIO_QWEN_URL: "https://worker.example",
    STUDIO_QWEN_TOKEN: "a".repeat(40),
  };
  const qwen = loadTs("lib/studio/qwen.ts", {
    "./store": {
      StudioError,
      referenceData: async (_, id) => ({
        data: png.toString("base64"),
        mimeType: "image/png",
        id,
      }),
    },
    "@/lib/env": { getEnvValue: (names) => env[names[0]] || "" },
    "@/lib/supabase-storage": {
      uploadToSupabaseStorage: async (options) => {
        uploads.push(options);
        return { publicUrl: "https://example.supabase.co/image.png" };
      },
    },
    fetch: async (url, options) => {
      workerCalls.push({ url, options });
      return new Response(
        JSON.stringify(
          options.method === "POST"
            ? { id: "qwen-job" }
            : {
                status: "complete",
                mimeType: "image/png",
                data: png.toString("base64"),
              },
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    },
  });
  const request = {
    prompt: "Elara on a rooftop",
    referenceIds: ["front", "side"],
    identity: [profile],
  };
  const job = await qwen.startQwenImage("project", request);
  assert.equal(job.provider, "qwen");
  assert.equal(job.continuity.status, "pending");
  const firstPayload = JSON.parse(workerCalls[0].options.body);
  assert.equal(firstPayload.images.length, 2);
  assert.ok(firstPayload.images[0].data);
  assert.equal(
    workerCalls[0].options.headers.Authorization,
    `Bearer ${env.STUDIO_QWEN_TOKEN}`,
  );
  await qwen.startQwenImage("project", request);
  assert.equal(JSON.parse(workerCalls[1].options.body).seed, firstPayload.seed);
  await qwen.startQwenImage("project", { ...request, variation: 1 });
  assert.notEqual(
    JSON.parse(workerCalls[2].options.body).seed,
    firstPayload.seed,
  );
  await qwen.pollQwenImage("project", job);
  assert.equal(job.stored, true);
  assert.equal(uploads[0].bucket, "generated-images");
  assert.equal(uploads[0].contentType, "image/png");
  assert.equal(job.url, "https://example.supabase.co/image.png");
  await assert.rejects(
    () =>
      qwen.startQwenImage("project", { prompt: "Landscape", referenceIds: [] }),
    /reference first/,
  );
  env.STUDIO_QWEN_URL = "http://untrusted.example";
  await assert.rejects(() => qwen.startQwenImage("project", request), /HTTPS/);
  console.log(
    "PASS: authenticated Qwen jobs, real reference bytes, reproducible profile seed, explicit variation, PNG validation and durable output storage.",
  );

  let user = { id: "owner" };
  let saved = structuredClone(state);
  let checks = 0;
  const store = {
    StudioError,
    loadStudio: async (owner, id) => {
      if (owner !== "owner" || id !== "project")
        throw new StudioError("Project not found", 404);
      return { project: { id, userId: owner }, state: structuredClone(saved) };
    },
    saveStudio: async (loaded, next) => {
      assert.equal(loaded.state.revision, saved.revision);
      saved = { ...structuredClone(next), revision: saved.revision + 1 };
      return saved;
    },
    referenceData: async () => ({
      mimeType: "image/png",
      data: png.toString("base64"),
    }),
  };
  const auth = {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
  };
  const next = {
    NextResponse: {
      json: (body, options) => ({ body, status: options?.status || 200 }),
    },
  };
  let reviewStatus = "passed";
  const route = loadTs("app/api/studio/[id]/route.ts", {
    "next/server": next,
    "@/lib/supabase/server": auth,
    "@/lib/studio/store": store,
    // Only DELETE queries the database; these assertions never reach it.
    "@/lib/prisma": {},
    "@/lib/studio/ai": {},
    "@/lib/audio/music-service": {},
    "@/lib/studio/media": {
      magicHour: async () => ({
        status: "complete",
        downloads: [{ url: "https://videos.magichour.ai/take.mp4" }],
      }),
      archiveTake: async (_, __, take) => {
        take.stored = true;
      },
    },
    "@/lib/studio/continuity": {
      reviewTake: async () => {
        checks++;
        assert.ok(saved.operation, "Reserve before billed visual checking");
        return { status: reviewStatus, method: "visual-review" };
      },
    },
  });
  const context = { params: Promise.resolve({ id: "project" }) };
  const post = (body) => route.POST({ json: async () => body }, context);
  saved.scenes[0].takes[0].continuity.status = "pending";
  assert.equal(
    (await post({ action: "select", sceneId: "scene", takeId: "take" })).status,
    400,
  );
  assert.equal((await post({ action: "poll" })).status, 200);
  assert.equal(checks, 1);
  assert.equal(saved.operation, undefined);
  assert.equal(
    (await post({ action: "select", sceneId: "scene", takeId: "take" })).status,
    200,
  );
  assert.equal((await post({ action: "poll" })).status, 200);
  assert.equal(
    checks,
    1,
    "Passed checks must not be automatically billed again",
  );
  reviewStatus = "review";
  await post({ action: "reviewTake", sceneId: "scene", takeId: "take" });
  assert.equal(
    (await post({ action: "timeline", sceneIds: ["scene"] })).status,
    400,
  );
  assert.equal(
    (
      await post({
        action: "reference",
        characterId: "elara",
        referenceId: "foreign-ref",
        operation: "primary",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await post({
        action: "reference",
        characterId: "elara",
        referenceId: "side",
        operation: "primary",
      })
    ).status,
    200,
  );
  assert.equal(saved.characters[0].referenceId, "side");
  assert.equal(saved.characters[0].locked, false);
  assert.equal(
    (
      await post({
        action: "reference",
        characterId: "elara",
        referenceId: "body",
        operation: "remove",
      })
    ).status,
    200,
  );
  assert.equal(saved.characters[0].references.length, 2);
  let analysisViews;
  const referenceRoute = loadTs("app/api/studio/[id]/reference/route.ts", {
    "next/server": next,
    "@/lib/supabase/server": auth,
    "@/lib/studio/store": store,
    "@/lib/prisma": {
      prisma: {
        filmReference: {
          create: async () => ({ id: "new-side" }),
          delete: async () => {},
        },
      },
    },
    "@/lib/studio/ai": {
      analyseCharacter: async (images) => {
        analysisViews = images.length;
        return { appearance: "Canonical profile from all available views." };
      },
    },
  });
  const form = new FormData();
  form.append("file", new File([png], "angle.png", { type: "image/png" }));
  form.append("name", "Elara");
  form.append("view", "Right profile");
  assert.equal(
    (await referenceRoute.POST({ formData: async () => form }, context)).status,
    200,
  );
  assert.equal(analysisViews, 3);
  assert.equal(
    saved.characters[0].referenceId,
    "side",
    "An added angle must retain the primary view",
  );
  assert.equal(saved.characters[0].references.length, 3);
  assert.equal(saved.characters[0].locked, false);
  assert.equal(
    (
      await referenceRoute.GET(
        new Request("https://app.example?referenceId=new-side"),
        context,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await referenceRoute.GET(
        new Request("https://app.example?referenceId=unattached"),
        context,
      )
    ).status,
    404,
  );
  user = { id: "intruder" };
  assert.equal(
    (await referenceRoute.POST({ formData: async () => form }, context)).status,
    404,
  );
  console.log(
    "PASS: reserved one-time automatic checking, API selection/timeline gates, scoped primary/removal controls, multi-view profile analysis and reference ownership.",
  );
}
module.exports = testConsistency;
if (require.main === module)
  testConsistency().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
