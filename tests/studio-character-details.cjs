const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");
class StudioError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

(async () => {
  const { EMPTY_STUDIO } = loadTs("types/studio.ts");
  const { characterAppearanceText, normalizedCharacterDetails } = loadTs("lib/film/character-details.ts");
  const { buildFilmPrompt } = loadTs("lib/film/prompt.ts");
  const { scenePrompt, chatImageRequest } = loadTs("lib/studio/logic.ts");
  const { sceneRequirements, sceneImageRequirements, identityProfile } = loadTs("lib/studio/identity.ts");
  const { pakistanSceneNotes } = loadTs("lib/film/creative-direction.ts");
  const base = { ...structuredClone(EMPTY_STUDIO), title: "Aleeza's day", premise: "Aleeza is a Muslim student in Lahore, wearing blue cotton, with uncovered hair.",
    characters: [{ id: "a", name: "Aleeza", appearance: "", locked: false }], scenes: [
      { id: "scene", title: "The desk", description: "Aleeza closes her notebook.", characterIds: ["a"], dialogues: [], takes: [] },
      { id: "other", title: "A quiet room", description: "An empty room.", characterIds: [], dialogues: [], takes: [] },
    ] };
  let state = structuredClone(base);
  let submittedImage;
  const route = loadTs("app/api/studio/[id]/route.ts", {
    "next/server": { NextResponse: { json: (value, init) => Response.json(value, init) } },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } }) },
    "@/lib/prisma": {},
    "@/lib/studio/store": { StudioError, loadStudio: async () => ({ project: { id: "workspace", userId: "owner" }, state: structuredClone(state) }),
      saveStudio: async (_loaded, next) => (state = { ...structuredClone(next), revision: state.revision + 1 }) },
    "@/lib/studio/media": { startChatImage: async (_id, input) => { submittedImage = input; return { id: "portrait", kind: "image", status: "queued" }; } },
  });
  const post = body => route.POST(new Request("https://app.test/api/studio/workspace", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "workspace" }) });
  const details = { gender: "Female", ageRange: "Young adult (18–25)", nationality: "Pakistani", ethnicity: "Punjabi", religion: "Muslim", clothing: "Blue cotton kurta, straight trousers, no headscarf." };
  const before = sceneRequirements(state, state.scenes[0]);
  assert.equal((await post({ action: "characterDetails", characterId: "a", details })).status, 200, "Details save even when appearance is blank");
  assert.deepEqual(state.characters[0].details, details);
  assert.equal(state.characters[0].appearance, "", "Explicit details do not silently replace the appearance field");
  assert.equal(state.scenes[0].outdated, true); assert.equal(state.scenes[1].outdated, undefined);
  assert.notEqual(sceneRequirements(state, state.scenes[0]), before, "Written-only character details invalidate old render requirements");
  const imageBefore = sceneImageRequirements(state, state.scenes[0]);
  const native = buildFilmPrompt({ state, scene: state.scenes[0], language: "en", clipSeconds: 5 });
  const frame = scenePrompt(state, "scene").prompt;
  for (const prompt of [native, frame, identityProfile(state.characters[0]).appearance]) {
    assert.match(prompt, /Nationality: Pakistani/); assert.match(prompt, /Religion: Muslim/); assert.match(prompt, /no headscarf/);
  }
  assert.match(native, /explicit current user requirements and exclusions come first/);
  assert.match(native, /NO speech of any kind/);
  const conditioned = buildFilmPrompt({ state, scene: state.scenes[0], language: "en", clipSeconds: 5, imageConditioned: true });
  assert.match(conditioned, /Writer-specified details for Aleeza/); assert.match(conditioned, /no headscarf/);
  const chat = chatImageRequest(state, "Generate an image of Aleeza in a red coat, no scarf.", undefined, { prompt: "A stale suggestion in a blue coat", characterNames: ["Aleeza"] });
  assert.match(chat.request.prompt, /Current explicit image requirements.*red coat, no scarf/);
  assert.match(chat.request.prompt, /Nationality: Pakistani/);
  assert.equal(pakistanSceneNotes(state, { ...state.scenes[0], direction: { location: "London campus" } }), "", "An explicit foreign scene does not inherit a Lahore backdrop");
  assert.match(pakistanSceneNotes(state, { ...state.scenes[0], direction: { location: "Hunza" } }), /Gilgit-Baltistan/);
  assert.match(pakistanSceneNotes(state, { ...state.scenes[0], direction: { location: "کراچی" } }), /Sindh/);
  const portrait = await post({ action: "generatePortrait", characterId: "a", requestId: "e62c5b02-8edf-4ee9-b40a-93d972ebc7b7" });
  assert.equal(portrait.status, 200); assert.match(submittedImage.prompt, /no headscarf/);
  assert.equal((await post({ action: "characterDetails", characterId: "unknown", details })).status, 404);
  assert.equal((await post({ action: "characterDetails", characterId: "a", details: { ...details, nationality: "x".repeat(101) } })).status, 400);
  assert.equal((await post({ action: "characterDetails", characterId: "a", details: { ...details, inferredReligion: "forbidden" } })).status, 400);
  state.characters[0].locked = true;
  assert.equal((await post({ action: "characterDetails", characterId: "a", details })).status, 400);
  state.characters[0].locked = false;
  assert.equal((await post({ action: "characterDetails", characterId: "a", details: { ...details, nationality: "British", religion: "" } })).status, 200);
  assert.equal(state.characters[0].details.religion, undefined, "Clearing religion does not infer it again from Aleeza");
  assert.notEqual(sceneImageRequirements(state, state.scenes[0]), imageBefore);
  assert.equal(characterAppearanceText({ appearance: "", details: undefined }), "", "A bare name does not manufacture sensitive facts");
  assert.deepEqual(normalizedCharacterDetails({ gender: "  Female ", religion: " " }), { gender: "Female" });
  let prompts = [], replies = [];
  const ai = loadTs("lib/film/ai.ts", { "@/lib/studio/ai": { askModel: async prompt => { prompts.push(prompt); return replies.shift(); } }, "@/lib/studio/store": { StudioError } });
  state = structuredClone(base); state.characters[0].details = details;
  replies = [{ scenes: [] }, { characters: [{ id: "a", appearance: "Young woman with dark braided hair, a blue cotton kurta and practical shoes; uncovered hair." }], scenes: [] }];
  const reply = await ai.directScenes(state);
  assert.equal(prompts.length, 2, "Missing reusable profiles are retried rather than inventing new appearances independently per scene");
  assert.match(prompts[0], /"nationality":"Pakistani"/); assert.match(prompts[0], /Names alone never establish nationality, religion/);
  assert.equal(ai.fillSceneDirection(state, reply), 1); assert.match(state.characters[0].appearance, /blue cotton/);
  assert.equal(ai.fillSceneDirection(state, { characters: [{ id: "a", appearance: "A completely different face" }], scenes: [] }), 0);
  const reviewed = { ...structuredClone(base), characters: [{ ...base.characters[0], referenceId: "photo" }] };
  assert.equal(ai.fillSceneDirection(reviewed, reply), 0, "Uploaded reference appearances are not invented or overwritten");
  console.log("PASS: validated optional character details, blank-appearance saving and portraits, prompt propagation, explicit instruction priority, foreign-location precedence, saved fictional profiles, immutable reference profiles and scoped render invalidation. No provider calls.");
})().catch(error => { console.error(error); process.exitCode = 1; });
