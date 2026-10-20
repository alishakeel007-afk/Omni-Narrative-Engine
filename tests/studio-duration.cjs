// Configurable clip length: the frame grid, the capability flag, the
// duration-driven budgets, and the multi-shot prompt.
const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");

/**
 * duration.ts with a chosen deployment configuration.
 *
 * The module reads `process.env` directly rather than through `lib/env`, which
 * reaches for `fs` and would break the browser bundle. So a configuration is a
 * variable, not a module mock, and every call is wrapped to apply it — no test
 * reimplements what it is checking.
 */
function withConfig(values) {
  const module = loadTs("lib/film/duration.ts");
  const KEYS = ["STUDIO_CLIP_MAX_SECONDS", "STUDIO_CLIP_SECONDS"];
  const applied = (fn) =>
    (...args) => {
      const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
      for (const key of KEYS) {
        if (values[key] === undefined) delete process.env[key];
        else process.env[key] = values[key];
      }
      try {
        return fn(...args);
      } finally {
        for (const key of KEYS) {
          if (original[key] === undefined) delete process.env[key];
          else process.env[key] = original[key];
        }
      }
    };
  return Object.fromEntries(
    Object.entries(module).map(([name, value]) => [
      name,
      typeof value === "function" ? applied(value) : value,
    ]),
  );
}

