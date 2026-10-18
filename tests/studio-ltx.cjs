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
    NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-only-service",
  };
  const calls = [],
    uploads = [];
  const providerId = randomUUID();
  const ltx = loadTs("lib/studio/ltx.ts", {
    "@/lib/env": {
      getEnvValue: (names) =>
        names.map((name) => env[name]).find(Boolean) || "",
    },
    "./store": { StudioError },
    "@/lib/supabase-storage": {
      uploadToSupabaseStorage: async (input) => {
        uploads.push(input);
        return {
          publicUrl:
            "https://demo.supabase.co/storage/v1/object/public/generated-videos/clip.mp4",
        };
      },
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/file"))
        return new Response(Buffer.from("0000ftypisom"));
      if (url.includes("/jobs/"))
        return Response.json({
          status: "complete",
          has_audio: true,
          duration: 5,
        });
      if (url.includes("/object/sign/"))
        return Response.json({
          signedURL: "/object/sign/generated-videos/clip.mp4?token=temporary",
        });
      if (url.includes("/object/authenticated/"))
        return new Response(Buffer.from("image-bytes"), {
          headers: { "Content-Type": "image/png" },
        });
      return Response.json({ id: providerId });
    },
  });
  assert.ok(ltx.nativeVideoEnabled());
  assert.throws(() => ltx.mediaSource("https://evil.example/private"));
  assert.throws(() =>
    ltx.mediaSource("https://demo.supabase.co/rest/v1/users"),
  );
  const take = await ltx.startLtxVideo({
    prompt: "A director speaks over quiet piano.",
    imageUrl:
      "https://demo.supabase.co/storage/v1/object/public/generated-images/portrait.png",
    identity: [],
    continuityKey: "one",
    requestId: randomUUID(),
  });
  assert.equal(take.provider, "modal-ltx");
  assert.equal(take.nativeAudio, true);
  const submission = calls.find((call) => call.url.endsWith("/jobs"));
  assert.equal(submission.options.headers.Authorization, "Bearer test-only");
  assert.equal(
    JSON.parse(submission.options.body).image_base64,
    Buffer.from("image-bytes").toString("base64"),
  );
  await ltx.pollLtxVideo("project", "scene", take);
  assert.equal(take.status, "complete");
  assert.equal(take.stored, true);
  assert.equal(take.duration, 5);
  assert.equal(uploads.length, 1);
  await ltx.pollLtxVideo("project", "scene", take);
  assert.equal(uploads.length, 1);
  assert.equal(
    await ltx.exportSourceUrl(
      "https://demo.supabase.co/storage/v1/object/public/generated-videos/clip.mp4",
    ),
    "https://demo.supabase.co/storage/v1/object/sign/generated-videos/clip.mp4?token=temporary",
  );
  const { EMPTY_STUDIO, sceneEdit } = loadTs("types/studio.ts");
  let state = structuredClone(EMPTY_STUDIO);
  state.title = "Validation film";
  state.scenes = [
    {
      id: "s",
      title: "Opening",
      description: "A director speaks",
      characterIds: [],
      dialogues: [
        {
          character: "Director",
          text: "Our story starts here.",
          audioUrl: "https://unused.example/old-voice",
        },
      ],
      takes: [{ ...take, id: "take" }],
      selectedVideoId: "take",
    },
  ];
  state.timeline = ["s"];
  assert.equal(sceneEdit(state, "s").videoVolume, 1);
  assert.equal(sceneEdit(state, "s").voiceVolume, 0);
  let nativeInput;
  const media = loadTs("lib/studio/media.ts", {
    "./ltx": {
      nativeVideoEnabled: () => true,
      startLtxVideo: async (input) => {
        nativeInput = input;
        return input;
      },
    },
    "./store": { StudioError },
    "./logic": {
      scenePrompt: () => ({
        scene: state.scenes[0],
        cast: [],
        prompt: "A director at sunrise.",
        continuityKey: "one",
      }),
    },
  });
  await media.startMedia(state, "project", "s", "video", true, {
    instructions: "Warm delivery and quiet piano",
    requestId: "stable-request",
  });
  assert.ok(nativeInput.prompt.includes("Our story starts here."));
  assert.ok(nativeInput.prompt.includes("Warm delivery and quiet piano"));
  assert.equal(nativeInput.requestId, "stable-request");
  assert.equal(nativeInput.imageUrl, undefined);
  const { studioEditSchema } = loadTs("lib/studio/edits.ts");
  assert.ok(
    !studioEditSchema.safeParse({
      ...sceneEdit(state, "s"),
      texts: [
        {
          text: "Caption",
          x: 0.5,
          y: 0.9,
          size: 36,
          color: "red:inject",
          start: 0,
          end: 0,
        },
      ],
    }).success,
  );
  let authenticated = true,
    paidCalls = 0,
    failResponse = false;
  const requests = new Map();
  const route = loadTs("app/api/studio/[id]/render/route.ts", {
    "next/server": {
      NextResponse: { json: (value, init) => Response.json(value, init) },
    },
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: {
          getUser: async () => ({
            data: { user: authenticated ? { id: "owner" } : null },
          }),
        },
      }),
    },
    "@/lib/studio/store": {
      StudioError,
      loadStudio: async () => ({
        project: { id: "project", userId: "owner" },
        state: structuredClone(state),
      }),
      saveStudio: async (loaded, next) => {
        if (loaded.state.revision !== state.revision)
          throw new StudioError("Concurrent edit", 409);
        state = { ...structuredClone(next), revision: state.revision + 1 };
        return structuredClone(state);
      },
    },
    "@/lib/studio/ltx": {
      exportSourceUrl: async (url) => url + "?token=fresh",
      saveLtxArtifact: async () => ({
        publicUrl:
          "https://demo.supabase.co/storage/v1/object/public/generated-videos/film.mp4",
      }),
      ltxRequest: async (path, body) => {
        if (body) {
          if (!requests.has(body.request_id)) {
            requests.set(body.request_id, body);
            paidCalls++;
          }
          if (failResponse) {
            failResponse = false;
            throw new Error("Response lost after acceptance");
          }
          return Response.json({ id: providerId });
        }
        return Response.json({ status: "complete", has_audio: true });
      },
    },
  });
  const context = { params: Promise.resolve({ id: "project" }) };
  const post = (id) =>
    route.POST(
      new Request("https://app.example/render", {
        method: "POST",
        body: JSON.stringify({ requestId: id }),
      }),
      context,
    );
  const ids = [randomUUID(), randomUUID()];
  const results = await Promise.all(ids.map(post));
  assert.deepEqual(results.map((result) => result.status).sort(), [202, 409]);
  assert.equal(
    paidCalls,
    1,
    "Concurrent export requests reserve before billing",
  );
  const job = state.renderJobs[0];
  assert.equal(requests.get(job.requestId).clips[0].volume, 1);
  assert.equal(
    requests.get(job.requestId).clips[0].voices.length,
    0,
    "Native clips do not add legacy voice tracks",
  );
  state.messages.push({
    id: "new-chat",
    role: "user",
    text: "Keep working",
    tab: "plan",
  });
  state.revision++;
  const check = () =>
    route.GET(
      new Request("https://app.example/render?requestId=" + job.requestId),
      context,
    );
  assert.equal((await check()).status, 200);
  assert.equal((await check()).status, 200);
  assert.equal(state.exports.length, 1);
  assert.equal(state.messages.at(-1).id, "new-chat");
  assert.equal((await post(job.requestId)).status, 200);
  assert.equal(paidCalls, 1);
  failResponse = true;
  const retryId = randomUUID();
  assert.equal((await post(retryId)).status, 502);
  const retryJob = state.renderJobs.find((item) => item.requestId === retryId);
  assert.equal(retryJob.status, "submitting");
  state.edits.s = { ...sceneEdit(state, "s"), videoVolume: 0.1 };
  state.revision++;
  assert.equal(
    (
      await route.GET(
        new Request("https://app.example/render?requestId=" + retryId),
        context,
      )
    ).status,
    200,
  );
  assert.equal(paidCalls, 2, "Lost responses resume the same idempotent job");
  assert.equal(
    requests.get(retryId).clips[0].volume,
    1,
    "Retries retain the original immutable edit snapshot",
  );
  authenticated = false;
  assert.equal((await post(randomUUID())).status, 401);
  console.log(
    "PASS: LTX authentication, image conditioning, audio direction, native audio defaults, durable storage, signed export media, concurrent export reservations, immutable retry snapshots, lost-response recovery, and export persistence.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
