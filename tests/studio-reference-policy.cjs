const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");
class StudioError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

(async () => {
  const { EMPTY_STUDIO } = loadTs("types/studio.ts");
  const identity = loadTs("lib/studio/identity.ts");
  const { sceneReferenceProblem, referenceTakeProblem } = loadTs("lib/film/reference.ts");
  const { scenePrompt } = loadTs("lib/studio/logic.ts");
  const fresh = () => ({ ...structuredClone(EMPTY_STUDIO), title: "A quiet evening", characters: [], scenes: [
    { id: "scene", title: "The study", description: "A writer closes a book at a wooden desk.", characterIds: [], dialogues: [], takes: [] },
  ] });
  let state = fresh(), submissions = [];
  const store = { StudioError,
    loadStudio: async () => ({ project: { id: "workspace", userId: "owner" }, state: structuredClone(state) }),
    saveStudio: async (_loaded, next) => (state = { ...structuredClone(next), revision: state.revision + 1 }),
  };
  const media = loadTs("lib/studio/media.ts", {
    "./store": store,
    "./ltx": { nativeVideoEnabled: () => true, startLtxVideo: async input => { submissions.push(input); return { id: "render", kind: "video", status: "queued" }; } },
    fetch: async () => { throw new Error("An unexpected provider call was made"); },
  });
  await media.startMedia(state, "workspace", "scene", "video", false);
  assert.equal(submissions.at(-1).imageUrl, undefined, "No-cast scenes generate without an opening image");
  state.characters = [{ id: "writer", name: "Writer", appearance: "Blue shirt and dark hair", locked: false }];
  state.scenes[0].characterIds = ["writer"];
  await media.startMedia(state, "workspace", "scene", "video", true);
  assert.equal(submissions.at(-1).imageUrl, undefined, "Written character profiles can use direct video");
  assert.deepEqual(submissions.at(-1).identity, []);
  state.characters.push({ id: "other", name: "Other scene's character", appearance: "Red coat", locked: true, referenceId: "unused-photo" });
  assert.equal(sceneReferenceProblem(state, state.scenes[0]), undefined, "A reference outside this scene's cast does not impose approval");
  const queue = loadTs("lib/studio/scene-jobs.ts", { "./store": store,
    "@/lib/prisma": { prisma: { filmSceneJob: { findUnique: async () => null, count: async () => 0 }, $transaction: async () => { throw new Error("queue transaction reached"); } } },
  });
  const enqueue = direct => queue.enqueueSceneJob("owner", "workspace", { requestId: "new-request", sceneId: "scene", kind: "video", text: "Generate the study", direct, plan: false });
  await assert.rejects(() => enqueue(true), /queue transaction reached/, "Direct video reaches the queue without buying an image");
  const writer = state.characters[0]; writer.referenceId = "uploaded-photo";
  await assert.rejects(() => enqueue(false), /Review and lock/);
  await assert.rejects(() => media.startMedia(state, "workspace", "scene", "image", false), /Review and lock/, "An unlocked photo is not silently discarded during a paid image generation");
  writer.locked = true;
  await assert.rejects(() => enqueue(true), /character reference/);
  await assert.rejects(() => enqueue(false), /scene image first/);
  await assert.rejects(() => media.startMedia(state, "workspace", "scene", "video", false), /scene image first/);
  assert.equal(submissions.length, 2, "Blocked requests never reach video submission");
  const scene = state.scenes[0];
  const image = { id: "image", providerId: "image-provider", kind: "image", status: "complete", prompt: "The opening frame", url: "https://demo.supabase.co/storage/v1/object/public/images/frame.png",
    identity: identity.sceneIdentity(state, scene), continuityKey: scenePrompt(state, scene.id).continuityKey,
    sourceImageRequirements: identity.sceneImageRequirements(state, scene), sourceRequirements: identity.sceneRequirements(state, scene), createdAt: new Date().toISOString(),
    continuity: { status: "failed", method: "visual-review", sceneCheck: { verdict: "mismatch", notes: "The desk is missing." }, checks: [{ characterId: "writer", verdict: "mismatch", notes: "The shirt is different." }] } };
  scene.takes = [image];
  const route = loadTs("app/api/studio/[id]/route.ts", { "@/lib/studio/store": store, "@/lib/prisma": {},
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
  });
  const select = (takeId = "image", skipCheck = false) => route.POST(new Request("https://app.test/api/studio/workspace", {
    method: "POST", body: JSON.stringify({ action: "select", sceneId: "scene", takeId, skipCheck }),
  }), { params: Promise.resolve({ id: "workspace" }) });
  assert.equal((await select()).status, 400, "A failed check requires explicit approval");
  assert.equal((await select("image", true)).status, 200);
  const approved = state.scenes[0].takes[0];
  assert.equal(approved.continuity.status, "failed", "An override must not fabricate a passed test");
  assert.ok(approved.reviewOverride.approvedAt);
  assert.equal(sceneReferenceProblem(state, state.scenes[0]), undefined);
  assert.equal(state.scenes[0].selectedImageId, "image");
  assert.equal((await select()).status, 200, "The saved explicit approval survives reloads");
  await media.startMedia(state, "workspace", "scene", "video", false);
  assert.equal(submissions.at(-1).imageUrl, image.url, "The approved image is supplied as actual video conditioning");
  state.clipSeconds = 20;
  assert.equal(sceneReferenceProblem(state, state.scenes[0]), undefined, "Length changes preserve image approval");
  const alteredUrl = { ...approved, url: "https://demo.supabase.co/different.png" };
  assert.equal(identity.imageReviewOverridden(state, state.scenes[0], alteredUrl), false, "Approval cannot transfer to different media");
  const lateTake = { ...approved }; delete lateTake.reviewOverride;
  assert.equal(await queue.publishSceneTake("owner", "workspace", "scene", lateTake), true);
  assert.ok(state.scenes[0].takes[0].reviewOverride, "Late provider updates preserve explicit user approval");
  const approvedState = structuredClone(state);
  state.scenes[0].description = "The writer now stands on a beach.";
  assert.equal((await select("image", true)).status, 400, "Skip cannot revive an old scene revision");
  state = structuredClone(approvedState); state.characters[0].referenceId = "different-photo";
  assert.equal((await select("image", true)).status, 400, "Skip cannot revive an obsolete character profile");
  state = structuredClone(approvedState); state.scenes[0].takes[0].stale = true;
  assert.equal((await select("image", true)).status, 400, "Skip cannot revive a stale take");
  for (const status of ["pending", "review", "error"]) {
    state = structuredClone(approvedState); delete state.scenes[0].takes[0].reviewOverride;
    state.scenes[0].takes[0].continuity.status = status;
    assert.equal((await select("image", true)).status, 200, `${status} checks allow explicit approval`);
  }
  state = structuredClone(approvedState); state.scenes[0].takes.push({ ...image, id: "video", kind: "video" });
  assert.equal((await select("video", true)).status, 400, "The image override cannot bypass video checks");
  state = fresh();
  let reviews = 0, publications = 0;
  let job = { id: "image-job", userId: "owner", workspaceId: "workspace", sceneId: "scene", kind: "image", status: "running", phase: "poll",
    providerTake: { ...image, identity: [], stored: true, continuity: { status: "pending", method: "visual-review" } },
    snapshot: { state: structuredClone(state), requirements: identity.sceneRequirements(state, state.scenes[0]) } };
  const prisma = { $transaction: async fn => fn(prisma), $queryRaw: async () => [{ token: "lease", leaseUntil: new Date(Date.now() + 300000) }],
    filmSceneJob: { update: async ({ data }) => (job = { ...job, ...structuredClone(data) }) }, filmSceneSlot: { updateMany: async () => ({ count: 1 }) } };
  const worker = loadTs("lib/studio/scene-worker.ts", { "@/lib/prisma": { prisma }, "./store": store,
    "./continuity": { reviewTake: async () => { reviews++; throw new Error("Unnecessary check"); } },
    "./scene-jobs": { json: value => JSON.parse(JSON.stringify(value)), publishSceneTake: async () => { publications++; return true; } },
  });
  await worker.runSceneJob({ slotId: 1, token: "lease", job });
  assert.equal(job.status, "complete"); assert.equal(publications, 1);
  assert.equal(reviews, 0, "Optional images do not spend usage on automatic approval checks");
  assert.equal(referenceTakeProblem(state, state.scenes[0], { ...image, identity: [], sourceImageRequirements: undefined, sourceRequirements: undefined }), undefined);
  console.log("PASS: direct generation without cast photos, per-scene reference scope, explicit persisted image approval, unchanged failed results, actual image conditioning, approval invalidation, late-update preservation and no automatic checks for optional images. No provider calls.");
})().catch(error => { console.error(error); process.exitCode = 1; });
