// Step 2 characters: appearance editing, reference upload and analysis, view
// management, and locking — all addressed by the character's stable id.
const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");

class StudioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** A real 1x1 PNG, so the route's magic-byte check sees a genuine file. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001" +
    "0d0a2db40000000049454e44ae426082",
  "hex",
);

function photo(name = "face.png") {
  return new File([PNG], name, { type: "image/png" });
}

function character(overrides = {}) {
  return {
    id: "c1",
    name: "Ayesha",
    appearance: "Dark suit.",
    locked: false,
    referenceId: "r1",
    references: [{ id: "r1", label: "Primary" }],
    ...overrides,
  };
}

(async () => {
  const { normalizeStudioState } = loadTs("types/studio.ts");

  let user = { id: "owner" };
  let saved;
  let created = [];
  let deleted = [];
  let analysis = { appearance: "Re-read from every view: dark suit, brass key." };
  let analyseCalls = [];

  const next = {
    NextResponse: {
      json: (body, init) => ({ status: init?.status || 200, json: async () => body }),
    },
  };
  const auth = {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
  };
  const store = {
    StudioError,
    loadStudio: async (owner, id) => {
      if (owner !== "owner") throw new StudioError("Project not found.", 404);
      return { project: { id, userId: owner }, state: structuredClone(saved) };
    },
    saveStudio: async (loaded, state) => {
      saved = { ...state, revision: loaded.state.revision + 1 };
      return saved;
    },
    referenceData: async () => ({ mimeType: "image/png", data: PNG.toString("base64") }),
  };
  const prisma = {
    prisma: {
      filmReference: {
        create: async ({ data }) => {
          const record = { id: `ref-${created.length + 1}`, ...data };
          created.push(record);
          return record;
        },
        delete: async ({ where }) => {
          deleted.push(where.id);
          return {};
        },
      },
    },
  };
  const env = {
    getEnvValue: () => "",
  };

  const route = loadTs("app/api/studio/[id]/reference/route.ts", {
    "next/server": next,
    "@/lib/supabase/server": auth,
    "@/lib/studio/store": store,
    "@/lib/prisma": prisma,
    "@/lib/env": env,
    "@/lib/studio/ai": {
      analyseCharacter: async (images, name) => {
        analyseCalls.push({ views: images.length, name });
        return analysis;
      },
    },
  });

  const context = { params: Promise.resolve({ id: "project" }) };
  const upload = (fields) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    return route.POST({ formData: async () => form }, context);
  };

  const fresh = (characters, scenes = []) => {
    saved = normalizeStudioState({
      version: 2,
      revision: 0,
      title: "Film",
      premise: "",
      world: "",
      language: "en",
      characters,
      scenes,
      messages: [],
      timeline: [],
      edits: {},
    });
    created = [];
    deleted = [];
    analyseCalls = [];
  };

  // --- a new character is created from a photo ----------------------------
  fresh([]);
  let response = await upload({ file: photo(), name: "Ayesha", view: "Primary" });
  assert.equal(response.status, 200);
  let state = (await response.json()).state;
  assert.equal(state.characters.length, 1);
  assert.ok(state.characters[0].id, "A new character gets its own id");
  assert.equal(state.characters[0].appearance, analysis.appearance, "The analysis is what is stored");
  assert.equal(state.characters[0].locked, false, "Nothing is locked before the user reviews it");
  assert.deepEqual(state.characters[0].references, [{ id: "ref-1", label: "Primary" }]);
  assert.equal(state.characters[0].referenceId, "ref-1");
  assert.deepEqual(analyseCalls, [{ views: 1, name: "Ayesha" }]);

  // --- a photo-only character receives an editable working name -----------
  fresh([]);
  state = (await (await upload({ file: photo(), createCharacter: "true", view: "Primary" })).json()).state;
  assert.equal(state.characters[0].name, "Character 1");
  assert.deepEqual(analyseCalls, [{ views: 1, name: "Character 1" }]);

  // --- adding a view re-reads every view together -------------------------
  fresh([character({ locked: true })], [
    { id: "s1", title: "One", description: "x", characterIds: ["c1"], dialogues: [], takes: [], outdated: false },
    { id: "s2", title: "Two", description: "y", characterIds: [], dialogues: [], takes: [], outdated: false },
  ]);
  state = (await (await upload({ file: photo(), characterId: "c1", view: "Side" })).json()).state;
  assert.equal(analyseCalls[0].views, 2, "The previous view is re-read with the new one");
  assert.deepEqual(
    state.characters[0].references.map((view) => view.label),
    ["Primary", "Side"],
  );
  assert.equal(state.characters[0].referenceId, "r1", "The primary view does not move on its own");
  assert.equal(state.characters[0].appearance, analysis.appearance);
  assert.equal(
    state.characters[0].locked,
    false,
    "The lock is released: the user has not reviewed this appearance",
  );
  assert.equal(state.scenes[0].outdated, true, "Scenes with this character need regenerating");
  assert.equal(state.scenes[1].outdated, false, "An unrelated scene is left alone");

  // A generated portrait was created from the stored appearance already. Its
  // approval must add the reference without consuming a vision/AI request.
  fresh([character({ locked: true })]);
  state = (await (await upload({ file: photo(), characterId: "c1", skipAnalysis: "true", view: "Approved generated portrait" })).json()).state;
  assert.equal(analyseCalls.length, 0, "portrait approval does not re-analyse the image");
  assert.equal(state.characters[0].appearance, "Dark suit.");
  assert.equal(state.characters[0].references.length, 2);

  // --- identity is the id, not the name -----------------------------------
  // Two characters legitimately share a display name. Addressing by id puts the
  // view on the right one; addressing by name alone is refused rather than
  // guessed at.
  fresh([
    character({ id: "c1", references: [{ id: "r1", label: "Primary" }] }),
    character({ id: "c2", referenceId: "r2", references: [{ id: "r2", label: "Primary" }] }),
  ]);
  state = (await (await upload({ file: photo(), characterId: "c2", view: "Side" })).json()).state;
  assert.equal(state.characters[0].references.length, 1, "The other character is untouched");
  assert.equal(state.characters[1].references.length, 2);

  fresh([
    character({ id: "c1" }),
    character({ id: "c2", referenceId: "r2", references: [{ id: "r2", label: "Primary" }] }),
  ]);
  response = await upload({ file: photo(), name: "Ayesha", view: "Side" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /More than one character here is called/);
  assert.equal(created.length, 0, "Nothing was stored for a refused upload");
  assert.equal(saved.revision, 0, "The project is unchanged");

  // A unique name still resolves, so existing flows keep working.
  fresh([character({ id: "c1", name: "Ayesha" }), character({ id: "c2", name: "Bilal", referenceId: "r2", references: [{ id: "r2", label: "Primary" }] })]);
  state = (await (await upload({ file: photo(), name: "Bilal", view: "Side" })).json()).state;
  assert.equal(state.characters[1].references.length, 2);
  assert.equal(state.characters[0].references.length, 1);

  // An unknown id is a not-found, never a silent new character.
  fresh([character()]);
  response = await upload({ file: photo(), characterId: "ghost" });
  assert.equal(response.status, 404);
  assert.equal(saved.characters.length, 1);

  // --- limits and validation ---------------------------------------------
  fresh([
    character({
      references: Array.from({ length: 6 }, (_, index) => ({ id: `r${index}`, label: `View ${index}` })),
    }),
  ]);
  response = await upload({ file: photo(), characterId: "c1" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /supports six views/);

  fresh(Array.from({ length: 12 }, (_, index) => character({ id: `c${index}`, name: `Person ${index}` })));
  response = await upload({ file: photo(), name: "Thirteenth" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /up to 12 characters/);
  // An existing character may still gain a view at the cap.
  assert.equal((await upload({ file: photo(), characterId: "c0" })).status, 200);

  // A file that is not the image type it claims is refused.
  fresh([]);
  // Large enough to pass the size floor, so the magic-byte check is what runs.
  response = await upload({
    file: new File([Buffer.alloc(64, 0x41)], "x.png", { type: "image/png" }),
    name: "Ayesha",
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /does not match its image type/);
  assert.equal(created.length, 0);

  // A failed analysis leaves no orphaned reference row behind.
  fresh([character()]);
  const broken = loadTs("app/api/studio/[id]/reference/route.ts", {
    "next/server": next,
    "@/lib/supabase/server": auth,
    "@/lib/studio/store": {
      ...store,
      saveStudio: async () => {
        throw new StudioError("Save failed.", 409);
      },
    },
    "@/lib/prisma": prisma,
    "@/lib/env": env,
    "@/lib/studio/ai": { analyseCharacter: async () => analysis },
  });
  const form = new FormData();
  form.set("file", photo());
  form.set("characterId", "c1");
  response = await broken.POST({ formData: async () => form }, context);
  assert.equal(response.status, 409);
  assert.deepEqual(deleted, ["ref-1"], "The stored reference is cleaned up");

  // --- ownership ----------------------------------------------------------
  fresh([character()]);
  user = null;
  assert.equal((await upload({ file: photo(), characterId: "c1" })).status, 401);
  assert.equal((await route.GET({ url: "http://x/?referenceId=r1" }, context)).status, 401);
  user = { id: "someone-else" };
  assert.equal((await upload({ file: photo(), characterId: "c1" })).status, 404);

  // --- a view is readable only through its own project --------------------
  user = { id: "owner" };
  const image = await route.GET({ url: "http://x/?referenceId=r1" }, context);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("Content-Type"), "image/png");
  assert.equal(image.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await route.GET({ url: "http://x/?referenceId=nope" }, context)).status, 404);

  console.log(
    "PASS: id-addressed reference upload, re-analysis across every view, lock release on change, refusal to guess an ambiguous name, view and character caps, orphan cleanup, ownership, and private view reads.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
