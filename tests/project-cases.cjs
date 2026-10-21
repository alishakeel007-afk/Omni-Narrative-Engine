// Numbered acceptance evidence. Real production functions/route handlers run;
// auth, persistence and paid providers are fixtures, never live services.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadTs } = require("../scripts/test-studio.cjs");

const duration = loadTs("lib/film/duration.ts");
const speech = loadTs("lib/film/dialogue.ts");
const details = loadTs("lib/film/character-details.ts");
const identity = loadTs("lib/studio/identity.ts");
const reference = loadTs("lib/film/reference.ts");
const { EMPTY_STUDIO } = loadTs("types/studio.ts");
const cases = [];
function test(id, category, title, input, expected, run) {
  cases.push({ id, category, title, input, expected, run });
}
// Restore deployment configuration even when an assertion or async route fails.
async function configured(values, run) {
  const keys = ["STUDIO_CLIP_SECONDS", "STUDIO_CLIP_MAX_SECONDS"];
  const previous = keys.map(key => process.env[key]);
  for (const key of keys) {
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try { return await run(); }
  finally { keys.forEach((key, i) => {
    if (previous[i] === undefined) delete process.env[key];
    else process.env[key] = previous[i];
  }); }
}
const words = count => Array(count).fill("word").join(" ");
function fresh() {
  return { ...structuredClone(EMPTY_STUDIO), title: "Test film", language: "en",
    characters: [{ id: "a", name: "Aleeza", appearance: "Blue cotton kurta", locked: false }],
    scenes: [
      { id: "scene", title: "The desk", description: "Aleeza closes a notebook.", characterIds: ["a"], dialogues: [], takes: [] },
      { id: "other", title: "Empty room", description: "Sunlight enters an empty room.", characterIds: [], dialogues: [], takes: [] },
    ] };
}
class StudioError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function apiFixture(initial = fresh()) {
  let state = structuredClone(initial), user = { id: "owner" }, saves = 0;
  const forbidden = async () => { throw new Error("Unexpected external service call in isolated test"); };
  const route = loadTs("app/api/studio/[id]/route.ts", {
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    "@/lib/prisma": {},
    "@/lib/studio/store": { StudioError,
      loadStudio: async (owner, id) => {
        if (owner !== "owner" || id !== "project") throw new StudioError("Project not found.", 404);
        return { project: { id, userId: owner }, state: structuredClone(state) };
      },
      saveStudio: async (_loaded, next) => {
        saves++;
        state = { ...structuredClone(next), revision: state.revision + 1 };
        return structuredClone(state);
      },
    },
    "@/lib/studio/ai": { askModel: forbidden },
    "@/lib/studio/media": { startMedia: forbidden, startChatImage: forbidden },
    fetch: forbidden,
  });
  const context = { params: Promise.resolve({ id: "project" }) };
  return {
    get state() { return state; }, get saves() { return saves; },
    setUser(value) { user = value; },
    get: () => route.GET({}, context),
    post: body => route.POST(new Request("https://app.test/api/studio/project", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }), context),
  };
}
function withReference() {
  const state = fresh(), scene = state.scenes[0];
  Object.assign(state.characters[0], { referenceId: "photo", locked: true });
  const take = { id: "image", kind: "image", status: "complete", url: "https://fixture.invalid/frame.png",
    prompt: "The desk", createdAt: "2026-01-01T00:00:00Z", identity: identity.sceneIdentity(state, scene),
    sourceImageRequirements: identity.sceneImageRequirements(state, scene),
    sourceRequirements: identity.sceneRequirements(state, scene),
    continuity: { status: "failed", method: "visual-review", sceneCheck: { verdict: "mismatch", notes: "Desk missing" }, checks: [] },
  };
  scene.takes = [take]; scene.selectedImageId = take.id;
  return { state, scene, take };
}

