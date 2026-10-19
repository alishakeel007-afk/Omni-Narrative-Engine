// Step 4: trim, split, reorder, delete, undo/redo, relinking, and the
// clip-instance export payload.
const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");

class StudioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

delete process.env.STUDIO_CLIP_MAX_SECONDS;

function take(overrides = {}) {
  return {
    id: "t1",
    providerId: "p1",
    kind: "video",
    status: "complete",
    url: "https://demo.supabase.co/storage/v1/object/public/v/a.mp4",
    provider: "modal-ltx",
    nativeAudio: true,
    duration: 10,
    prompt: "x",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function clip(overrides = {}) {
  return {
    id: "c-s1",
    sceneId: "s1",
    sourceTakeId: "t1",
    sourceIn: 0,
    sourceOut: 10,
    clipVolume: 1,
    ...overrides,
  };
}

(async () => {
  const { normalizeStudioState, MIN_CLIP_SECONDS, MAX_EDIT_HISTORY } = loadTs("types/studio.ts");
  const edit = loadTs("lib/film/edit.ts");
  const { timelineClipsSchema } = loadTs("lib/studio/edits.ts");

  const project = (overrides = {}) =>
    normalizeStudioState({
      version: 2,
      revision: 0,
      title: "Film",
      premise: "",
      world: "",
      language: "en",
      step: "edit",
      characters: [],
      scenes: [
        {
          id: "s1",
          title: "Doorway",
          description: "Rain",
          visualAction: "Rain",
          characterIds: [],
          dialogues: [],
          takes: [take()],
          selectedVideoId: "t1",
          beats: [
            { id: "b1", visualAction: "Wide.", dialogueIds: [] },
            { id: "b2", visualAction: "Close.", dialogueIds: [] },
          ],
        },
        {
          id: "s2",
          title: "Hall",
          description: "Corridor",
          visualAction: "Corridor",
          characterIds: [],
          dialogues: [],
          takes: [take({ id: "t2", duration: 6 })],
          selectedVideoId: "t2",
        },
      ],
      clips: [clip(), clip({ id: "c-s2", sceneId: "s2", sourceTakeId: "t2", sourceOut: 6 })],
      messages: [],
      timeline: ["s1", "s2"],
      edits: {},
      ...overrides,
    });

  let state = project();
  const clips = () => state.clips;

  // --- the playback clock -------------------------------------------------
  assert.equal(edit.filmDuration(clips()), 16);
  let spans = edit.clipSpans(clips());
  assert.deepEqual(spans.map((span) => [span.start, span.end]), [[0, 10], [10, 16]]);
  // Film time maps into one source file; speech is baked in, so no second
  // track needs offsetting.
  let at = edit.seek(clips(), 12);
  assert.equal(at.clip.id, "c-s2");
  assert.equal(at.sourceSeconds, 2);
  // Seeking inside a trimmed clip lands past its in-point, not at zero.
  const trimmed = [clip({ sourceIn: 3, sourceOut: 8 })];
  assert.equal(edit.seek(trimmed, 1).sourceSeconds, 4);
  assert.equal(edit.seek(trimmed, 0).sourceSeconds, 3);
  // Past the end clamps to the last frame rather than returning nothing.
  assert.equal(edit.seek(trimmed, 99).sourceSeconds, 8);
  assert.equal(edit.seek([], 0), null);

  // --- trim ---------------------------------------------------------------
  let result = edit.trimClip(state, clips(), "c-s1", { sourceIn: 2, sourceOut: 7 });
  assert.equal(result.clips[0].sourceIn, 2);
  assert.equal(result.clips[0].sourceOut, 7);
  assert.equal(result.clips[1].sourceOut, 6, "Other clips are untouched");
  // Clamped to the MEASURED file, never to the requested length.
  result = edit.trimClip(state, clips(), "c-s2", { sourceOut: 99 });
  assert.equal(result.clips[1].sourceOut, 6);
  result = edit.trimClip(state, clips(), "c-s1", { sourceIn: -5 });
  assert.equal(result.clips[0].sourceIn, 0);
  // A range the file cannot honour is refused, not silently shortened.
  assert.match(
    edit.trimClip(state, clips(), "c-s1", { sourceIn: 9.9 }).problem,
    new RegExp(`at least ${MIN_CLIP_SECONDS}s`),
  );
  assert.match(edit.trimClip(state, clips(), "ghost", {}).problem, /no longer on the timeline/);

  // --- split --------------------------------------------------------------
  result = edit.splitClip(state, clips(), "c-s1", 4);
  assert.equal(result.clips.length, 3);
  const [first, second] = result.clips;
  assert.equal(first.sourceOut, 4);
  assert.equal(second.sourceIn, 4);
  assert.equal(second.sceneId, "s1", "Both halves share the scene");
  assert.equal(second.sourceTakeId, "t1", "and the source take");
  assert.notEqual(second.id, first.id, "but not the identity");
  assert.equal(result.clips[2].id, "c-s2", "Order is preserved around the split");
  // Two instances of one scene is exactly what the clip model exists for.
  assert.ok(timelineClipsSchema.safeParse(result.clips).success);

  // Volumes, fades and overlays survive a split; the fades move sensibly.
  const styled = [
    clip({ clipVolume: 0.4, musicVolume: 0.3, fadeIn: 1, fadeOut: 2, texts: [{ text: "Hi", x: 0.5, y: 0.9, size: 30, color: "#000000", start: 0, end: 1 }] }),
  ];
  result = edit.splitClip(state, styled, "c-s1", 5);
  assert.equal(result.clips[0].clipVolume, 0.4);
  assert.equal(result.clips[1].clipVolume, 0.4);
  assert.equal(result.clips[0].musicVolume, 0.3);
  // The caption runs 0-1s, so it belongs to the first half alone. Copying the
  // list to both halves would show it twice in the exported film.
  assert.deepEqual(result.clips[0].texts, styled[0].texts);
  assert.equal(result.clips[1].texts, undefined);
  assert.equal(result.clips[0].fadeIn, 1, "The opening fade stays on the first half");
  assert.equal(result.clips[0].fadeOut, undefined);
  assert.equal(result.clips[1].fadeOut, 2, "The closing fade moves to the second");
  assert.equal(result.clips[1].fadeIn, undefined);

  // Neither half may be shorter than the minimum.
  assert.match(edit.splitClip(state, clips(), "c-s1", 0.1).problem, /Both halves/);
  assert.match(edit.splitClip(state, clips(), "c-s1", 9.9).problem, /Both halves/);
  // The clip cap applies to splitting too.
  const packed = Array.from({ length: 24 }, (_, index) =>
    clip({ id: `c${index}`, sourceOut: 10 }),
  );
  assert.match(edit.splitClip(state, packed, "c0", 5).problem, /can hold 24 clips/);

  // --- reorder and delete -------------------------------------------------
  result = edit.moveClip(clips(), "c-s2", 0);
  assert.deepEqual(result.clips.map((item) => item.id), ["c-s2", "c-s1"]);
  assert.deepEqual(edit.moveClip(clips(), "c-s1", 99).clips.map((item) => item.id), ["c-s2", "c-s1"]);
  assert.deepEqual(edit.moveClip(clips(), "c-s1", 0).clips.map((item) => item.id), ["c-s1", "c-s2"]);
  result = edit.deleteClip(clips(), "c-s1");
  assert.deepEqual(result.clips.map((item) => item.id), ["c-s2"]);
  assert.equal(
    state.scenes[0].takes.length,
    1,
    "Deleting an instance never touches the source take",
  );
  assert.match(edit.deleteClip(clips(), "ghost").problem, /no longer on the timeline/);

  // --- per-clip levels ----------------------------------------------------
  result = edit.patchClip(clips(), "c-s1", { clipVolume: 0.5, fadeIn: 99 });
  assert.equal(result.clips[0].clipVolume, 0.5);
  assert.equal(result.clips[0].fadeIn, 10, "A fade longer than the clip is clamped to it");

  // --- undo and redo ------------------------------------------------------
  let history = edit.pushHistory(state, edit.deleteClip(clips(), "c-s2").clips);
  assert.equal(history.clips.length, 1);
  assert.equal(history.history.past.length, 1);
  assert.deepEqual(history.history.future, []);
  let back = edit.undo(history);
  assert.equal(back.clips.length, 2, "Undo restores the previous timeline");
  assert.equal(back.history.future.length, 1);
  let forward = edit.redo(back);
  assert.equal(forward.clips.length, 1, "Redo reapplies it");
  assert.match(edit.undo(project()).problem, /nothing to undo/);
  assert.match(edit.redo(project()).problem, /nothing to redo/);
  // A new edit abandons the redo branch, as every editor does.
  const branched = edit.pushHistory(back, edit.deleteClip(back.clips, "c-s1").clips);
  assert.deepEqual(branched.history.future, []);
  // History holds clip lists only, so undoing an edit can never un-generate.
  assert.ok(
    Object.keys(history.history.past[0]).every((key) => key === "clips"),
    "A snapshot carries clips and nothing else",
  );
  // The window is bounded.
  let deep = project();
  for (let index = 0; index < MAX_EDIT_HISTORY + 10; index += 1)
    deep = edit.pushHistory(deep, [clip({ sourceOut: 2 + (index % 5) })]);
  assert.equal(deep.history.past.length, MAX_EDIT_HISTORY);

  // --- a new take arrives: edits are preserved, never moved ---------------
  const regenerated = project();
  regenerated.clips = [clip({ sourceIn: 2, sourceOut: 7, clipVolume: 0.6, fadeIn: 0.5 }), clip({ id: "c-s2", sceneId: "s2", sourceTakeId: "t2", sourceOut: 6 })];
  // A second take exists but is NOT selected, so nothing changes at all.
  regenerated.scenes[0].takes = [take(), take({ id: "t1b", duration: 4 })];
  let marked = edit.markStaleClips(regenerated, regenerated.clips);
  assert.equal(marked[0].stale, undefined, "An unselected new take changes nothing");

  // Selecting it marks the clip, and leaves every edit exactly as it was.
  regenerated.scenes[0].selectedVideoId = "t1b";
  marked = edit.markStaleClips(regenerated, regenerated.clips);
  assert.equal(marked[0].stale, true);
  assert.equal(marked[0].sourceTakeId, "t1", "The clip still points at the take it was built from");
  assert.equal(marked[0].sourceIn, 2);
  assert.equal(marked[0].sourceOut, 7);
  assert.equal(marked[0].clipVolume, 0.6);
  assert.equal(marked[0].fadeIn, 0.5);
  assert.equal(marked[1].stale, undefined, "An untouched scene's clip is not flagged");

  // Export refuses while anything is stale, naming the scenes.
  let problem = edit.exportProblem(regenerated, marked);
  assert.match(problem, /1 clip still point/);
  assert.match(problem, /Doorway/);
  assert.match(problem, /Relink them first/);

  // --- relinking is explicit, preserving and clamping ---------------------
  let outcome = edit.relinkClips(regenerated, marked);
  assert.equal(outcome.relinked, 1);
  assert.equal(outcome.clips[0].sourceTakeId, "t1b", "Now built from the current take");
  assert.equal(outcome.clips[0].stale, undefined);
  assert.equal(outcome.clips[0].clipVolume, 0.6, "Volumes survive relinking");
  assert.equal(outcome.clips[0].fadeIn, 0.5, "So do fades");
  assert.equal(outcome.clips[0].sourceIn, 2);
  assert.equal(outcome.clips[0].sourceOut, 4, "The trim is clamped to the shorter file");
  assert.ok(
    outcome.notes.some((note) => /trimmed to 2\.0s to fit the new 4\.0s video/.test(note)),
    "The clamp is reported per clip rather than done quietly",
  );
  assert.equal(edit.exportProblem(regenerated, outcome.clips), null);

  // Order, splits and the rest of the timeline survive it.
  const splitThenRegenerated = project();
  splitThenRegenerated.scenes[0].takes = [take(), take({ id: "t1b", duration: 9 })];
  splitThenRegenerated.scenes[0].selectedVideoId = "t1b";
  splitThenRegenerated.clips = [
    clip({ id: "a", sourceIn: 0, sourceOut: 4 }),
    clip({ id: "c-s2", sceneId: "s2", sourceTakeId: "t2", sourceOut: 6 }),
    clip({ id: "b", sourceIn: 4, sourceOut: 10 }),
  ];
  outcome = edit.relinkClips(
    splitThenRegenerated,
    edit.markStaleClips(splitThenRegenerated, splitThenRegenerated.clips),
  );
  assert.deepEqual(outcome.clips.map((item) => item.id), ["a", "c-s2", "b"], "Order is kept");
  assert.equal(outcome.clips[0].sourceOut, 4, "A trim that still fits is untouched");
  assert.equal(outcome.clips[2].sourceOut, 9, "One that does not is clamped");
  assert.equal(outcome.relinked, 2);

  // A clip whose scene has no finished take is reported, never dropped.
  const orphan = project();
  orphan.scenes[0].takes = [];
  delete orphan.scenes[0].selectedVideoId;
  outcome = edit.relinkClips(orphan, edit.markStaleClips(orphan, orphan.clips));
  assert.deepEqual(outcome.orphaned, ["c-s1"]);
  assert.equal(outcome.clips[0].sourceTakeId, "t1", "The clip is left for the user to decide about");
  assert.match(outcome.notes[0], /no finished video to relink to/);

  // A trim that now sits past the end of the file takes the whole new video,
  // rather than sliding to a different part of it, and says so.
  const tiny = project();
  tiny.clips = [clip({ sourceIn: 6, sourceOut: 10, clipVolume: 0.7 })];
  tiny.scenes[0].takes = [take(), take({ id: "t1b", duration: 1 })];
  tiny.scenes[0].selectedVideoId = "t1b";
  outcome = edit.relinkClips(tiny, edit.markStaleClips(tiny, tiny.clips));
  assert.deepEqual(outcome.orphaned, [], "The clip is kept, not dropped");
  assert.equal(outcome.clips[0].sourceIn, 0);
  assert.equal(outcome.clips[0].sourceOut, 1);
  assert.equal(outcome.clips[0].clipVolume, 0.7, "Its settings still survive");
  assert.match(outcome.notes[0], /past the end of the new 1\.0s video/);
  assert.match(outcome.notes[0], /Re-trim it if you wanted a different part/);

  // A new video shorter than the minimum clip length cannot be used at all.
  const unusable = project();
  unusable.clips = [clip()];
  unusable.scenes[0].takes = [take(), take({ id: "t1b", duration: 0.2 })];
  unusable.scenes[0].selectedVideoId = "t1b";
  outcome = edit.relinkClips(unusable, edit.markStaleClips(unusable, unusable.clips));
  assert.deepEqual(outcome.orphaned, ["c-s1"]);
  assert.match(outcome.notes[0], /shorter than the 0\.5s a clip needs/);
  assert.equal(outcome.clips[0].sourceTakeId, "t1", "Still the user's decision");

  // --- export payload -----------------------------------------------------
  const payload = edit.renderClips(state, [
    clip({ sourceIn: 1, sourceOut: 5, clipVolume: 0.8, fadeIn: 0.5, fadeOut: 0.25 }),
    clip({ id: "c-s1-b", sourceIn: 5, sourceOut: 9 }),
  ]);
  assert.equal(payload.length, 2, "One entry per clip instance, not per scene");
  assert.equal(payload[0].start, 1);
  assert.equal(payload[0].end, 5);
  assert.equal(payload[0].volume, 0.8);
  assert.equal(payload[0].fade_in, 0.5);
  assert.equal(payload[0].fade_out, 0.25);
  assert.equal(payload[1].start, 5, "The second instance exports its own range");
  assert.equal(payload[0].url, payload[1].url, "Both read the same source file");
  // Speech is baked into the clip, so there is nothing to delay or mix.
  for (const entry of payload) {
    assert.deepEqual(entry.voices, []);
    assert.equal(entry.voice_delay, 0);
    assert.equal(entry.voice_volume, 0);
  }
  // Music only attaches when the scene has a stored object AND a level.
  assert.equal(payload[0].music, null);
  const scored = project();
  scored.scenes[0].musicUrl = "https://demo.supabase.co/storage/v1/object/public/m/a.mp3";
  scored.scenes[0].takes = [take({ nativeAudio: false })];
  assert.equal(edit.renderClips(scored, [clip()])[0].music, null, "No level means no music");
  assert.equal(
    edit.renderClips(scored, [clip({ musicVolume: 0.3 })])[0].music,
    scored.scenes[0].musicUrl,
  );
  assert.equal(edit.renderClips(scored, [clip({ musicVolume: 0.3 })])[0].music_volume, 0.3);

  // --- export gates -------------------------------------------------------
  assert.match(edit.exportProblem(state, []).toString(), /no clips to export/);
  assert.equal(edit.exportProblem(state, clips()), null);
  // A trim beyond the file is caught before the exporter sees it.
  assert.match(
    edit.exportProblem(state, [clip({ sourceOut: 30 })]),
    /claims 30\.0s of a 10\.0s video/,
  );
  const overlong = Array.from({ length: 19 }, (_, index) =>
    clip({ id: `c${index}`, sourceIn: 0, sourceOut: 10 }),
  );
  assert.match(edit.exportProblem(state, overlong), /over the 180s limit/);

  console.log(
    "PASS: overlay redistribution across splits with spanning captions clamped on both sides, overlays reaching the exporter unchanged, one playback clock, trims clamped to measured files, splits that keep source and styling, reorder and delete without touching takes, bounded undo/redo over clips only, arriving takes preserving every edit, explicit relinking with per-clip clamping, and a clip-instance export payload with no separate speech track.",
  );

  // --- text overlays across a split --------------------------------------
  // Overlay timing is relative to the clip it sits on: the exporter trims each
  // clip, resets its timestamps and then applies drawtext, so a split has to
  // redistribute by the time each overlay covers.
  const caption = (overrides = {}) => ({
    text: "Caption",
    x: 0.5,
    y: 0.78,
    size: 36,
    color: "#ffffff",
    start: 0,
    end: 0,
    ...overrides,
  });

  // A 10s clip split at 4s: firstDuration is 4.
  let split = edit.distributeOverlays(
    [
      caption({ text: "early", start: 0.5, end: 2 }),
      caption({ text: "late", start: 6, end: 8 }),
    ],
    4,
  );
  assert.deepEqual(
    split.first.map((text) => text.text),
    ["early"],
    "An overlay inside the first half belongs only to the first half",
  );
  assert.deepEqual(
    split.second.map((text) => text.text),
    ["late"],
    "and one inside the second only to the second — not both",
  );
  // The second half's times are rebased onto its own clock.
  assert.equal(split.second[0].start, 2);
  assert.equal(split.second[0].end, 4);

  // An overlay spanning the cut shows on both sides, clamped, so it still
  // reads as one continuous caption.
  split = edit.distributeOverlays([caption({ text: "across", start: 3, end: 7 })], 4);
  assert.equal(split.first.length, 1);
  assert.equal(split.second.length, 1);
  assert.equal(split.first[0].start, 3);
  assert.equal(split.first[0].end, 0, "0 means it runs to the end of that half");
  assert.equal(split.second[0].start, 0, "and it is already showing when the second begins");
  assert.equal(split.second[0].end, 3);

  // An open-ended overlay keeps running after the cut.
  split = edit.distributeOverlays([caption({ start: 1, end: 0 })], 4);
  assert.equal(split.first[0].end, 0);
  assert.equal(split.second[0].start, 0);
  assert.equal(split.second[0].end, 0);

  // One starting exactly at the cut belongs to the second half alone.
  split = edit.distributeOverlays([caption({ start: 4, end: 6 })], 4);
  assert.equal(split.first, undefined);
  assert.equal(split.second.length, 1);
  assert.equal(split.second[0].start, 0);
  assert.equal(split.second[0].end, 2);
  // One ending exactly at the cut belongs to the first alone.
  split = edit.distributeOverlays([caption({ start: 1, end: 4 })], 4);
  assert.equal(split.first.length, 1);
  assert.equal(split.second, undefined);

  assert.deepEqual(edit.distributeOverlays(undefined, 4), {});
  assert.deepEqual(edit.distributeOverlays([], 4), {});

  // Through splitClip itself, with source ranges and audio sync untouched.
  const captioned = [
    clip({
      sourceIn: 2,
      sourceOut: 12,
      texts: [caption({ text: "early", start: 0.5, end: 2 }), caption({ text: "late", start: 6, end: 8 })],
    }),
  ];
  const wide = project();
  wide.scenes[0].takes = [take({ duration: 12 })];
  // Split 4s into the clip, which is source position 6.
  result = edit.splitClip(wide, captioned, "c-s1", 4);
  assert.equal(result.clips.length, 2);
  assert.equal(result.clips[0].sourceIn, 2, "The original source range is preserved");
  assert.equal(result.clips[0].sourceOut, 6);
  assert.equal(result.clips[1].sourceIn, 6, "and continues with no gap, so audio stays in sync");
  assert.equal(result.clips[1].sourceOut, 12);
  assert.deepEqual(result.clips[0].texts.map((text) => text.text), ["early"]);
  assert.deepEqual(result.clips[1].texts.map((text) => text.text), ["late"]);
  assert.equal(
    result.clips[0].texts.length + result.clips[1].texts.length,
    2,
    "Two overlays stay two overlays; neither is shown twice",
  );

  // A half with no overlays carries no empty array.
  result = edit.splitClip(wide, [clip({ sourceIn: 2, sourceOut: 12, texts: [caption({ start: 0, end: 1 })] })], "c-s1", 5);
  assert.equal(result.clips[0].texts.length, 1);
  assert.equal(result.clips[1].texts, undefined);

  // --- overlays in the preview -------------------------------------------
  const shown = clip({
    sourceOut: 10,
    texts: [caption({ text: "a", start: 1, end: 3 }), caption({ text: "b", start: 5, end: 0 })],
  });
  assert.deepEqual(edit.overlaysAt(shown, 0).map((text) => text.text), []);
  assert.deepEqual(edit.overlaysAt(shown, 2).map((text) => text.text), ["a"]);
  assert.deepEqual(edit.overlaysAt(shown, 4).map((text) => text.text), []);
  assert.deepEqual(
    edit.overlaysAt(shown, 9).map((text) => text.text),
    ["b"],
    "An open-ended overlay runs to the end of the clip",
  );
  assert.deepEqual(edit.overlaysAt(clip(), 1), []);

  // --- overlays reach the exporter unchanged -----------------------------
  const captionedPayload = edit.renderClips(state, [
    clip({ sourceIn: 1, sourceOut: 6, texts: [caption({ text: "Hello", start: 0.5, end: 2, size: 48, color: "#c1f17b", x: 0.25, y: 0.1 })] }),
  ]);
  assert.deepEqual(captionedPayload[0].texts, [
    { text: "Hello", x: 0.25, y: 0.1, size: 48, color: "#c1f17b", start: 0.5, end: 2 },
  ]);
  // The clip's trim is independent of the overlay's own clock.
  assert.equal(captionedPayload[0].start, 1);
  assert.equal(captionedPayload[0].end, 6);
  assert.deepEqual(edit.renderClips(state, [clip()])[0].texts, []);

  // --- the clipEdit and assemble actions ---------------------------------
  let user = { id: "owner" };
  let saved = project();
  let queue = [];
  let exported = null;

  const next = {
    NextResponse: {
      json: (body, init) => ({ status: init?.status || 200, json: async () => body }),
    },
  };
  const store = {
    StudioError,
    loadStudio: async (owner) => {
      if (owner !== "owner") throw new StudioError("Project not found.", 404);
      return { project: { id: "project" }, state: structuredClone(saved) };
    },
    saveStudio: async (loaded, state) => {
      saved = { ...state, revision: loaded.state.revision + 1 };
      return saved;
    },
  };
  const auth = {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
  };
  const route = loadTs("app/api/studio/[id]/route.ts", {
    "next/server": next,
    "@/lib/supabase/server": auth,
    "@/lib/studio/store": store,
    "@/lib/prisma": {},
    "@/lib/studio/ai": {},
    "@/lib/audio/music-service": {},
    "@/lib/studio/media": {},
    "@/lib/studio/continuity": {},
    "@/lib/film/ai": {},
    "@/lib/studio/scene-jobs": { listSceneJobs: async () => ({ jobs: queue, threads: [] }) },
  });
  const context = { params: Promise.resolve({ id: "project" }) };
  const post = (body) => route.POST({ json: async () => body }, context);
  const op = (operation) => post({ action: "clipEdit", operation });

  // Trim through the API, and the v1 scene list stays in step.
  let response = await op({ kind: "trim", clipId: "c-s1", sourceIn: 1, sourceOut: 6 });
  assert.equal(response.status, 200);
  let body = await response.json();
  assert.equal(body.state.clips[0].sourceIn, 1);
  assert.equal(body.state.clips[0].sourceOut, 6);
  assert.deepEqual(body.state.timeline, ["s1", "s2"]);
  assert.equal(body.state.history.past.length, 1, "Every edit is undoable");

  // Split, which puts two instances of one scene on the timeline.
  body = await (await op({ kind: "split", clipId: "c-s1", filmSeconds: 3 })).json();
  assert.equal(body.state.clips.length, 3);
  assert.deepEqual(
    body.state.timeline,
    ["s1", "s2"],
    "The v1 field lists each scene once, however many instances it has",
  );

  // Reorder, delete and per-clip levels.
  body = await (await op({ kind: "move", clipId: "c-s2", toIndex: 0 })).json();
  assert.equal(body.state.clips[0].id, "c-s2");
  body = await (await op({ kind: "patch", clipId: "c-s2", patch: { clipVolume: 0.4 } })).json();
  assert.equal(body.state.clips[0].clipVolume, 0.4);
  body = await (await op({ kind: "delete", clipId: "c-s2" })).json();
  assert.ok(!body.state.clips.some((item) => item.id === "c-s2"));
  assert.equal(
    saved.scenes[1].takes.length,
    1,
    "Deleting a clip leaves the scene's take alone",
  );

  // Undo walks back through all of it; redo returns.
  const beforeUndo = saved.clips.length;
  body = await (await op({ kind: "undo" })).json();
  assert.notEqual(body.state.clips.length, beforeUndo);
  body = await (await op({ kind: "redo" })).json();
  assert.equal(body.state.clips.length, beforeUndo);

  // Rejections are refusals, not silent no-ops.
  saved = project();
  assert.equal((await op({ kind: "trim", clipId: "ghost", sourceIn: 1 })).status, 400);
  assert.equal(saved.revision, 0, "A refused edit saves nothing");
  assert.equal((await op({ kind: "split", clipId: "c-s1", filmSeconds: 0.1 })).status, 400);
  assert.equal((await op({ kind: "patch", clipId: "c-s1", patch: { clipVolume: 4 } })).status, 400);
  assert.equal(
    (await op({ kind: "patch", clipId: "c-s1", patch: { dialogueVolume: 1 } })).status,
    400,
    "Unknown clip fields are rejected rather than stored",
  );
  assert.equal((await op({ kind: "undo" })).status, 400);
  assert.equal((await op({ kind: "relink" })).status, 400, "Nothing to relink is a refusal");

  // --- overlays through the API ------------------------------------------
  const overlay = {
    text: "Lower third",
    x: 0.5,
    y: 0.78,
    size: 42,
    color: "#ffffff",
    start: 0.5,
    end: 3,
  };
  body = await (await op({ kind: "patch", clipId: "c-s1", patch: { texts: [overlay] } })).json();
  assert.deepEqual(body.state.clips[0].texts, [overlay]);
  // Splitting that clip redistributes what it carries.
  body = await (await op({ kind: "split", clipId: "c-s1", filmSeconds: 5 })).json();
  assert.equal(body.state.clips[0].texts.length, 1, "The caption stays where it plays");
  assert.equal(body.state.clips[1].texts, undefined, "and is not duplicated onto the other half");
  // Invalid overlays are refused rather than stored and failed at export.
  saved = project();
  assert.equal(
    (await op({ kind: "patch", clipId: "c-s1", patch: { texts: [{ ...overlay, color: "red" }] } })).status,
    400,
    "A colour the exporter cannot parse is refused",
  );
  assert.equal(
    (await op({ kind: "patch", clipId: "c-s1", patch: { texts: [{ ...overlay, size: 200 }] } })).status,
    400,
  );
  assert.equal(
    (await op({ kind: "patch", clipId: "c-s1", patch: { texts: [{ ...overlay, x: 2 }] } })).status,
    400,
  );
  assert.equal(
    (await op({ kind: "patch", clipId: "c-s1", patch: { texts: [{ ...overlay, start: 3, end: 1 }] } })).status,
    400,
    "An end before its start is refused",
  );
  assert.equal(
    (await op({ kind: "patch", clipId: "c-s1", patch: { texts: Array.from({ length: 9 }, () => overlay) } })).status,
    400,
    "More overlays than the exporter accepts is refused",
  );
  assert.equal(saved.revision, 0, "No refused overlay was stored");

  // --- a take arriving mid-edit ------------------------------------------
  saved = project();
  saved.clips = [
    { ...saved.clips[0], sourceIn: 2, sourceOut: 7, clipVolume: 0.6 },
    saved.clips[1],
  ];
  // Selecting a newer take flags the clip; it does NOT move it.
  saved.scenes[0].takes = [take(), take({ id: "t1b", duration: 4 })];
  body = await (await post({ action: "select", sceneId: "s1", takeId: "t1b" })).json();
  assert.equal(body.state.clips[0].stale, true);
  assert.equal(body.state.clips[0].sourceTakeId, "t1", "The edit still points at its own source");
  assert.equal(body.state.clips[0].sourceIn, 2, "and keeps its trim");
  assert.equal(body.state.clips[0].clipVolume, 0.6, "and its level");
  assert.equal(body.state.clips[1].stale, undefined);

  // Relinking is the explicit act that replaces the source, and reports what
  // it had to change.
  body = await (await op({ kind: "relink" })).json();
  assert.equal(body.state.clips[0].sourceTakeId, "t1b");
  assert.equal(body.state.clips[0].stale, undefined);
  assert.equal(body.state.clips[0].clipVolume, 0.6);
  assert.ok(body.notices.some((note) => /trimmed to 2\.0s to fit the new 4\.0s video/.test(note)));
  assert.ok(body.notices.some((note) => /now use the current video/.test(note)));
  // And it is undoable, like any other edit.
  body = await (await op({ kind: "undo" })).json();
  assert.equal(body.state.clips[0].sourceTakeId, "t1");

  // Removing the stale clips is the other explicit choice.
  body = await (await op({ kind: "removeStale" })).json();
  assert.equal(body.state.clips.length, 1);
  assert.equal(body.state.clips[0].sceneId, "s2");
  assert.ok(body.notices.some((note) => /The scenes are untouched/.test(note)));

  // --- assemble now matches the step's readiness rules -------------------
  saved = project();
  saved.step = "generate";
  delete saved.clips;
  saved.history = { past: [], future: [] };
  queue = [];
  response = await post({ action: "assemble" });
  assert.equal(response.status, 200);
  body = await response.json();
  assert.equal(body.state.step, "edit");
  assert.equal(body.state.clips.length, 2);
  assert.equal(body.state.clips[0].sourceOut, 10, "Spanning the measured file");
  assert.equal(body.state.history.past.length, 1, "Assembling is itself undoable");

  // A render in flight blocks it: assembling the older take would export
  // something the user is not looking at.
  saved = project();
  saved.step = "generate";
  queue = [{ id: "j1", sceneId: "s1", kind: "video", status: "running", phase: "poll" }];
  response = await post({ action: "assemble" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /still generating/);

  // A queued job counts the same way.
  queue = [{ id: "j1", sceneId: "s1", kind: "video", status: "queued", phase: "prepare" }];
  assert.equal((await post({ action: "assemble" })).status, 400);

  // A stopped job is a problem to resolve, not something to assemble past.
  queue = [
    { id: "j1", sceneId: "s1", kind: "video", status: "failed", phase: "poll", error: "The provider stopped." },
  ];
  response = await post({ action: "assemble" });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /needs a finished video/);

  // A finished job does not block anything.
  queue = [{ id: "j1", sceneId: "s1", kind: "video", status: "complete", phase: "done" }];
  assert.equal((await post({ action: "assemble" })).status, 200);

  // A chat job in the old studio is irrelevant here.
  saved = project();
  saved.step = "generate";
  queue = [{ id: "j1", sceneId: "s1", kind: "chat", status: "running", phase: "prepare" }];
  assert.equal((await post({ action: "assemble" })).status, 200);

  // --- ownership ---------------------------------------------------------
  user = null;
  assert.equal((await op({ kind: "undo" })).status, 401);
  user = { id: "someone-else" };
  assert.equal((await op({ kind: "undo" })).status, 404);
  user = { id: "owner" };

  // --- export maps clip instances ----------------------------------------
  saved = project();
  saved.clips = [
    { id: "a", sceneId: "s1", sourceTakeId: "t1", sourceIn: 0, sourceOut: 4, clipVolume: 1 },
    { id: "b", sceneId: "s1", sourceTakeId: "t1", sourceIn: 6, sourceOut: 10, clipVolume: 0.5 },
    saved.clips[1],
  ];
  const render = loadTs("app/api/studio/[id]/render/route.ts", {
    "next/server": next,
    "@/lib/supabase/server": auth,
    "@/lib/studio/store": store,
    "@/lib/studio/ltx": {
      ltxRequest: async (path, payload) => {
        exported = payload;
        return { json: async () => ({ id: "11111111-2222-4333-8444-555555555555" }) };
      },
      exportSourceUrl: async (url) => `${url}?signed`,
      saveLtxArtifact: async () => ({ publicUrl: "https://demo.supabase.co/out.mp4" }),
    },
  });
  const requestId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  response = await render.POST(
    { json: async () => ({ requestId }) },
    context,
  );
  assert.equal(response.status, 202);
  assert.equal(exported.clips.length, 3, "Three instances, two of them one scene");
  assert.deepEqual(
    exported.clips.map((entry) => [entry.start, entry.end]),
    [[0, 4], [6, 10], [0, 6]],
    "Each instance exports its own range",
  );
  assert.equal(exported.clips[1].volume, 0.5);
  assert.ok(exported.clips[0].url.endsWith("?signed"), "Sources are signed before submission");
  assert.equal(exported.clips[0].url, exported.clips[1].url, "Two instances share one file");
  for (const entry of exported.clips) {
    assert.deepEqual(entry.voices, [], "Speech is baked in, so there is no voice track");
    assert.equal(entry.voice_delay, 0);
  }

  // Export refuses while a clip points at an older video.
  saved = project();
  saved.scenes[0].takes = [take(), take({ id: "t1b", duration: 4 })];
  saved.scenes[0].selectedVideoId = "t1b";
  exported = null;
  response = await render.POST(
    { json: async () => ({ requestId: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff" }) },
    context,
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Relink them first/);
  assert.equal(exported, null, "Nothing is submitted, so nothing is billed");

  // And while an appearance check has failed.
  saved = project();
  saved.characters = [
    { id: "c1", name: "Ayesha", appearance: "Dark suit.", locked: true, referenceId: "r1", references: [{ id: "r1", label: "Primary" }] },
  ];
  saved.scenes[0].characterIds = ["c1"];
  response = await render.POST(
    { json: async () => ({ requestId: "cccccccc-dddd-4eee-8fff-000000000001" }) },
    context,
  );
  assert.equal(response.status, 400);
  assert.equal(exported, null);

  console.log(
    "PASS: API trim/split/reorder/delete/levels with refusals that save nothing, undoable relinking that only ever replaces a source on request, assembly gated on the live queue, and an export of clip instances refused while stale or unchecked.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
