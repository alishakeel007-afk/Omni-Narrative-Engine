// FilmWorkspace state v2: migration, shot/dialogue identity and clip validation.
// A stored project must open under the new shape without losing authored work.
const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");

function legacyProject() {
  // A v1 project as the conversational studio stored it.
  return {
    version: 1,
    revision: 7,
    title: "Legacy film",
    premise: "A premise",
    world: "A world",
    characters: [{ id: "ayesha", name: "Ayesha", appearance: "Dark suit", locked: true }],
    scenes: [
      {
        id: "scene-a",
        title: "Doorway",
        description: "She steps through a doorway into rain.",
        characterIds: ["ayesha"],
        dialogues: [
          { character: "Narrator", text: "The city had forgotten her." },
          { character: "Ayesha", text: "I came back for the recording." },
        ],
        takes: [
          { id: "take-a", providerId: "p1", kind: "video", status: "complete", url: "https://x.supabase.co/a.mp4", duration: 5, nativeAudio: true, prompt: "", createdAt: "" },
        ],
        selectedVideoId: "take-a",
      },
      {
        id: "scene-b",
        title: "Street",
        description: "Rain on an empty street.",
        characterIds: [],
        dialogues: [],
        takes: [
          { id: "take-b", providerId: "p2", kind: "video", status: "complete", url: "https://x.supabase.co/b.mp4", duration: 4, nativeAudio: true, prompt: "", createdAt: "" },
        ],
        selectedVideoId: "take-b",
      },
    ],
    messages: [],
    timeline: ["scene-a", "scene-b"],
    edits: {
      "scene-a": { start: 1, end: 4, voiceDelay: 0, voiceVolume: 0, musicVolume: 0.3, videoVolume: 0.8, fadeIn: 0.5, texts: [] },
    },
  };
}

(async () => {
  const studio = loadTs("types/studio.ts");
  const { normalizeStudioState, isNarratorDialogue, spokenDialogue } = studio;

  // --- v1 -> v2 migration -------------------------------------------------
  const state = normalizeStudioState(legacyProject());
  assert.equal(state.version, 2);
  assert.equal(state.revision, 7, "Revision must survive migration");
  assert.equal(state.language, "en");
  assert.equal(state.assist, "guided");
  assert.equal(state.step, "edit", "A project with a timeline resumes in the editor");

  // The old timeline becomes clip instances carrying the old trims.
  assert.equal(state.clips.length, 2);
  const [first, second] = state.clips;
  assert.equal(first.sceneId, "scene-a");
  assert.equal(first.sourceTakeId, "take-a");
  assert.equal(first.sourceIn, 1);
  assert.equal(first.sourceOut, 4, "An explicit trim end is preserved");
  assert.equal(first.clipVolume, 0.8, "v1 videoVolume is the clip's own soundtrack");
  assert.equal(first.musicVolume, 0.3);
  assert.equal(first.fadeIn, 0.5);
  // A scene with no saved edit spans its whole take.
  assert.equal(second.sourceIn, 0);
  assert.equal(second.sourceOut, 4);
  assert.equal(second.clipVolume, 1, "A native take defaults to audible");
  // v1 fields stay put so the legacy studio keeps opening the same project.
  assert.deepEqual(state.timeline, ["scene-a", "scene-b"]);
  assert.ok(state.edits["scene-a"]);
  assert.deepEqual(state.history, { past: [], future: [] });

  // --- dialogue identity --------------------------------------------------
  const lines = state.scenes[0].dialogues;
  assert.ok(lines.every((line) => line.id), "Every line gains a stable id");
  assert.equal(new Set(lines.map((line) => line.id)).size, lines.length);

  // --- narrator handling --------------------------------------------------
  assert.ok(isNarratorDialogue({ character: "Narrator" }));
  assert.ok(isNarratorDialogue({ character: "voiceover" }));
  assert.ok(isNarratorDialogue({ character: "Ayesha", id: "scene-1-narration" }));
  assert.ok(!isNarratorDialogue({ character: "Ayesha", id: "scene-1-line-2" }));
  const spoken = spokenDialogue(state.scenes[0]);
  assert.equal(spoken.length, 1, "Narrator lines never reach generation");
  assert.equal(spoken[0].character, "Ayesha");
  // The authored scene text itself is never discarded.
  assert.match(state.scenes[0].visualAction, /doorway into rain/);
  assert.equal(state.scenes[0].description, state.scenes[0].visualAction);
  assert.equal(
    state.scenes[0].dialogues.length,
    2,
    "The narrator line is kept on the record, only excluded from generation",
  );

  // --- step derivation ----------------------------------------------------
  const noTimeline = normalizeStudioState({ ...legacyProject(), timeline: [], edits: {} });
  assert.equal(noTimeline.step, "generate", "Completed takes but no timeline resumes at Generate");
  const scripted = normalizeStudioState({
    ...legacyProject(),
    timeline: [],
    edits: {},
    scenes: [{ id: "s", title: "t", description: "d", characterIds: [], dialogues: [], takes: [] }],
  });
  assert.equal(scripted.step, "script");
  assert.equal(normalizeStudioState({}).step, "setup");
  assert.equal(normalizeStudioState({}).clips.length, 0);

  // Migration is idempotent: re-opening a v2 project must not rebuild clips.
  const again = normalizeStudioState(state);
  assert.deepEqual(again.clips, state.clips);
  assert.equal(again.version, 2);

  // Unreadable input degrades to an empty project rather than throwing.
  assert.equal(normalizeStudioState(null).version, 2);
  assert.equal(normalizeStudioState("nonsense").scenes.length, 0);

  // --- clip validation ----------------------------------------------------
  const { timelineClipSchema, timelineClipsSchema } = loadTs("lib/studio/edits.ts");
  const valid = { id: "c1", sceneId: "scene-a", sourceTakeId: "take-a", sourceIn: 0, sourceOut: 5, clipVolume: 1 };
  assert.ok(timelineClipSchema.safeParse(valid).success);
  assert.ok(!timelineClipSchema.safeParse({ ...valid, sourceOut: 0 }).success, "End must follow start");
  assert.ok(!timelineClipSchema.safeParse({ ...valid, sourceOut: 0.2 }).success, "Too short to be a clip");
  assert.ok(!timelineClipSchema.safeParse({ ...valid, clipVolume: 2 }).success);

  // A split produces two instances of one take: same source, distinct ids.
  const split = [
    { ...valid, id: "c1", sourceIn: 0, sourceOut: 2 },
    { ...valid, id: "c2", sourceIn: 2, sourceOut: 5 },
  ];
  assert.ok(timelineClipsSchema.safeParse(split).success, "Repeating a source take is allowed");
  assert.ok(
    !timelineClipsSchema.safeParse([split[0], { ...split[1], id: "c1" }]).success,
    "Duplicate instance ids are rejected",
  );
  assert.ok(
    !timelineClipsSchema.safeParse(Array.from({ length: 25 }, (_, i) => ({ ...valid, id: `c${i}` }))).success,
    "The export clip limit is enforced",
  );

  console.log(
    "PASS: v1->v2 migration with trims preserved, stable dialogue ids, narrator exclusion without text loss, step derivation, idempotency, and clip-instance validation.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
