// Four-step workflow route: saving step/setup fields, ownership, and delete.
const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");

class StudioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

(async () => {
  // A deployment with long clips enabled, so the clamping is observable.
  process.env.STUDIO_CLIP_MAX_SECONDS = "20";
  const { normalizeStudioState } = loadTs("types/studio.ts");
  let user = { id: "owner" };
  let saved = normalizeStudioState({
    version: 1,
    revision: 0,
    title: "Untitled film",
    premise: "",
    world: "",
    characters: [],
    scenes: [],
    messages: [],
    timeline: [],
    edits: {},
  });
  const deletes = [];

  const next = {
    NextResponse: {
      json: (body, init) => ({ status: init?.status || 200, json: async () => body }),
    },
  };
  const auth = { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) };
  const store = {
    StudioError,
    loadStudio: async (owner, id) => {
      if (owner !== "owner" || id !== "project") throw new StudioError("Project not found.", 404);
      return { project: { id, userId: owner }, state: structuredClone(saved) };
    },
    saveStudio: async (loaded, state) => {
      saved = { ...state, revision: loaded.state.revision + 1 };
      return saved;
    },
  };
  const prisma = {
    prisma: {
      filmWorkspace: {
        deleteMany: async ({ where }) => {
          deletes.push(where);
          // Scoped by owner, so another user's id matches nothing.
          return { count: where.id === "project" && where.userId === "owner" ? 1 : 0 };
        },
      },
      filmSceneJob: { findFirst: async () => null },
    },
  };

  // A deployment with long clips enabled, so the clamping is observable.
  let scriptReply = null;
  const route = loadTs("app/api/studio/[id]/route.ts", {
    "next/server": next,
    "@/lib/supabase/server": auth,
    "@/lib/studio/store": store,
    "@/lib/prisma": prisma,
    "@/lib/studio/ai": {},
    "@/lib/audio/music-service": {},
    "@/lib/studio/media": {},
    "@/lib/studio/continuity": {},
    // The REAL applyFilmScript runs here: it is the function that preserves
    // reviewed characters, so mocking it would test nothing. Only the model
    // call is replaced.
    "@/lib/film/ai": {
      ...loadTs("lib/film/ai.ts", {
        "@/lib/studio/ai": { askModel: async () => scriptReply },
        "@/lib/studio/store": { StudioError },
      }),
      generateFilmScript: async () => scriptReply,
      assistTurn: async () => ({ reply: "x" }),
    },
  });
  const context = { params: Promise.resolve({ id: "project" }) };
  const post = (body) => route.POST({ json: async () => body }, context);
  const workflow = (patch) => post({ action: "workflow", patch });

  // --- saving what a step owns -------------------------------------------
  let response = await workflow({ step: "setup", language: "ur", assist: "custom", title: "Rain film" });
  assert.equal(response.status, 200);
  let state = (await response.json()).state;
  assert.equal(state.step, "setup");
  assert.equal(state.language, "ur");
  assert.equal(state.assist, "custom");
  assert.equal(state.title, "Rain film");
  assert.equal(state.revision, 1, "Each save advances the revision");

  // A later step saves only its own field, leaving the rest untouched.
  state = (await (await workflow({ step: "script" })).json()).state;
  assert.equal(state.step, "script");
  assert.equal(state.language, "ur", "An unrelated field is not reset");
  assert.equal(state.title, "Rain film");

  // visualStyle feeds the stored field the generation prompt already reads.
  state = (await (await workflow({ visualStyle: "Muted neon, handheld" })).json()).state;
  assert.equal(state.world, "Muted neon, handheld");
  assert.equal(state.visualStyle, "Muted neon, handheld");

  // --- language change invalidates authored scenes ------------------------
  saved = { ...saved, scenes: [{ id: "s1", title: "One", description: "Rain", characterIds: [], dialogues: [], takes: [] }] };
  state = (await (await workflow({ language: "en" })).json()).state;
  assert.equal(state.scenes[0].outdated, true, "Switching language flags existing scenes");
  // Saving the same language again must not re-flag anything.
  saved = { ...saved, scenes: [{ ...saved.scenes[0], outdated: false }] };
  state = (await (await workflow({ language: "en" })).json()).state;
  assert.equal(state.scenes[0].outdated, false, "An unchanged language leaves scenes alone");

  // --- validation ---------------------------------------------------------
  assert.equal((await workflow({ step: "nonsense" })).status, 400);
  assert.equal((await workflow({ title: "" })).status, 400);
  assert.equal((await workflow({ language: "fr" })).status, 400);
  assert.equal((await workflow({ revision: 99 })).status, 400, "Unknown fields are rejected");
  assert.equal((await workflow({ format: "portrait" })).status, 400, "Only supported formats are offered");

  // --- story size chosen in Setup -----------------------------------------
  state = (await (await workflow({ storyPlan: { sceneCount: 5, characterCount: 3 } })).json()).state;
  assert.deepEqual(state.storyPlan, { sceneCount: 5, characterCount: 3 });
  // One count changes without resetting the other.
  state = (await (await workflow({ storyPlan: { sceneCount: 4 } })).json()).state;
  assert.deepEqual(state.storyPlan, { sceneCount: 4, characterCount: 3 });
  // null hands the decision back to Omni.
  state = (await (await workflow({ storyPlan: { characterCount: null } })).json()).state;
  assert.deepEqual(state.storyPlan, { sceneCount: 4 });
  assert.equal((await workflow({ storyPlan: { sceneCount: 0 } })).status, 400);
  assert.equal((await workflow({ storyPlan: { sceneCount: 13 } })).status, 400, "Scenes are capped at the script limit");
  assert.equal((await workflow({ storyPlan: { sceneCount: 2.5 } })).status, 400);
  assert.equal((await workflow({ storyPlan: { extras: 2 } })).status, 400, "Unknown plan fields are rejected");

  // Characters named in Setup count towards the cast.
  await workflow({ storyPlan: { characterCount: 1 } });
  state = (await (await post({ action: "createCharacter", name: "Rohan" })).json()).state;
  state = (await (await post({ action: "createCharacter", name: "Samir" })).json()).state;
  assert.equal(state.characters.length, 2);
  assert.equal(state.storyPlan.characterCount, 2, "Adding past the planned count raises it");
  response = await workflow({ storyPlan: { characterCount: 1 } });
  assert.equal(response.status, 400, "The count cannot drop below the characters already set up");
  assert.match((await response.json()).error, /already have 2 characters/);
  assert.equal(saved.storyPlan.characterCount, 2, "A refused count changes nothing");
  // A pasted script's names become the writer's cast, without duplicates.
  assert.equal((await post({ action: "detectCast" })).status, 400, "Detection needs a script");
  saved = { ...saved, sourceScript: "ROHAN enters the hostel. SAMIR waves. DEEPAK, in a red cap, watches from the stairs." };
  scriptReply = { characters: [{ name: "Rohan", appearance: "" }, { name: "Deepak", appearance: "Red cap" }, { name: "Narrator", appearance: "" }] };
  response = await post({ action: "detectCast" });
  state = (await response.json()).state;
  assert.deepEqual(state.characters.map((item) => item.name), ["Rohan", "Samir", "Deepak"], "Existing names are not duplicated and a narrator is never cast");
  assert.equal(state.characters[2].appearance, "Red cap");
  assert.equal(state.characters[2].origin, "user");
  assert.equal(state.storyPlan.characterCount, 3, "The planned count grows to fit the script's cast");
  saved = { ...saved, characters: [], storyPlan: undefined, sourceScript: "" };

  // --- "Let Omni do it" ----------------------------------------------------
  const runId = "6f1c2c1e-6a43-4c0e-9b1e-2f7a1a0e3c11";
  saved = { ...saved, scenes: [] };
  assert.equal((await post({ action: "autoDirect", requestId: runId })).status, 400, "Needs a script first");
  assert.equal((await post({ action: "autoDirect", requestId: "not-a-uuid" })).status, 400);
  saved = { ...saved, scenes: [{ id: "s1", title: "Arrival", description: "Rain", characterIds: [], dialogues: [], takes: [], direction: { location: "Mine" } }] };
  scriptReply = { scenes: [{ id: "s1", location: "Omni's", lighting: "Dusk" }] };
  response = await post({ action: "autoDirect", requestId: runId });
  assert.equal(response.status, 200);
  let directedBody = await response.json();
  assert.deepEqual(directedBody.state.scenes[0].direction, { location: "Mine", lighting: "Dusk" });
  assert.equal(directedBody.state.directionMode, "omni");
  assert.equal(directedBody.state.autoDirected.filled, 1);
  assert.match(directedBody.notices[0], /filled in 1 scene detail\. Anything you had already written was kept/);
  // A retried request is not applied again, even if the writer cleared a field.
  saved = { ...saved, scenes: [{ ...saved.scenes[0], direction: { location: "Mine" } }] };
  directedBody = await (await post({ action: "autoDirect", requestId: runId })).json();
  assert.deepEqual(directedBody.state.scenes[0].direction, { location: "Mine" }, "The same request id is a no-op");
  assert.match(directedBody.notices[0], /already filled/);
  state = (await (await workflow({ directionMode: "director" })).json()).state;
  assert.equal(state.directionMode, "director");
  assert.equal((await workflow({ directionMode: "auto" })).status, 400);
  saved = { ...saved, scenes: [], directionMode: undefined, autoDirected: undefined };

  // --- ownership ----------------------------------------------------------
  user = null;
  assert.equal((await workflow({ step: "setup" })).status, 401);
  assert.equal((await route.GET({}, context)).status, 401);
  assert.equal((await route.DELETE({}, context)).status, 401);
  user = { id: "someone-else" };
  assert.equal((await workflow({ step: "setup" })).status, 404, "Another user cannot write this project");

  // --- delete -------------------------------------------------------------
  assert.equal((await route.DELETE({}, context)).status, 404, "A non-owner delete removes nothing");
  assert.deepEqual(deletes.at(-1), { id: "project", userId: "someone-else" });
  user = { id: "owner" };
  const removed = await route.DELETE({}, context);
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).deleted, "project");
  assert.deepEqual(deletes.at(-1), { id: "project", userId: "owner" });

  // --- loading returns a normalized project -------------------------------
  const loaded = await route.GET({}, context);
  assert.equal(loaded.status, 200);
  assert.equal((await loaded.json()).state.version, 2, "Every load returns the v2 shape");

  // --- scene, dialogue and voice editing ---------------------------------
  user = { id: "owner" };
  saved = normalizeStudioState({
    version: 2,
    revision: 0,
    title: "Film",
    premise: "",
    world: "",
    language: "en",
    characters: [
      { id: "c1", name: "Ayesha", appearance: "Dark suit", locked: false },
      { id: "c2", name: "Bilal", appearance: "Grey coat", locked: false },
    ],
    scenes: [
      {
        id: "s1",
        title: "Doorway",
        description: "Rain",
        characterIds: ["c1"],
        dialogues: [
          { id: "d1", character: "Ayesha", text: "One." },
          { id: "d2", character: "Ayesha", text: "Two." },
        ],
        takes: [],
      },
    ],
    messages: [],
    timeline: [],
    edits: {},
  });

  // visualAction and description stay in step so generation and the legacy UI agree.
  state = (await (await post({ action: "scenePatch", sceneId: "s1", patch: { visualAction: "She steps into rain." } })).json()).state;
  assert.equal(state.scenes[0].visualAction, "She steps into rain.");
  assert.equal(state.scenes[0].description, "She steps into rain.");
  assert.equal(state.scenes[0].outdated, true, "Editing a scene marks it for regeneration");

  // Cast may only reference characters that exist.
  assert.equal((await post({ action: "scenePatch", sceneId: "s1", patch: { characterIds: ["ghost"] } })).status, 400);
  assert.equal((await post({ action: "scenePatch", sceneId: "missing", patch: { title: "x" } })).status, 404);

  // Dialogue is addressed by stable id, never by position.
  state = (await (await post({ action: "dialogue", sceneId: "s1", operation: { kind: "update", dialogueId: "d1", text: "Edited." } })).json()).state;
  assert.equal(state.scenes[0].dialogues[0].text, "Edited.");
  assert.equal(state.scenes[0].dialogues[1].text, "Two.", "Only the addressed line changes");

  state = (await (await post({ action: "dialogue", sceneId: "s1", operation: { kind: "add", character: "Bilal", text: "Three." } })).json()).state;
  assert.equal(state.scenes[0].dialogues.length, 3);
  const addedId = state.scenes[0].dialogues[2].id;
  assert.ok(addedId && addedId !== "d1" && addedId !== "d2", "A new line gets its own id");

  state = (await (await post({ action: "dialogue", sceneId: "s1", operation: { kind: "reorder", dialogueIds: [addedId, "d2", "d1"] } })).json()).state;
  assert.deepEqual(state.scenes[0].dialogues.map((line) => line.id), [addedId, "d2", "d1"]);
  // Reordering must be a permutation: it can neither drop nor invent lines.
  assert.equal((await post({ action: "dialogue", sceneId: "s1", operation: { kind: "reorder", dialogueIds: ["d1"] } })).status, 400);
  assert.equal((await post({ action: "dialogue", sceneId: "s1", operation: { kind: "reorder", dialogueIds: [addedId, "d2", "ghost"] } })).status, 400);

  state = (await (await post({ action: "dialogue", sceneId: "s1", operation: { kind: "remove", dialogueId: "d2" } })).json()).state;
  assert.equal(state.scenes[0].dialogues.length, 2);
  assert.ok(!state.scenes[0].dialogues.some((line) => line.id === "d2"));
  assert.equal((await post({ action: "dialogue", sceneId: "s1", operation: { kind: "update", dialogueId: "gone", text: "x" } })).status, 404);

  // A scene may legitimately end up with no dialogue at all.
  for (const line of [...state.scenes[0].dialogues]) {
    state = (await (await post({ action: "dialogue", sceneId: "s1", operation: { kind: "remove", dialogueId: line.id } })).json()).state;
  }
  assert.equal(state.scenes[0].dialogues.length, 0, "An empty scene is a valid state");

  // --- voices are Urdu only ----------------------------------------------
  const voice = { archetype: "hero_female", gender: "female", label: "Hero (female)" };
  const rejected = await post({ action: "voice", characterId: "c1", voice });
  assert.equal(rejected.status, 400, "English speech is not selectable");
  assert.match((await rejected.json()).error, /only for Urdu/);

  saved = { ...saved, language: "ur" };
  state = (await (await post({ action: "voice", characterId: "c1", voice })).json()).state;
  assert.deepEqual(state.characters[0].voice, voice);
  state = (await (await post({ action: "voice", characterId: "c1", voice: null })).json()).state;
  assert.equal(state.characters[0].voice, undefined, "A voice can be cleared");
  assert.equal((await post({ action: "voice", characterId: "ghost", voice })).status, 404);

  // --- configurable clip length ------------------------------------------
  user = { id: "owner" };
  saved = normalizeStudioState({ ...saved, language: "en", clipSeconds: undefined });
  let body = await (await workflow({ clipSeconds: 20 })).json();
  // The REQUEST is stored, not the grid-snapped value: what the user chose and
  // what the pipeline can express are separate numbers, and conflating them is
  // how a 20s choice silently became something else.
  assert.equal(body.state.clipSeconds, 20, "The requested length is stored as requested");
  assert.ok(body.capability, "The client is told what this deployment allows");
  assert.equal(body.capability.extended, true);
  // The grid is still reported, so the interface can explain the difference.
  const twenty = body.capability.choices.find((choice) => choice.seconds === 20);
  assert.equal(twenty.frames, 481);
  assert.ok(Math.abs(twenty.actualSeconds - 20.04) < 0.01, "and what it really produces");

  // A length that is not one of the four offered is refused.
  let refused = await workflow({ clipSeconds: 45 });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /must be one of 5s, 10s, 15s, 20s/);

  // Per-scene override, stored as requested, and clearable.
  state = (await (await post({ action: "scenePatch", sceneId: "s1", patch: { requestedSeconds: 10 } })).json()).state;
  assert.equal(state.scenes[0].requestedSeconds, 10);
  state = (await (await post({ action: "scenePatch", sceneId: "s1", patch: { requestedSeconds: null } })).json()).state;
  assert.equal(state.scenes[0].requestedSeconds, undefined, "A scene can fall back to the project default");
  assert.equal(
    (await post({ action: "scenePatch", sceneId: "s1", patch: { requestedSeconds: 45 } })).status,
    400,
  );

  // --- shot sequences -----------------------------------------------------
  saved = normalizeStudioState({
    ...saved,
    language: "en",
    scenes: [
      {
        id: "s1",
        title: "Doorway",
        description: "Rain",
        visualAction: "Rain",
        characterIds: ["c1"],
        dialogues: [
          { id: "d1", character: "Ayesha", text: "One." },
          { id: "d2", character: "Ayesha", text: "Two." },
        ],
        takes: [],
      },
    ],
  });
  state = (
    await (
      await post({
        action: "beats",
        sceneId: "s1",
        beats: [
          { visualAction: "Wide on the door.", dialogueIds: ["d1"] },
          { visualAction: "Close on her hand.", dialogueIds: ["d2"] },
        ],
      })
    ).json()
  ).state;
  assert.equal(state.scenes[0].beats.length, 2);
  assert.ok(state.scenes[0].beats[0].id, "Beats get stable ids");
  // Every line must belong to exactly one shot.
  assert.equal(
    (await post({ action: "beats", sceneId: "s1", beats: [{ visualAction: "a", dialogueIds: ["d1"] }] })).status,
    400,
  );
  assert.equal(
    (
      await post({
        action: "beats",
        sceneId: "s1",
        beats: [
          { visualAction: "a", dialogueIds: ["d1", "d2"] },
          { visualAction: "b", dialogueIds: ["d1"] },
        ],
      })
    ).status,
    400,
  );
  // Clearing returns the scene to one continuous shot.
  state = (await (await post({ action: "beats", sceneId: "s1", beats: null })).json()).state;
  assert.equal(state.scenes[0].beats, undefined);

  // Urdu cannot cut inside a clip: one supplied track runs the whole take.
  saved = { ...saved, language: "ur" };
  refused = await post({
    action: "beats",
    sceneId: "s1",
    beats: [
      { visualAction: "a", dialogueIds: ["d1", "d2"] },
      { visualAction: "b", dialogueIds: [] },
    ],
  });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /cannot cut inside/);

  console.log(
    "PASS: scene patching with cast validation, id-addressed dialogue editing, permutation-only reordering, empty scenes, Urdu-only voice assignment, snapped clip lengths with a named capability refusal, and shot sequences with complete line assignment.",
  );

  // --- script regeneration must not lose or confuse identity -------------
  const locked = {
    id: "keep-me",
    name: "Ayesha",
    appearance: "Reviewed: dark suit, brass key.",
    locked: true,
    referenceId: "r1",
    references: [{ id: "r1", label: "Primary" }],
  };
  saved = normalizeStudioState({
    version: 2,
    revision: 0,
    title: "Film",
    premise: "x",
    world: "",
    language: "en",
    characters: [locked],
    scenes: [],
    messages: [],
    timeline: [],
    edits: {},
  });
  scriptReply = {
    title: "The Tape",
    premise: "p",
    world: "w",
    characters: [{ name: "Ayesha", appearance: "A fresh guess from the model" }],
    scenes: [
      {
        title: "Doorway",
        visualAction: "Rain",
        characters: ["Ayesha"],
        dialogues: [{ character: "Ayesha", text: "One." }],
      },
    ],
  };
  body = await (await post({ action: "script" })).json();
  assert.equal(body.state.characters.length, 1);
  assert.equal(body.state.characters[0].id, "keep-me", "Identity is the id, carried through");
  assert.equal(
    body.state.characters[0].appearance,
    "Reviewed: dark suit, brass key.",
    "A locked appearance is not overwritten by a regenerated script",
  );
  assert.deepEqual(body.state.characters[0].references, [{ id: "r1", label: "Primary" }]);
  assert.deepEqual(body.state.scenes[0].characterIds, ["keep-me"]);

  // An ambiguous name is never silently matched.
  saved = normalizeStudioState({
    ...saved,
    characters: [
      { ...locked, id: "a1" },
      { ...locked, id: "a2", referenceId: "r2", references: [{ id: "r2", label: "Primary" }] },
    ],
    scenes: [],
  });
  body = await (await post({ action: "script" })).json();
  const rebuilt = body.state.characters.filter((item) => !["a1", "a2"].includes(item.id));
  assert.equal(rebuilt.length, 1, "The script's character becomes a new, distinct record");
  assert.ok(
    body.state.characters.some((item) => item.id === "a1") &&
      body.state.characters.some((item) => item.id === "a2"),
    "Both reviewed characters are kept rather than one being guessed at",
  );
  assert.ok(
    body.notices?.some((notice) => /names more than one character/.test(notice)),
    "The ambiguity is reported, not hidden",
  );
  assert.deepEqual(
    body.state.scenes[0].characterIds,
    [],
    "An ambiguous cast name attaches nobody rather than the wrong person",
  );
  assert.ok(body.notices.some((notice) => /missing cast/.test(notice)));

  // Two incoming characters sharing a name is a generation failure.
  saved = normalizeStudioState({ ...saved, characters: [], scenes: [] });
  scriptReply = {
    ...scriptReply,
    characters: [
      { name: "Ayesha", appearance: "one" },
      { name: "ayesha", appearance: "two" },
    ],
  };
  refused = await post({ action: "script" });
  assert.equal(refused.status, 422);
  assert.match((await refused.json()).error, /for two characters/);

  // A reviewed character the new script forgot is kept, and said so.
  saved = normalizeStudioState({
    ...saved,
    characters: [{ ...locked, id: "orphan", name: "Bilal" }],
    scenes: [],
  });
  scriptReply = {
    ...scriptReply,
    characters: [{ name: "Ayesha", appearance: "new" }],
    scenes: [{ title: "s", visualAction: "v", characters: ["Ayesha"], dialogues: [] }],
  };
  body = await (await post({ action: "script" })).json();
  assert.ok(body.state.characters.some((item) => item.id === "orphan"), "Reviewed work survives");
  assert.ok(body.notices.some((notice) => /does not include/.test(notice)));

  // Model shots are stored as beats addressing dialogue by stable id.
  saved = normalizeStudioState({ ...saved, characters: [], scenes: [] });
  scriptReply = {
    ...scriptReply,
    characters: [{ name: "Ayesha", appearance: "a" }],
    scenes: [
      {
        title: "Doorway",
        visualAction: "Rain",
        characters: ["Ayesha"],
        dialogues: [
          { character: "Ayesha", text: "One." },
          { character: "Ayesha", text: "Two." },
        ],
        shots: [
          { visualAction: "Wide.", lines: [1] },
          { visualAction: "Close.", lines: [2] },
        ],
      },
    ],
  };
  body = await (await post({ action: "script" })).json();
  const built = body.state.scenes[0];
  assert.equal(built.beats.length, 2);
  assert.deepEqual(built.beats[0].dialogueIds, [built.dialogues[0].id]);
  assert.deepEqual(built.beats[1].dialogueIds, [built.dialogues[1].id]);
  assert.ok(
    built.beats.every((beat) => beat.dialogueIds.every((id) => typeof id === "string" && id.length)),
    "Positions never survive into storage",
  );

  console.log(
    "PASS: regeneration preserves identity by id, refuses duplicate incoming names, keeps reviewed characters, reports ambiguity instead of guessing, and stores model shots as id-addressed beats.",
  );

  console.log(
    "PASS: workflow patch saves, field isolation, language invalidation, strict validation, ownership on read/write/delete, owner-scoped deletion, and normalized loads.",
  );

  await workflow({ creativeBrief: { audience: "Families", tone: "Hopeful" } });
  state = (await (await workflow({ creativeBrief: { ending: "An open question" } })).json()).state;
  assert.equal(state.creativeBrief.tone, "Hopeful", "Progressive decisions merge rather than dropping earlier answers");
  assert.equal(state.creativeBrief.ending, "An open question");
  const existingId = state.scenes[0].id;
  const characterId = state.scenes[0].characterIds[0];
  const identityBefore = structuredClone(state.characters.find(item => item.id === characterId));
  state = (await (await post({ action: "scenePatch", sceneId: existingId, patch: { direction: { wardrobe: { [characterId]: "A raincoat" }, location: "Concert hall" } } })).json()).state;
  state = (await (await post({ action: "scenePatch", sceneId: existingId, patch: { direction: { camera: "Slow push in" } } })).json()).state;
  assert.equal(state.scenes[0].direction.wardrobe[characterId], "A raincoat");
  assert.equal(state.scenes[0].direction.location, "Concert hall");
  assert.deepEqual(state.characters.find(item => item.id === characterId), identityBefore);
  assert.equal((await post({ action: "scenePatch", sceneId: existingId, patch: { direction: { wardrobe: { stranger: "Coat" } } } })).status, 400);
  const timelineBefore = structuredClone(saved.clips);
  state = (await (await post({ action: "sceneList", operation: "add" })).json()).state;
  const addedScene = state.scenes.at(-1).id;
  state = (await (await post({ action: "sceneList", operation: "move", sceneId: addedScene, toIndex: 0 })).json()).state;
  assert.equal(state.scenes[0].id, addedScene);
  state = (await (await post({ action: "sceneList", operation: "remove", sceneId: existingId })).json()).state;
  assert.ok(state.archivedScenes.some(item => item.id === existingId));
  state = (await (await post({ action: "undoScript" })).json()).state;
  assert.ok(state.scenes.some(item => item.id === existingId));
  assert.deepEqual(state.clips, timelineBefore, "Script operations preserve unrelated timeline edits");
  console.log("PASS: progressive brief merging, scene-only wardrobe, stable scene add/reorder/archive/undo and preserved timeline edits.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
