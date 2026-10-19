// Step 3: per-scene generation status, budgets against the real caps, clip
// assembly from measured durations, and the staleness contract.
const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");

class StudioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// duration.ts reads process.env directly so it stays client-safe, so a
// deployment is configured with the variable rather than a module mock. This
// suite runs at the validated default except where a block says otherwise.
delete process.env.STUDIO_CLIP_MAX_SECONDS;

function character(overrides = {}) {
  return {
    id: "c1",
    name: "Ayesha",
    appearance: "Dark suit, long hair.",
    locked: true,
    referenceId: "r1",
    references: [{ id: "r1", label: "Primary" }],
    ...overrides,
  };
}

function take(overrides = {}) {
  return {
    id: "t1",
    providerId: "p1",
    kind: "video",
    status: "complete",
    url: "https://demo.supabase.co/storage/v1/object/public/v/a.mp4",
    provider: "modal-ltx",
    nativeAudio: true,
    duration: 4.9,
    requestedSeconds: 5.04,
    requestedFrames: 121,
    identity: [loadTs("lib/studio/identity.ts").identityProfile(character())],
    continuity: { status: "passed", method: "visual-review" },
    prompt: "x",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function scene(overrides = {}) {
  return {
    id: "s1",
    title: "Doorway",
    description: "Rain",
    visualAction: "Rain",
    characterIds: ["c1"],
    dialogues: [{ id: "d1", character: "Ayesha", text: "I came back." }],
    takes: [],
    ...overrides,
  };
}

(async () => {
  const { normalizeStudioState } = loadTs("types/studio.ts");
  const { identityProfile } = loadTs("lib/studio/identity.ts");

  /**
   * A take that has passed its appearance check, as assembling requires.
   * The identity key is computed the same way production computes it, so the
   * fixture cannot drift from the check it is meant to satisfy.
   */
  const checked = (overrides = {}) =>
    take({
      identity: [identityProfile(character())],
      continuity: { status: "passed", method: "visual-review" },
      ...overrides,
    });

  const { sceneGeneration, filmGeneration, assembleClips, MAX_FILM_CLIPS, MAX_FILM_SECONDS } =
    loadTs("lib/film/generate.ts");

  const project = (overrides = {}) =>
    normalizeStudioState({
      version: 2,
      revision: 0,
      title: "Film",
      premise: "",
      world: "",
      language: "en",
      characters: [character()],
      scenes: [scene()],
      messages: [],
      timeline: [],
      edits: {},
      ...overrides,
    });

  const statusOf = (state, jobs = []) => sceneGeneration(state, state.scenes[0], 0, jobs).status;

  // --- status ------------------------------------------------------------
  assert.equal(statusOf(project()), "pending", "A locked cast with no take is ready to generate");

  // A written character is enough for a first take. A reference becomes an
  // optional continuity anchor only once the writer locks it.
  let unreferenced = sceneGeneration(
    project({ characters: [character({ locked: false })] }),
    project({ characters: [character({ locked: false })] }).scenes[0],
    0,
    [],
  );
  assert.equal(unreferenced.status, "pending");

  let blocked = sceneGeneration(project({ characters: [] }), project({ characters: [] }).scenes[0], 0, []);
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.problem, /no longer exists/);

  // Too much dialogue for the clip blocks it too, with the measurement named.
  const crowded = project({
    scenes: [
      scene({
        dialogues: Array.from({ length: 6 }, (_, index) => ({
          id: `d${index}`,
          character: "Ayesha",
          text: "This is a reasonably long line of dialogue to say out loud.",
        })),
      }),
    ],
  });
  const tooMuch = sceneGeneration(crowded, crowded.scenes[0], 0, []);
  assert.equal(tooMuch.status, "blocked");
  assert.match(tooMuch.problem, /more than the/);

  // An active job is reported as working, with its phase available.
  const working = sceneGeneration(project(), project().scenes[0], 0, [
    { id: "j1", sceneId: "s1", kind: "video", status: "running", phase: "poll" },
  ]);
  assert.equal(working.status, "working");
  assert.equal(working.job.phase, "poll");

  // A stopped job wins over everything else: the user has to decide.
  const failed = sceneGeneration(
    project({ scenes: [scene({ takes: [take()], selectedVideoId: "t1", outdated: true })] }),
    project({ scenes: [scene({ takes: [take()], selectedVideoId: "t1", outdated: true })] }).scenes[0],
    0,
    [{ id: "j1", sceneId: "s1", kind: "video", status: "failed", phase: "poll", error: "The provider stopped." }],
  );
  assert.equal(failed.status, "failed", "A stale notice must not hide a stopped job");
  assert.equal(failed.problem, "The provider stopped.");

  // Chat jobs belong to the old studio and are ignored here.
  assert.equal(
    statusOf(project(), [{ id: "j1", sceneId: "s1", kind: "chat", status: "running", phase: "prepare" }]),
    "pending",
  );

  // A finished, selected, current take is ready.
  let ready = project({ scenes: [scene({ takes: [take()], selectedVideoId: "t1" })] });
  assert.equal(statusOf(ready), "ready");
  assert.equal(sceneGeneration(ready, ready.scenes[0], 0, []).measuredSeconds, 4.9);

  // Either marker makes it out of date, and neither deletes the take.
  for (const overrides of [{ outdated: true }, {}]) {
    const stale = project({
      scenes: [
        scene({
          takes: [take(overrides.outdated ? {} : { stale: true })],
          selectedVideoId: "t1",
          ...overrides,
        }),
      ],
    });
    const result = sceneGeneration(stale, stale.scenes[0], 0, []);
    assert.equal(result.status, "stale");
    assert.ok(result.take, "The existing take is kept, not discarded");
    assert.match(result.problem, /changed after its video was made/);
  }

  // An unselected take is not a finished scene.
  assert.equal(statusOf(project({ scenes: [scene({ takes: [take()] })] })), "review");
  // Nor is an incomplete one.
  assert.equal(
    statusOf(project({ scenes: [scene({ takes: [take({ status: "rendering", url: undefined })] })] })),
    "pending",
  );

  // --- the film as a whole ------------------------------------------------
  let film = filmGeneration(project(), []);
  assert.equal(film.complete, false);
  assert.equal(film.pending.length, 1);
  assert.equal(film.measuredSeconds, 0, "Nothing is finished, so nothing is measured");
  assert.ok(film.requestedSeconds > 0, "The ask is known before anything is generated");
  assert.match(film.problem, /1 scene still needs a finished video: Doorway/);

  film = filmGeneration(ready, []);
  assert.equal(film.complete, true);
  assert.equal(film.problem, undefined);
  assert.equal(film.measuredSeconds, 4.9);

  assert.match(filmGeneration(project({ scenes: [] }), []).problem, /no scenes yet/);

  // Measured and requested are reported separately, and measured is what the
  // export budget is checked against.
  const twoScenes = project({
    scenes: [
      scene({ id: "s1", takes: [take()], selectedVideoId: "t1" }),
      scene({ id: "s2", title: "Hall", dialogues: [], takes: [take({ id: "t2", duration: 3.1 })], selectedVideoId: "t2" }),
    ],
  });
  film = filmGeneration(twoScenes, []);
  assert.equal(film.complete, true);
  assert.ok(Math.abs(film.measuredSeconds - 8.0) < 0.001);
  assert.equal(film.requestedSeconds, 10, "Two requested 5s clips stay distinct from frame-grid and measured duration");

  // Caps: clip count and total length, each named with its own fix.
  const many = project({
    scenes: Array.from({ length: MAX_FILM_CLIPS + 1 }, (_, index) =>
      scene({ id: `s${index}`, dialogues: [], takes: [take({ id: `t${index}`, duration: 1 })], selectedVideoId: `t${index}` }),
    ),
  });
  assert.match(filmGeneration(many, []).problem, new RegExp(`hold ${MAX_FILM_CLIPS} clips`));

  const long = project({
    scenes: Array.from({ length: 12 }, (_, index) =>
      scene({ id: `s${index}`, dialogues: [], takes: [take({ id: `t${index}`, duration: 20 })], selectedVideoId: `t${index}` }),
    ),
  });
  const overTime = filmGeneration(long, []).problem;
  assert.match(overTime, new RegExp(`over the ${MAX_FILM_SECONDS}s`));
  assert.match(overTime, /240\.0s in total/);

  // --- assembling ---------------------------------------------------------
  let clips = assembleClips(twoScenes);
  assert.equal(clips.length, 2, "One clip per scene, in scene order");
  assert.deepEqual(clips.map((clip) => clip.sceneId), ["s1", "s2"]);
  assert.equal(clips[0].sourceIn, 0);
  assert.equal(
    clips[0].sourceOut,
    4.9,
    "The clip spans the MEASURED file, never the requested length",
  );
  assert.notEqual(clips[0].sourceOut, clips[0].sourceTakeId === "t1" ? 5.04 : -1);
  assert.equal(clips[0].clipVolume, 1, "A native-audio clip plays its own soundtrack");
  assert.ok(new Set(clips.map((clip) => clip.id)).size === clips.length, "Clip ids are unique");

  // A scene with internal cuts is still ONE clip: splitting is the editor's job.
  const sequence = project({
    scenes: [
      scene({
        takes: [take()],
        selectedVideoId: "t1",
        beats: [
          { id: "b1", visualAction: "Wide.", dialogueIds: ["d1"] },
          { id: "b2", visualAction: "Close.", dialogueIds: [] },
        ],
      }),
    ],
  });
  assert.equal(assembleClips(sequence).length, 1, "Beats are cuts inside one source video");

  // A take with no measured duration cannot be placed.
  assert.deepEqual(
    assembleClips(project({ scenes: [scene({ takes: [take({ duration: undefined })], selectedVideoId: "t1" })] })),
    [],
  );
  // Nor can an unselected one.
  assert.deepEqual(assembleClips(project({ scenes: [scene({ takes: [take()] })] })), []);

  // --- staleness covers length and cuts ----------------------------------
  // Requested length remains part of the requirements even when unavailable;
  // an older take cannot silently satisfy a different requested duration.
  const { sceneRequirements: cappedRequirements } = loadTs("lib/studio/identity.ts");
  assert.notEqual(
    cappedRequirements(ready, ready.scenes[0]),
    cappedRequirements({ ...ready, clipSeconds: 20 }, ready.scenes[0]),
    "An unavailable request remains distinct from the last valid duration",
  );

  // With long clips enabled, a 20s request is a real change.
  process.env.STUDIO_CLIP_MAX_SECONDS = "20";
  const { sceneRequirements } = loadTs("lib/studio/identity.ts");
  const baseline = sceneRequirements(ready, ready.scenes[0]);
  assert.notEqual(
    baseline,
    sceneRequirements(
      { ...ready, clipSeconds: 20 },
      ready.scenes[0],
    ),
    "Changing the clip length invalidates an existing take",
  );
  assert.notEqual(
    baseline,
    sceneRequirements(ready, { ...ready.scenes[0], requestedSeconds: 10 }),
    "A per-scene length change invalidates it too",
  );
  assert.notEqual(
    baseline,
    sceneRequirements(ready, {
      ...ready.scenes[0],
      beats: [
        { id: "b1", visualAction: "Wide.", dialogueIds: ["d1"] },
        { id: "b2", visualAction: "Close.", dialogueIds: [] },
      ],
    }),
    "Cutting the scene into shots invalidates it",
  );
  assert.notEqual(
    baseline,
    sceneRequirements({ ...ready, language: "ur" }, ready.scenes[0]),
    "A language change routes to another pipeline entirely",
  );
  assert.equal(
    baseline,
    sceneRequirements(ready, ready.scenes[0]),
    "Nothing changed means nothing is stale",
  );

  console.log(
    "PASS: per-scene status with stopped jobs taking precedence, blocked reasons that name the fix, measured-versus-requested budgets, caps, one clip per scene including cut sequences, and staleness covering length, cuts and language.",
  );

  // Back to the validated default for the rest of the suite.
  delete process.env.STUDIO_CLIP_MAX_SECONDS;

  // --- the assemble action ------------------------------------------------
  // These fixtures carry a passed appearance check, because assembling a scene
  // with cast requires one.
  const assembled = project({
    scenes: [
      scene({ id: "s1", takes: [checked()], selectedVideoId: "t1" }),
      scene({ id: "s2", title: "Hall", dialogues: [], takes: [checked({ id: "t2", duration: 3.1 })], selectedVideoId: "t2" }),
    ],
  });
  const assembledLong = project({
    scenes: Array.from({ length: 12 }, (_, index) =>
      scene({
        id: `s${index}`,
        dialogues: [],
        takes: [checked({ id: `t${index}`, duration: 20 })],
        selectedVideoId: `t${index}`,
      }),
    ),
  });
  let user = { id: "owner" };
  let saved = assembled;
  const next = {
    NextResponse: {
      json: (body, init) => ({ status: init?.status || 200, json: async () => body }),
    },
  };
  const route = loadTs("app/api/studio/[id]/route.ts", {
    "next/server": next,
    "@/lib/supabase/server": {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
    },
    "@/lib/studio/store": {
      StudioError,
      loadStudio: async () => ({ project: { id: "project" }, state: structuredClone(saved) }),
      saveStudio: async (loaded, state) => {
        saved = { ...state, revision: loaded.state.revision + 1 };
        return saved;
      },
    },
    "@/lib/prisma": {},
    // Assembling now reads the live queue, so readiness matches what Step 3
    // shows. An empty queue means nothing is in flight.
    "@/lib/studio/scene-jobs": { listSceneJobs: async () => ({ jobs: [], threads: [] }) },
    "@/lib/studio/ai": {},
    "@/lib/audio/music-service": {},
    "@/lib/studio/media": {},
    "@/lib/studio/continuity": {},
    "@/lib/film/ai": {},
  });
  const context = { params: Promise.resolve({ id: "project" }) };
  const assemble = () => route.POST({ json: async () => ({ action: "assemble" }) }, context);

  let response = await assemble();
  assert.equal(response.status, 200);
  let state = (await response.json()).state;
  assert.equal(state.step, "edit", "Assembling opens the editor");
  assert.equal(state.clips.length, 2);
  assert.equal(state.clips[0].sourceOut, 4.9);
  assert.deepEqual(state.timeline, ["s1", "s2"], "The v1 field stays in step for export");

  // An unfinished scene refuses, naming what is missing.
  saved = project();
  response = await assemble();
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /still needs a finished video: Doorway/);

  // A failed appearance check is a gate, not a warning.
  saved = project({
    scenes: [
      scene({
        takes: [
          take({
            identity: [identityProfile(character())],
            continuity: { status: "failed", method: "visual-review" },
          }),
        ],
        selectedVideoId: "t1",
      }),
    ],
  });
  response = await assemble();
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Doorway/);

  // Over the export length, assembling is refused before any work is lost.
  saved = assembledLong;
  response = await assemble();
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, new RegExp(`over the ${MAX_FILM_SECONDS}s`));

  // --- Urdu generation is refused rather than mis-generated ---------------
  let startedNative = 0;
  const media = loadTs("lib/studio/media.ts", {
    "./ltx": {
      nativeVideoEnabled: () => true,
      audioVideoEnabled: () => false,
      startLtxVideo: async (input) => {
        startedNative += 1;
        return input;
      },
    },
    "./store": { StudioError },
    "./logic": {
      scenePrompt: (state) => ({
        scene: state.scenes[0],
        cast: [],
        prompt: "A doorway in rain.",
        continuityKey: "one",
      }),
    },
  });
  const urduProject = project({
    language: "ur",
    characters: [],
    scenes: [scene({ characterIds: [], dialogues: [{ id: "d1", character: "Ayesha", text: "میں واپس آئی ہوں۔" }] })],
  });
  await assert.rejects(
    () => media.startMedia(urduProject, "project", "s1", "video", true, {}),
    (error) => /Urdu video generation is not available yet/.test(error.message) && error.status === 503,
  );
  assert.equal(startedNative, 0, "Urdu text never reaches the native-audio pipeline");

  // English still generates, and asks for the configured length.
  const english = project({ characters: [], scenes: [scene({ characterIds: [] })] });
  const started = await media.startMedia(english, "project", "s1", "video", true, {});
  assert.equal(startedNative, 1);
  assert.equal(started.seconds, 5, "The request preserves the chosen duration; startLtxVideo derives its frame count separately");
  assert.match(started.prompt, /ONE continuous 5\.0-second take/);
  assert.match(started.prompt, /I came back\./);

  console.log(
    "PASS: assemble gates on finished scenes, appearance checks and the export length; Urdu is refused on the native path instead of generating the wrong speech.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
