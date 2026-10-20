const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");
const { EMPTY_STUDIO } = loadTs("types/studio.ts");
const { referenceTakeProblem, sceneReferenceProblem } = loadTs("lib/film/reference.ts");
const identity = loadTs("lib/studio/identity.ts");
class StudioError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

(async () => {
  const scene = { id: "s", title: "The study", description: "A writer sits at a desk beside a window.", characterIds: [], dialogues: [], takes: [] };
  let state = { ...structuredClone(EMPTY_STUDIO), title: "Film", scenes: [scene] };
  const image = { id: "image", providerId: "image-provider", kind: "image", status: "complete", prompt: "The opening frame", url: "https://demo.supabase.co/storage/v1/object/public/images/reference.png", createdAt: new Date().toISOString() };
  assert.match(sceneReferenceProblem(state, scene), /Generate a reference image first/);
  assert.match(referenceTakeProblem(state, scene, image), /Check this reference image/);
  image.continuity = { status: "failed", method: "visual-review", checks: [], sceneCheck: { verdict: "mismatch", notes: "The result shows a beach instead of the requested study." } };
  assert.match(referenceTakeProblem(state, scene, image), /beach/);
  image.continuity = { status: "passed", method: "visual-review", checks: [], sceneCheck: { verdict: "match", notes: "The desk, writer and window match." } };
  image.sourceImageRequirements = identity.sceneImageRequirements(state, scene);
  assert.equal(referenceTakeProblem(state, scene, image), undefined);
  const longer = { ...state, clipSeconds: 20 };
  assert.equal(identity.sceneImageRequirements(state, scene), identity.sceneImageRequirements(longer, scene), "Changing video length preserves its opening image");
  assert.notEqual(identity.sceneImageRequirements(state, scene), identity.sceneImageRequirements(state, { ...scene, description: "The writer stands on a beach." }));

  let modelResult = { checks: [], sceneCheck: { verdict: "mismatch", notes: "The desk is missing." } };
  const reviewer = loadTs("lib/studio/continuity.ts", {
    "./store": { StudioError },
    "./ai": { askModel: async () => modelResult },
    "@/lib/env": { getEnvValue: names => names.includes("NEXT_PUBLIC_SUPABASE_URL") ? "https://demo.supabase.co" : "" },
    "./ltx": { mediaSource: url => ({ url, headers: {} }) },
    fetch: async () => new Response("image", { headers: { "content-type": "image/png" } }),
  });
  assert.equal((await reviewer.reviewTake("workspace", image, scene)).status, "failed", "Scenario checks also apply with no locked character");
  modelResult = { checks: [] };
  await assert.rejects(() => reviewer.reviewTake("workspace", image, scene), /incomplete result/);

  let writes = 0;
  const route = loadTs("app/api/studio/[id]/route.ts", {
    "@/lib/studio/continuity": { reviewTake: async () => {
      assert.equal(writes, 1, "A recheck must not reserve a project edit lock before calling the model");
      state.messages.push({ id: "concurrent", role: "user", text: "A concurrent edit must survive." });
      state.revision++;
      return { status: "passed", method: "visual-review", checks: [], sceneCheck: { verdict: "match", notes: "The study matches." } };
    } },
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
    "@/lib/prisma": {},
    "@/lib/studio/store": {
      StudioError,
      loadStudio: async () => ({ project: { id: "workspace", userId: "owner" }, state: structuredClone(state) }),
      saveStudio: async (_loaded, next) => { writes++; state = { ...structuredClone(next), revision: state.revision + 1 }; return state; },
    },
  });
  scene.takes = [image];
  image.continuity.sceneCheck = { verdict: "mismatch", notes: "Wrong setting." };
  const select = () => route.POST(new Request("https://app.test/api/studio/workspace", { method: "POST", body: JSON.stringify({ action: "select", sceneId: "s", takeId: "image" }) }), { params: Promise.resolve({ id: "workspace" }) });
  let response = await select();
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Wrong setting/);
  assert.equal(writes, 0);
  image.continuity.sceneCheck = { verdict: "match", notes: "Matching setting." };
  response = await select();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).state.scenes[0].selectedImageId, "image");
  assert.equal(writes, 1);
  const reviewed = await route.POST(new Request("https://app.test/api/studio/workspace", { method: "POST", body: JSON.stringify({ action: "reviewTake", sceneId: "s", takeId: "image" }) }), { params: Promise.resolve({ id: "workspace" }) });
  assert.equal(reviewed.status, 200);
  const reviewedState = (await reviewed.json()).state;
  assert.equal(reviewedState.messages.at(-1).id, "concurrent", "Visual review merges into the latest state");
  assert.equal(reviewedState.operation, undefined);
  const queueApi = loadTs("lib/studio/scene-jobs.ts", {
    "@/lib/prisma": { prisma: { filmSceneJob: { findUnique: async () => null, count: async () => 0 }, $transaction: async () => { throw new Error("queue transaction reached"); } } },
    "./store": { StudioError, loadStudio: async () => ({ project: { id: "workspace", userId: "owner" }, state: structuredClone(state) }) },
  });
  const selectedId = state.scenes[0].selectedImageId;
  delete state.scenes[0].selectedImageId;
  await assert.rejects(() => queueApi.enqueueSceneJob("owner", "workspace", { requestId: "request", sceneId: "s", kind: "video", text: "Generate the study", plan: false }), /Generate a reference image first/);
  state.scenes[0].selectedImageId = selectedId;
  state.scenes[0].dialogues = [{ id: "too-long", character: "Writer", text: Array(50).fill("word").join(" ") }];
  await assert.rejects(() => queueApi.enqueueSceneJob("owner", "workspace", { requestId: "long-dialogue", sceneId: "s", kind: "video", text: "Generate the study", plan: false }), /spoken words total across all speakers/, "Over-budget dialogue is rejected before any queue transaction or paid render");
  state.scenes[0].dialogues = [];
  state.takeDeletions = [{ takeId: "old", sceneId: "s", kind: "video", pending: { id: "old" } }];
  await assert.rejects(() => queueApi.enqueueSceneJob("owner", "workspace", { requestId: "cleanup-pending", sceneId: "s", kind: "video", text: "Generate the study", plan: false }), /Retry deletion/, "Cleanup must finish before another paid replacement can be queued");
  delete state.takeDeletions;
  await assert.rejects(() => queueApi.enqueueSceneJob("owner", "workspace", { requestId: "request", sceneId: "s", kind: "video", text: "Generate the study", plan: false }), /queue transaction reached/);
  state.scenes[0].takes.push({ ...image, id: "kept-mismatch" });
  const keep = takeIds => route.POST(new Request("https://app.test/api/studio/workspace", { method: "POST", body: JSON.stringify({ action: "keepTakes", sceneId: "s", takeIds }) }), { params: Promise.resolve({ id: "workspace" }) });
  assert.equal((await keep(["unknown"])).status, 404);
  const kept = await keep(["kept-mismatch"]);
  assert.equal(kept.status, 200);
  const keptState = (await kept.json()).state;
  assert.equal(keptState.scenes[0].takes.find(take => take.id === "kept-mismatch").savedForLater, true);
  assert.equal(keptState.scenes[0].selectedImageId, selectedId, "Keeping an old mismatch preserves the selected matching reference");
  const restore = await route.POST(new Request("https://app.test/api/studio/workspace", { method: "POST", body: JSON.stringify({ action: "select", sceneId: "s", takeId: "kept-mismatch" }) }), { params: Promise.resolve({ id: "workspace" }) });
  assert.equal(restore.status, 200);
  assert.equal((await restore.json()).state.scenes[0].takes.find(take => take.id === "kept-mismatch").savedForLater, undefined, "Selecting a now-matching saved take restores it to the main view");
  console.log("PASS: image-first selection guards, scenario mismatches without locked cast, incomplete checks rejected, duration-independent opening images, and actionable selection API failures.");
})().catch(error => { console.error(error); process.exitCode = 1; });