for (const [seconds, frames] of [[5, 121], [10, 241], [15, 361], [20, 481]]) {
  test(`UT-${String(seconds / 5).padStart(2, "0")}`, "unit", `${seconds}s uses the LTX frame grid`,
    `${seconds} seconds; cap 481 frames`, `${frames} frames; 24 fps; 8k+1 grid`, () => {
      const actual = duration.snapFrames(seconds, 481);
      assert.equal(actual, frames); assert.equal((actual - 1) % 8, 0);
      return { frames: actual, actualSeconds: duration.framesToSeconds(actual) };
    });
}
test("UT-05", "unit", "Frame snapping stays within worker bounds", "0.1 through 60 seconds in 0.1s increments", "Every result is 33..481 and lies on 8k+1", () => {
  for (let i = 1; i <= 600; i++) {
    const frames = duration.snapFrames(i / 10, 481);
    assert.ok(frames >= 33 && frames <= 481); assert.equal((frames - 1) % 8, 0);
  }
  return { checkedInputs: 600, minFrames: duration.snapFrames(.1, 481), maxFrames: duration.snapFrames(60, 481) };
});
test("UT-06", "unit", "Whitespace does not inflate dialogue count", "Empty text, spaces, tabs and line breaks", "0 words for blank; 3 for mixed whitespace", () => {
  assert.equal(speech.wordCount(" \n\t "), 0);
  const actual = speech.wordCount("  One\n two\tthree  "); assert.equal(actual, 3); return { words: actual };
});
test("UT-07", "unit", "Custom character details are trimmed and empty fields removed", "Custom ethnicity ' Wakhi '; blank religion", "Wakhi retained; no inferred religion", () => {
  const actual = details.normalizedCharacterDetails({ ethnicity: " Wakhi ", religion: " " });
  assert.deepEqual(actual, { ethnicity: "Wakhi" }); return actual;
});
test("UT-08", "unit", "Cleared optional details preserve legacy identity keys", "Same character with no details versus whitespace-only details", "Equal identity keys", () => {
  const character = fresh().characters[0];
  assert.equal(identity.identityProfile(character).key, identity.identityProfile({ ...character, details: { religion: " " } }).key);
  return { keysEqual: true };
});
for (const [language, budgets] of [["en", [10, 20, 31, 41]], ["ur", [8, 17, 26, 35]]]) {
  test(language === "en" ? "UT-09" : "UT-10", "unit", `${language} speech boundary at every offered duration`,
    `5/10/15/20s; word budget and one word above`, `Budgets ${budgets.join("/")}; every next word is over budget`, () => {
      const actual = [5, 10, 15, 20].map((seconds, i) => {
        assert.equal(speech.wordBudget(language, seconds), budgets[i]);
        assert.equal(speech.dialogueFit(words(budgets[i]), language, seconds * .8).overBudget, false);
        assert.equal(speech.dialogueFit(words(budgets[i] + 1), language, seconds * .8).overBudget, true);
        return { seconds, budgetWords: budgets[i] };
      }); return actual;
    });
}
test("UT-11", "unit", "Enabled durations are explicit rather than inherited from local env", "No configuration, then only 15s enabled", "Options [5], then [5,15]", async () => {
  const defaults = await configured({}, () => duration.clipCapability().options);
  const staged = await configured({ STUDIO_CLIP_SECONDS: "15" }, () => duration.clipCapability().options);
  assert.deepEqual(defaults, [5]); assert.deepEqual(staged, [5, 15]); return { defaults, staged };
});
test("UT-12", "unit", "Invalid deployment settings do not enable extended clips", "STUDIO_CLIP_SECONDS=banana,-4; max=invalid", "Only 5s available", () => configured({ STUDIO_CLIP_SECONDS: "banana,-4", STUDIO_CLIP_MAX_SECONDS: "invalid" }, () => {
  const actual = duration.clipCapability().options; assert.deepEqual(actual, [5]); return actual;
}));

