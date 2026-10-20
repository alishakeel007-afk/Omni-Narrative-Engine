const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");
const types = loadTs("types/studio.ts");
class StudioError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

(async () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://demo.supabase.co" };
  const image = { id: "image", kind: "image", provider: "cloudflare", providerId: "image", status: "complete", stored: true,
    url: "https://demo.supabase.co/storage/v1/object/public/generated-images/studio/project/cloudflare/image.png", prompt: "A study", createdAt: new Date().toISOString() };
  const video = { ...image, id: "video", provider: "modal-ltx", kind: "video", providerId: "provider-video", url: "https://demo.supabase.co/storage/v1/object/public/generated-videos/studio/project/scene/video.mp4" };
  let state, active = 0, storageFailure = false, workerFailure = false, concurrent = false;
  const deleted = [], workerCalls = [];
  function reset(take = image) {
    state = { ...structuredClone(types.EMPTY_STUDIO), title: "Film", scenes: [{ id: "scene", title: "Study", description: "A study", characterIds: [], dialogues: [], takes: [structuredClone(take)], selectedImageId: take.kind === "image" ? take.id : undefined, selectedVideoId: take.kind === "video" ? take.id : undefined }], clips: [], history: { past: [{ clips: [{ sourceTakeId: take.id }] }], future: [] } };
    state.archivedScenes = structuredClone(state.scenes);
    state.scriptUndo = { scenes: structuredClone(state.scenes), characters: [], title: "Old", premise: "", world: "" };
    active = 0; storageFailure = false; workerFailure = false; concurrent = false; deleted.length = 0; workerCalls.length = 0;
  }
  reset();
  const prisma = { $transaction: async run => run(prisma), $queryRaw: async () => [{ state: structuredClone(state), revision: state.revision }],
    filmWorkspace: { update: async ({ data }) => { state = structuredClone(data.state); } }, filmSceneJob: { count: async () => active } };
  const store = { StudioError, loadStudio: async (owner, id) => { if (owner !== "owner" || id !== "project") throw new StudioError("Project not found.", 404); return { project: { id, userId: owner }, state: types.normalizeStudioState(structuredClone(state)) }; },
    saveStudio: async (loaded, next) => {
      if (concurrent) { concurrent = false; state.title = "A concurrent edit survives"; state.revision++; throw new StudioError("Changed", 409); }
      assert.equal(loaded.state.revision, state.revision); state = { ...structuredClone(next), revision: state.revision + 1 }; return structuredClone(state);
    } };
  const deletion = loadTs("lib/studio/take-deletion.ts", {
    "@/lib/prisma": { prisma }, "./store": store, "@/lib/env": { getEnvValue: names => env[names[0]] || "" },
    "@/lib/supabase-storage": { deleteFromSupabaseStorage: async value => {
      assert.equal(state.scenes[0].takes.length, 0, "The deletion receipt commits before irreversible file removal");
      assert.ok(state.takeDeletions[0].pending); deleted.push(value); if (storageFailure) throw new Error("Storage unavailable");
    } }, "./ltx": { ltxRequest: async (...args) => { workerCalls.push(args); if (workerFailure) throw new Error("Worker unavailable"); } },
  });
  const remove = (id = "image", owner = "owner") => deletion.deleteSceneTake(owner, "project", "scene", id);
  await assert.rejects(() => remove("image", "intruder"), /Project not found/);
  assert.equal(deleted.length, 0);
  for (const url of [image.url.replace("/project/", "/another/"), image.url.replace("generated-images", "avatars"), image.url.replace("demo.supabase.co", "evil.example")]) {
    reset({ ...image, url }); await assert.rejects(() => remove(), /outside|does not belong/); assert.equal(deleted.length, 0); assert.equal(state.scenes[0].takes.length, 1);
  }
  reset(); active = 1; await assert.rejects(() => remove(), /ongoing generation/); assert.equal(deleted.length, 0);
  reset(video); state.clips = [{ id: "clip", sourceTakeId: "video" }]; await assert.rejects(() => remove("video"), /Remove its clips/); assert.equal(deleted.length, 0);
  reset(); state.renderJobs = [{ status: "queued" }]; await assert.rejects(() => remove(), /export to finish/);
  reset(); concurrent = true;
  let result = await remove();
  assert.equal(result.error, undefined); assert.equal(result.state.title, "A concurrent edit survives");
  assert.equal(result.state.scenes[0].selectedImageId, undefined);
  assert.equal(result.state.archivedScenes[0].takes.length, 0); assert.equal(result.state.scriptUndo.scenes[0].takes.length, 0); assert.equal(result.state.history.past[0].clips.length, 0);
  assert.equal(result.state.takeDeletions[0].pending, undefined, "The full take metadata is dropped after cleanup");
  assert.deepEqual(deleted[0], { bucket: "generated-images", path: "studio/project/cloudflare/image.png", allowNotFound: true });
  await remove(); assert.equal(deleted.length, 1, "Repeated deletion is idempotent");
  // Old script snapshots and late worker publication cannot restore deleted takes.
  const restored = { ...structuredClone(state), scenes: [{ ...state.scenes[0], takes: [image], selectedImageId: "image" }] };
  assert.equal(types.normalizeStudioState(restored).scenes[0].takes.length, 0);
  const queue = loadTs("lib/studio/scene-jobs.ts", { "@/lib/prisma": { prisma }, "./store": store });
  assert.equal(await queue.publishSceneTake("owner", "project", "scene", image), true); assert.equal(state.scenes[0].takes.length, 0);
  reset(); state.scenes[0].takes[0].savedForLater = true; delete state.scenes[0].selectedImageId;
  assert.equal(await queue.publishSceneTake("owner", "project", "scene", { ...image }), true);
  assert.equal(state.scenes[0].takes[0].savedForLater, true, "A late worker publication preserves the user's choice to keep the old take collapsed");
  reset(); storageFailure = true; result = await remove();
  assert.match(result.error, /cleanup did not finish/); assert.ok(result.state.takeDeletions[0].pending); assert.equal(result.state.scenes[0].takes.length, 0);
  storageFailure = false; result = await remove(); assert.equal(result.error, undefined); assert.equal(result.state.takeDeletions[0].pending, undefined);
  reset(video); workerFailure = true; result = await remove("video"); assert.match(result.error, /cleanup did not finish/);
  assert.deepEqual(workerCalls[0], ["/jobs/provider-video/file", undefined, "DELETE"]);
  workerFailure = false; result = await remove("video"); assert.equal(result.error, undefined); assert.equal(workerCalls.length, 2);
  reset();
  let queued = 0, stale = false;
  prisma.$queryRaw = async strings => String(strings).includes("FilmWorkspace") ? [{ state: structuredClone(state), revision: state.revision + (stale ? 1 : 0) }] : [];
  prisma.filmSceneRevision = { upsert: async () => ({ id: "revision" }) };
  prisma.filmSceneThread = { create: async () => ({ id: "thread" }) };
  Object.assign(prisma.filmSceneJob, { findUnique: async () => null, findMany: async () => [], create: async ({ data }) => { queued++; return data; } });
  assert.equal((await queue.enqueueSceneJob("owner", "project", { requestId: "fresh", sceneId: "scene", text: "Generate a study", kind: "image", plan: false })).kind, "image");
  stale = true;
  await assert.rejects(() => queue.enqueueSceneJob("owner", "project", { requestId: "racing", sceneId: "scene", text: "Generate a study", kind: "image", plan: false }), /changed before generation was queued/);
  assert.equal(queued, 1, "A revision race with deletion cannot create another job");
  stale = false;
  state.takeDeletions = [{ takeId: "video", sceneId: "scene", kind: "video", deletedAt: new Date().toISOString() }];
  prisma.filmSceneJob.findFirst = async () => ({ id: "stopped", kind: "video", phase: "poll", status: "failed", providerTake: { id: "video" }, snapshot: { state: structuredClone(state) } });
  await assert.rejects(() => queue.changeSceneJob("owner", "project", "stopped", "retry"), /uses deleted media/, "Retry cannot re-archive a deliberately deleted source");
  // Confirm the actual HTTP storage helper deletes object bytes via the Storage API.
  const requests = [];
  const storage = loadTs("lib/supabase-storage.ts", { process: { env: { NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: "test-only" } }, fetch: async (...args) => { requests.push(args); return new Response("[]"); } });
  await storage.deleteFromSupabaseStorage({ bucket: "generated-images", path: "studio/project/cloudflare/image.png" });
  assert.equal(requests[0][0], "https://demo.supabase.co/storage/v1/object/generated-images"); assert.equal(requests[0][1].method, "DELETE"); assert.deepEqual(JSON.parse(requests[0][1].body), { prefixes: ["studio/project/cloudflare/image.png"] });
  console.log("PASS: owned take deletion, exact storage scope, active-generation/edit/export guards, retryable cleanup, idempotence, concurrent-edit preservation, Undo/late-publication protection and native-worker artifact removal. No real media deleted.");
})().catch(error => { console.error(error); process.exitCode = 1; });