(async () => {
  // --- the frame grid -----------------------------------------------------
  const base = withConfig({});
  assert.equal(base.FILM_FPS, 24);
  assert.equal(base.snapFrames(5, 481), 121, "5s at 24fps lands on 121 frames");
  assert.equal(base.snapFrames(20, 481), 481, "20s lands on 481 frames");
  assert.equal((base.snapFrames(7, 481) - 1) % 8, 0, "Every result sits on the 8k+1 grid");
  assert.equal(base.snapFrames(0.1, 481), 33, "Nothing shorter than the worker's minimum");
  assert.equal(base.snapFrames(60, 121), 121, "A request beyond the cap is clamped to it");
  assert.equal(base.onGrid(124), 121, "An off-grid cap is rounded down, never up");

  // --- the capability flag ------------------------------------------------
  // The default is the only validated length, so an untested clip length is
  // something an operator opts into rather than a user default.
  assert.equal(base.clipCapability().maxFrames, 121);
  assert.equal(base.clipCapability().extended, false);
  // All four lengths are always VISIBLE; only 5s is requestable by default, so
  // an untested length is something an operator enables rather than something
  // a user can stumble onto.
  assert.deepEqual(
    base.clipCapability().choices.map((choice) => choice.seconds),
    [5, 10, 15, 20],
    "Every choice stays visible",
  );
  assert.deepEqual(
    base.clipCapability().choices.filter((choice) => choice.available).map((choice) => choice.seconds),
    [5],
    "Only the validated length is requestable by default",
  );
  assert.deepEqual(base.clipCapability().options, [5]);
  assert.equal(base.clipCapability().defaultSeconds, 5);
  // An unavailable choice says why, in terms the user can act on.
  assert.match(
    base.clipCapability().choices.find((choice) => choice.seconds === 20).reason,
    /not validated on this pipeline yet/,
  );
  // The grid is reported separately from the label, so the interface can
  // explain that 20s really produces 20.04s.
  const twentyChoice = base.clipCapability().choices.find((choice) => choice.seconds === 20);
  assert.equal(twentyChoice.frames, 481);
  assert.ok(Math.abs(twentyChoice.actualSeconds - 20.04) < 0.01);

  const long = withConfig({ STUDIO_CLIP_MAX_SECONDS: "20" });
  const capability = long.clipCapability();
  assert.equal(capability.maxFrames, 481, "20 seconds is reachable when configured");
  assert.equal(capability.extended, true);
  assert.deepEqual(capability.options, [5, 10, 15, 20], "All four open together under a cap");
  assert.ok(
    capability.choices.every((choice) => (choice.frames - 1) % 8 === 0),
    "Every length lands on the frame grid",
  );

  // Lengths can also be enabled ONE AT A TIME as each passes testing, which is
  // what the staged rollout needs.
  const staged = withConfig({ STUDIO_CLIP_SECONDS: "10" }).clipCapability();
  assert.deepEqual(staged.options, [5, 10], "5s stays, 10s is added");
  assert.equal(staged.choices.find((choice) => choice.seconds === 15).available, false);

  // Over-configuring cannot exceed what the request shape can express.
  assert.equal(withConfig({ STUDIO_CLIP_MAX_SECONDS: "600" }).clipCapability().maxFrames, 481);
  // Nonsense configuration falls back to validated rather than failing open.
  assert.equal(withConfig({ STUDIO_CLIP_MAX_SECONDS: "banana" }).clipCapability().maxFrames, 121);
  assert.deepEqual(withConfig({ STUDIO_CLIP_SECONDS: "banana,-4" }).clipCapability().options, [5]);

  // --- a length is refused, never shortened -------------------------------
  assert.equal(base.clipLengthProblem(5), null);
  assert.match(base.clipLengthProblem(20), /not validated on this pipeline yet/);
  assert.match(base.clipLengthProblem(7), /5s, 10s, 15s, 20s/);
  assert.equal(base.clipLengthProblem(undefined), null, "No choice is not a problem");
  assert.equal(long.clipLengthProblem(20), null, "and it passes once enabled");

  // --- a project outliving the capability ---------------------------------
  // A project saved while long clips were enabled must not keep requesting one
  // after the switch is turned back off.
  assert.equal(long.clipFrames(20), 481);
  assert.equal(base.clipFrames(20), 121, "The request is clamped to what is enabled now");
  assert.equal(base.clipFrames(undefined), 121, "No request means the validated default");

  // --- the operation lock follows the clip length -------------------------
  assert.equal(base.generationLockMs(), 240000, "The default window is unchanged");
  assert.ok(
    long.generationLockMs(20) > long.generationLockMs(5),
    "A longer clip holds the lock longer",
  );
  assert.ok(long.generationLockMs(20) <= 900000, "The window stays bounded");

  // --- dialogue budgets are passed in, never assumed ----------------------
  const dialogue = loadTs("lib/film/dialogue.ts");
  assert.ok(
    dialogue.wordBudget("en", 20) > dialogue.wordBudget("en", 5),
    "A longer clip affords more words",
  );
  assert.ok(
    dialogue.speechBudgetSeconds(5) < 5,
    "Speech never fills the whole clip; the shot needs room to land",
  );
  const short = dialogue.dialogueFit("Come inside, it is raining.", "en", 4);
  assert.equal(short.words, 5);
  assert.equal(short.overBudget, false);
  const long60 = Array.from({ length: 60 }, () => "word").join(" ");
  assert.equal(dialogue.dialogueFit(long60, "en", 4).overBudget, true);
  assert.equal(
    dialogue.dialogueFit(long60, "en", 60).overBudget,
    false,
    "The same line fits once the clip is long enough",
  );

  // A scene's whole exchange is what has to fit an English clip.
  const scene = {
    id: "s1",
    title: "Doorway",
    description: "Rain",
    visualAction: "Rain",
    characterIds: ["c1", "c2"],
    dialogues: [
      { id: "d1", character: "Ayesha", text: "I came back for the recording." },
      { id: "d2", character: "Bilal", text: "It was never yours to take." },
    ],
    takes: [],
  };
  const fit = dialogue.sceneSpeechFit(scene, "en", 20);
  assert.equal(fit.lines, 2);
  assert.ok(fit.estimatedSeconds > 0);
  assert.equal(fit.overBudget, false, "Two short lines fit a 20s clip");
  const guidance = dialogue.sceneSpeechGuidance(scene, "en", 5, [20, 10, 15, 5]);
  assert.equal(guidance.words, 12, "The scene budget counts every speaker, not just one line");
  assert.equal(guidance.budgetWords, 10);
  assert.equal(guidance.remainingWords, 0);
  assert.equal(guidance.overBudget, true);
  assert.equal(guidance.suggestedSeconds, 10, "Suggest the shortest enabled length that fits");
  assert.equal(dialogue.sceneSpeechGuidance(scene, "en", 5, [5]).suggestedSeconds, undefined, "Do not recommend unavailable lengths");
  const boundary = count => ({ dialogues: [{ character: "Ayesha", text: Array(count).fill("word").join(" ") }] });
  assert.equal(dialogue.sceneSpeechGuidance(boundary(10), "en", 5).overBudget, false);
  assert.equal(dialogue.sceneSpeechGuidance(boundary(11), "en", 5).overBudget, true);
  assert.equal(dialogue.sceneSpeechGuidance(boundary(42), "en", 20, [5, 10, 15, 20]).suggestedSeconds, undefined, "Beyond the longest length, shortening or splitting is necessary");
  assert.equal(dialogue.sceneSpeechGuidance({ dialogues: [] }, "en", 5).remainingWords, 10);
  assert.equal(dialogue.sceneSpeechGuidance({ dialogues: [{ character: "Narrator", text: long60 }] }, "en", 5).words, 0, "Legacy narration is not spoken");
  assert.equal(dialogue.sceneSpeechGuidance({ dialogues: [{ character: "Ayesha", text: "One two three four five six seven eight nine." }, { character: "Bilal", text: "Yes." }] }, "en", 5).overBudget, false, "Speakers do not need equal shares");
  assert.equal(
    dialogue.sceneSpeechFit(scene, "en", 2).overBudget,
    true,
    "The same exchange does not fit a 2s clip",
  );
  // Legacy narrator leftovers are not speech and never consume the budget.
  assert.equal(
    dialogue.sceneSpeechFit(
      { dialogues: [{ id: "x-narration", character: "Narrator", text: "The city forgot her." }] },
      "en",
      5,
    ).lines,
    0,
  );

  console.log(
    "PASS: frame grid, capability flag with 20s behind it, clamping after switch-off, scaled lock window, and duration-driven speech budgets.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