test("BL-01", "business", "Dialogue shares one scene budget across speakers", "Two 6-word lines in a 5s English scene; 10s available", "12 total words; blocked at 5s; suggest 10s", () => {
  const scene = { dialogues: [{ character: "Aleeza", text: words(6) }, { character: "Bilal", text: words(6) }] };
  const actual = speech.sceneSpeechGuidance(scene, "en", 5, [20, 10, 15, 5]);
  assert.equal(actual.words, 12); assert.equal(actual.overBudget, true); assert.equal(actual.suggestedSeconds, 10); return actual;
});
test("BL-02", "business", "Guidance never recommends an unavailable or insufficient duration", "42 English words in a 5s clip; options through 20s", "Over budget; no duration suggested; shorten or split needed", () => {
  const actual = speech.sceneSpeechGuidance({ dialogues: [{ character: "Aleeza", text: words(42) }] }, "en", 5, [5, 10, 15, 20]);
  assert.equal(actual.overBudget, true); assert.equal(actual.suggestedSeconds, undefined); return actual;
});
test("BL-03", "business", "Legacy narrator text consumes no spoken budget", "60 narrator words and 2 spoken words", "Only 2 words and 1 speaking turn counted", () => {
  const actual = speech.sceneSpeechGuidance({ dialogues: [{ character: "Narrator", text: words(60) }, { character: "Aleeza", text: "Come inside" }] }, "en", 5);
  assert.equal(actual.words, 2); assert.equal(actual.lines, 1); return actual;
});
test("BL-04", "business", "Written profiles can generate directly without reference approval", "Unlocked character with written appearance; no uploaded photo", "No reference gate", () => {
  const state = fresh(); assert.equal(reference.sceneReferenceProblem(state, state.scenes[0]), undefined); return { referenceGate: false };
});
test("BL-05", "business", "A photo outside the scene cast imposes no approval gate", "Referenced character exists but is absent from this scene", "No reference gate", () => {
  const state = fresh(); state.characters.push({ id: "absent", name: "Other", appearance: "Red coat", locked: false, referenceId: "other-photo" });
  assert.equal(reference.sceneReferenceProblem(state, state.scenes[0]), undefined); return { referenceGate: false };
});
test("BL-06", "business", "Uploaded reference must be locked before generation", "In-cast photo; character unlocked", "Actionable review-and-lock message", () => {
  const state = fresh(); state.characters[0].referenceId = "photo";
  const message = reference.sceneReferenceProblem(state, state.scenes[0]); assert.match(message, /Review and lock/); return { message };
});
test("BL-07", "business", "Locked uploaded reference requires an opening image", "Locked in-cast photo, no scene image", "Generate a scene image first message", () => {
  const state = fresh(); Object.assign(state.characters[0], { referenceId: "photo", locked: true });
  const message = reference.sceneReferenceProblem(state, state.scenes[0]); assert.match(message, /scene image first/); return { message };
});
test("BL-08", "business", "Explicit image approval is bound to media and requirements", "Failed image, explicit override; change URL, scene, then duration", "Current override works; URL/story changes invalidate; duration preserves it", () => {
  const { state, scene, take } = withReference();
  take.reviewOverride = { approvedAt: "2026-01-01T00:00:00Z", requirements: identity.sceneImageRequirements(state, scene), sourceUrl: take.url };
  assert.equal(reference.sceneReferenceProblem(state, scene), undefined);
  assert.equal(identity.imageReviewOverridden(state, scene, { ...take, url: "https://fixture.invalid/new.png" }), false);
  const changed = structuredClone(state); changed.scenes[0].description = "Aleeza stands on a beach.";
  assert.equal(identity.imageReviewOverridden(changed, changed.scenes[0], take), false);
  state.clipSeconds = 20; assert.equal(identity.imageReviewOverridden(state, scene, take), true);
  return { current: true, changedUrl: false, changedStory: false, durationOnly: true };
});

