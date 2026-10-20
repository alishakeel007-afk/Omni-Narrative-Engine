// One source video per scene: continuous or internally cut. Covers the prompt
// shape, the Urdu-only single-turn rule, and shot/dialogue assignment.
const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");

const CAST = [
  { id: "c1", name: "Ayesha", appearance: "Dark suit, long black hair. A brass key on a chain.", locked: true },
  { id: "c2", name: "Bilal", appearance: "Grey wool coat, close-cropped beard. Left hand bandaged.", locked: true },
];

function scene(overrides = {}) {
  return {
    id: "s1",
    title: "Doorway",
    description: "She steps through a doorway into rain.",
    visualAction: "She steps through a doorway into rain.",
    characterIds: ["c1", "c2"],
    dialogues: [
      { id: "d1", character: "Ayesha", text: "I came back for the recording." },
      { id: "d2", character: "Bilal", text: "It was never yours to take." },
    ],
    takes: [],
    ...overrides,
  };
}

(async () => {
  const { beatProblem, urduShotProblem, clipProblem, MAX_BEATS } = loadTs("lib/film/shots.ts");
  const { buildFilmPrompt, resolveBeats, shortDescriptor } = loadTs("lib/film/prompt.ts");
  const state = { world: "", visualStyle: "Muted neon, handheld", characters: CAST };

  // --- a continuous shot --------------------------------------------------
  let prompt = buildFilmPrompt({ state, scene: scene(), language: "en", clipSeconds: 8 });
  assert.match(prompt, /ONE continuous 8\.0-second take/);
  assert.match(prompt, /with no cuts/);
  assert.doesNotMatch(prompt, /CUT TO/, "A single take has no cut markers");
  assert.match(prompt, /Ayesha .*says exactly: "I came back for the recording\."/);
  assert.doesNotMatch(prompt, /\|/, "Shots are prose, never pipe-separated");

  // --- a multi-shot sequence, still one video -----------------------------
  const sequence = scene({
    beats: [
      { id: "b1", visualAction: "Wide: she pushes the door open into the rain.", dialogueIds: ["d1"] },
      { id: "b2", visualAction: "Close on Bilal under the awning, unmoving.", dialogueIds: ["d2"] },
    ],
  });
  prompt = buildFilmPrompt({ state, scene: sequence, language: "en", clipSeconds: 12 });
  assert.match(prompt, /one 12\.0-second scene/, "One video, not several");
  assert.match(prompt, /2 connected shots in chronological order/);
  assert.match(prompt, /A hard cut transitions/, "Cuts are explicit prose");
  assert.doesNotMatch(prompt, /\|/, "Still no pipe separators");
  // Chronological, with times, in the written order.
  assert.ok(
    prompt.indexOf("she pushes the door") < prompt.indexOf("A hard cut") &&
      prompt.indexOf("A hard cut") < prompt.indexOf("Close on Bilal"),
    "Shots read in order with the cut between them",
  );
  assert.doesNotMatch(prompt, /Shot \d+ —|\d+\.\ds to \d+\.\ds/, "No numbered shot-list syntax in the conditioning prompt");
  // Recurring character details: the distinguishing phrase is repeated at the
  // speaker in each shot, which is what holds identity across a cut.
  assert.match(prompt, /Ayesha \(Dark suit, long black hair\./);
  assert.match(prompt, /Bilal \(Grey wool coat, close-cropped beard\./);
  assert.match(prompt, /identical on both sides of every cut/);
  // Audio continuity across the cuts.
  assert.match(prompt, /ambience and score continue unbroken through every cut/);
  assert.match(prompt, /no silence, no restart and no level jump at a cut/);
  // Two speakers in one English clip is allowed.
  assert.match(prompt, /I came back for the recording/);
  assert.match(prompt, /It was never yours to take/);

  // Beat times tile the clip exactly.
  const beats = resolveBeats(sequence, "en", 12);
  assert.equal(beats.length, 2);
  assert.equal(beats[0].startSeconds, 0);
  assert.equal(beats[1].endSeconds, 12, "The last shot ends exactly at the clip length");
  assert.equal(beats[0].endSeconds, beats[1].startSeconds, "No gap and no overlap");
  // A silent beat still gets screen time rather than collapsing to zero.
  const mixed = resolveBeats(
    scene({
      beats: [
        { id: "b1", visualAction: "Empty corridor.", dialogueIds: [] },
        { id: "b2", visualAction: "She speaks.", dialogueIds: ["d1", "d2"] },
      ],
    }),
    "en",
    10,
  );
  assert.ok(mixed[0].endSeconds > 0.2, "A wordless shot is still on screen");

  // --- silence is unconditional -------------------------------------------
  const silent = buildFilmPrompt({
    state,
    scene: scene({ dialogues: [] }),
    language: "en",
    clipSeconds: 5,
  });
  assert.match(silent, /contains NO speech of any kind/);
  assert.match(silent, /no whispering, singing, chanting, crowd chatter/);
  assert.match(silent, /no off-screen or background voices/);
  assert.doesNotMatch(
    silent,
    /unless explicitly requested/,
    "The old conditional wording left an opening the model could take",
  );
  assert.doesNotMatch(silent, /says exactly/);

  // Legacy narrator lines are not speech: a scene holding only one is silent.
  const narratorOnly = buildFilmPrompt({
    state,
    scene: scene({ dialogues: [{ id: "s1-narration", character: "Narrator", text: "The city forgot her." }] }),
    language: "en",
    clipSeconds: 5,
  });
  assert.match(narratorOnly, /NO speech of any kind/);
  assert.doesNotMatch(narratorOnly, /The city forgot her/);

  // --- supplied speech (Urdu) is preserved, never regenerated -------------
  const urdu = buildFilmPrompt({
    state,
    scene: scene({ dialogues: [{ id: "d1", character: "Ayesha", text: "میں واپس آئی ہوں۔" }] }),
    language: "ur",
    clipSeconds: 6,
    suppliedSpeech: true,
  });
  assert.match(urdu, /speech track is supplied and must be preserved exactly/);
  assert.match(urdu, /do not re-speak, re-time, translate, extend or add to it/);
  assert.match(urdu, /Match mouth movement to the supplied speech/);
  assert.match(urdu, /says exactly in Urdu/);

  // --- shot/dialogue assignment ------------------------------------------
  assert.equal(beatProblem(scene()), null, "No beats is always valid");
  assert.equal(beatProblem(sequence), null);
  assert.match(
    beatProblem(scene({ beats: [{ id: "b1", visualAction: "x", dialogueIds: ["d1", "d2"] }, { id: "b2", visualAction: "y", dialogueIds: ["d1"] }] })),
    /assigned to two shots/,
  );
  assert.match(
    beatProblem(scene({ beats: [{ id: "b1", visualAction: "x", dialogueIds: ["d1"] }, { id: "b2", visualAction: "y", dialogueIds: [] }] })),
    /not assigned to a shot/,
    "A line in no shot would silently vanish from the clip",
  );
  assert.match(
    beatProblem(scene({ beats: [{ id: "b1", visualAction: "x", dialogueIds: ["ghost"] }, { id: "b2", visualAction: "y", dialogueIds: ["d1", "d2"] }] })),
    /no longer in this scene/,
  );
  assert.match(
    beatProblem(scene({ beats: [{ id: "b1", visualAction: "   ", dialogueIds: ["d1", "d2"] }] })),
    /needs a visual action/,
  );
  assert.match(
    beatProblem(
      scene({
        beats: Array.from({ length: MAX_BEATS + 1 }, (_, index) => ({
          id: `b${index}`,
          visualAction: "x",
          dialogueIds: index === 0 ? ["d1", "d2"] : [],
        })),
      }),
    ),
    new RegExp(`up to ${MAX_BEATS} shots`),
  );

  // --- the single-turn rule is Urdu-only ---------------------------------
  assert.match(urduShotProblem(scene()), /one speaking turn per clip/);
  assert.equal(urduShotProblem(scene({ dialogues: [{ id: "d1", character: "Ayesha", text: "ایک" }] })), null);
  assert.match(
    urduShotProblem(scene({ dialogues: [{ id: "d1", character: "Ayesha", text: "ایک" }], beats: [
      { id: "b1", visualAction: "x", dialogueIds: ["d1"] },
      { id: "b2", visualAction: "y", dialogueIds: [] },
    ] })),
    /cannot cut inside a clip/,
  );

  // English is NOT subject to it: two speakers in one clip is fine.
  assert.equal(
    clipProblem({ scene: scene(), language: "en", clipSeconds: 20 }),
    null,
    "Two English speakers share one clip",
  );
  assert.equal(clipProblem({ scene: sequence, language: "en", clipSeconds: 20 }), null);
  assert.match(
    clipProblem({ scene: scene(), language: "ur", clipSeconds: 20 }),
    /one speaking turn per clip/,
  );
  // Over-budget names the measurement and the fix, never truncates.
  const over = clipProblem({ scene: scene(), language: "en", clipSeconds: 1.5 });
  assert.match(over, /"Doorway" has about/);
  assert.match(over, /more than the/);
  assert.match(over, /Shorten a line, split the scene, or raise the clip length/);

  // --- descriptors stay short enough to repeat ----------------------------
  assert.equal(shortDescriptor("Dark suit, long hair. Brass key."), "Dark suit, long hair.");
  assert.ok(shortDescriptor("x".repeat(400)).length <= 141);

  console.log(
    "PASS: prose multi-shot prompts with explicit cuts and no pipes, recurring character details, audio continuity, unconditional silence, supplied-speech preservation, shot/line assignment, and the Urdu-only single-turn rule.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