test("IT-01", "integration", "Unauthenticated API reads and writes are rejected", "No signed-in user; GET and workflow POST", "401 on both; no persistence", async () => {
  const api = apiFixture(); api.setUser(null);
  const statuses = [(await api.get()).status, (await api.post({ action: "workflow", patch: { title: "Changed" } })).status];
  assert.deepEqual(statuses, [401, 401]); assert.equal(api.saves, 0); return { statuses, saves: api.saves };
});
test("IT-02", "integration", "Another owner cannot read or edit a project", "Authenticated different user; GET and workflow POST", "404 on both; no persistence", async () => {
  const api = apiFixture(); api.setUser({ id: "another-owner" });
  const statuses = [(await api.get()).status, (await api.post({ action: "workflow", patch: { title: "Changed" } })).status];
  assert.deepEqual(statuses, [404, 404]); assert.equal(api.saves, 0); return { statuses, saves: api.saves };
});
test("IT-03", "integration", "Saving another workflow step preserves existing settings", "Save title and Urdu language; then save script step only", "200; title/language retained; revision advances twice", async () => {
  const api = apiFixture(), revision = api.state.revision;
  assert.equal((await api.post({ action: "workflow", patch: { title: "Rain film", language: "ur" } })).status, 200);
  const response = await api.post({ action: "workflow", patch: { step: "script" } });
  const { state } = await response.json(); assert.equal(response.status, 200);
  assert.equal(state.title, "Rain film"); assert.equal(state.language, "ur"); assert.equal(state.step, "script"); assert.equal(state.revision, revision + 2);
  return { status: response.status, title: state.title, language: state.language, revisionDelta: 2 };
});
test("IT-04", "integration", "Invalid workflow input never mutates stored state", "Unsupported language, unknown revision field, invalid step, off-list 7s", "400 for all; no saves; state unchanged", async () => {
  const api = apiFixture(), before = structuredClone(api.state), statuses = [];
  for (const patch of [{ language: "fr" }, { revision: 99 }, { step: "invalid" }, { clipSeconds: 7 }]) {
    statuses.push((await api.post({ action: "workflow", patch })).status);
  }
  assert.deepEqual(statuses, [400, 400, 400, 400]); assert.equal(api.saves, 0); assert.deepEqual(api.state, before); return { statuses, saves: 0 };
});
test("IT-05", "integration", "Project duration and per-scene override remain independent", "Enable long clips; save project 20s and first scene 10s", "20s project; 10s first scene; second inherits 20s", () => configured({ STUDIO_CLIP_MAX_SECONDS: "20" }, async () => {
  const api = apiFixture();
  assert.equal((await api.post({ action: "workflow", patch: { clipSeconds: 20 } })).status, 200);
  assert.equal((await api.post({ action: "scenePatch", sceneId: "scene", patch: { requestedSeconds: 10 } })).status, 200);
  assert.equal(api.state.clipSeconds, 20); assert.equal(api.state.scenes[0].requestedSeconds, 10);
  assert.equal(api.state.scenes[1].requestedSeconds, undefined);
  return { projectSeconds: 20, firstSceneFrames: duration.clipFrames(api.state.scenes[0].requestedSeconds), inheritedFrames: duration.clipFrames(api.state.clipSeconds) };
}));
test("IT-06", "integration", "Character details save without inventing an appearance", "Blank appearance; save Pakistani nationality and custom clothing", "200; details persist; only cast scene becomes outdated", async () => {
  const initial = fresh(); initial.characters[0].appearance = ""; const api = apiFixture(initial);
  const response = await api.post({ action: "characterDetails", characterId: "a", details: { nationality: "Pakistani", clothing: "Blue kurta, no headscarf" } });
  assert.equal(response.status, 200); assert.equal(api.state.characters[0].appearance, "");
  assert.equal(api.state.characters[0].details.nationality, "Pakistani"); assert.equal(api.state.scenes[0].outdated, true); assert.equal(api.state.scenes[1].outdated, undefined);
  return { status: response.status, details: api.state.characters[0].details, affectedScenes: ["scene"] };
});
test("IT-07", "integration", "Locked character details reject edits", "Locked character; attempt to change religion", "400; state unchanged; no save", async () => {
  const initial = fresh(); initial.characters[0].locked = true; const api = apiFixture(initial);
  const response = await api.post({ action: "characterDetails", characterId: "a", details: { religion: "Muslim" } });
  assert.equal(response.status, 400); assert.equal(api.saves, 0); assert.deepEqual(api.state, initial); return { status: response.status, saves: 0 };
});
test("IT-08", "integration", "Dialogue updates address stable IDs and preserve other lines", "Update d1 while d2 is present", "Only d1 changes; unknown ID returns 404 without another save", async () => {
  const initial = fresh(); initial.scenes[0].dialogues = [{ id: "d1", character: "Aleeza", text: "One" }, { id: "d2", character: "Aleeza", text: "Two" }];
  const api = apiFixture(initial);
  assert.equal((await api.post({ action: "dialogue", sceneId: "scene", operation: { kind: "update", dialogueId: "d1", text: "Edited" } })).status, 200);
  const unknown = await api.post({ action: "dialogue", sceneId: "scene", operation: { kind: "update", dialogueId: "missing", text: "Lost" } });
  assert.equal(unknown.status, 404); assert.equal(api.saves, 1);
  assert.deepEqual(api.state.scenes[0].dialogues.map(line => line.text), ["Edited", "Two"]); return { lines: ["Edited", "Two"], unknownStatus: 404, saves: 1 };
});
test("IT-09", "integration", "Failed reference requires explicit skip and retains failed result", "Select mismatched image, then select with skipCheck=true", "400 then 200; override persists; original check still failed", async () => {
  const { state } = withReference(), api = apiFixture(state);
  const select = skipCheck => api.post({ action: "select", sceneId: "scene", takeId: "image", skipCheck });
  const refused = await select(false); assert.equal(refused.status, 400); assert.equal(api.saves, 0);
  const accepted = await select(true); assert.equal(accepted.status, 200);
  const saved = (await (await api.get()).json()).state;
  assert.equal(saved.scenes[0].takes[0].continuity.status, "failed"); assert.ok(saved.scenes[0].takes[0].reviewOverride.approvedAt);
  assert.equal(reference.sceneReferenceProblem(saved, saved.scenes[0]), undefined);
  return { refused: 400, explicitSkip: 200, originalResult: "failed", overridePersisted: true };
});
test("IT-10", "integration", "Skip cannot approve a stale image", "Mismatched image marked stale; skipCheck=true", "400 and no state mutation", async () => {
  const { state, take } = withReference(); take.stale = true; const api = apiFixture(state);
  const response = await api.post({ action: "select", sceneId: "scene", takeId: "image", skipCheck: true });
  assert.equal(response.status, 400); assert.equal(api.saves, 0); return { status: 400, saves: 0 };
});

async function main() {
  const args = process.argv.slice(2), categoryAt = args.indexOf("--category"), jsonAt = args.indexOf("--json");
  const category = categoryAt >= 0 ? args[categoryAt + 1] : undefined;
  if (category && !["unit", "integration", "business"].includes(category)) throw new Error(`Unknown category: ${category}`);
  const results = [];
  for (const entry of cases.filter(item => !category || item.category === category)) {
    const { run, ...description } = entry, started = performance.now();
    try {
      const actual = await run();
      results.push({ ...description, status: "passed", durationMs: Math.round(performance.now() - started), actual });
      console.log(`PASS ${entry.id}: ${entry.title}`);
    } catch (error) {
      results.push({ ...description, status: "failed", durationMs: Math.round(performance.now() - started), error: error.stack || String(error) });
      console.error(`FAIL ${entry.id}: ${entry.title}\n${error.stack || error}`);
    }
  }
  if (jsonAt >= 0) {
    const target = path.resolve(args[jsonAt + 1]); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(results, null, 2) + "\n");
  }
  console.log(`${results.filter(item => item.status === "passed").length}/${results.length} numbered cases passed. Integrations use auth/storage/provider fixtures.`);
  if (results.some(item => item.status !== "passed")) process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { cases };
