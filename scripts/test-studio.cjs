const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");

function loadTs(filename, mocks = {}, cache = {}) {
  const absolute = path.resolve(filename);
  if (cache[absolute]) return cache[absolute].exports;
  const module = { exports: {} };
  cache[absolute] = module;
  const source = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (name) => {
    if (name in mocks) return mocks[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const candidate = name.startsWith("@/")
        ? path.resolve(name.slice(2))
        : path.resolve(path.dirname(absolute), name);
      return loadTs(
        candidate + (candidate.endsWith(".ts") ? "" : ".ts"),
        mocks,
        cache,
      );
    }
    return require(name);
  };
  vm.runInNewContext(
    source,
    {
      module,
      exports: module.exports,
      require: localRequire,
      global,
      process,
      Buffer,
      crypto: globalThis.crypto,
      structuredClone,
      URL,
      Request,
      Response,
      File,
      FormData,
      AbortSignal,
      fetch: mocks.fetch || globalThis.fetch,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      console,
    },
    { filename: absolute },
  );
  return module.exports;
}
module.exports = { loadTs };
if (require.main === module)
  (async () => {
    // Legacy-provider fixtures must stay isolated from live LTX configuration.
    process.env.STUDIO_VIDEO_BACKEND = "magic-hour";
    const { EMPTY_STUDIO } = loadTs("types/studio.ts");
    const { approvePlan, scenePrompt } = loadTs("lib/studio/logic.ts");
    const state = structuredClone(EMPTY_STUDIO);
    state.characters = [
      {
        id: "elara",
        name: "Elara",
        appearance:
          "Dark curls; blue coat; brass goggles; small visible cheek mark.",
        locked: true,
        referenceId: "private-ref",
      },
    ];
    const plan = {
      title: "Rain",
      premise: "Restore rain",
      world: "Rain-soaked city",
      characters: [
        { name: "Elara", appearance: "Do not overwrite the locked reference" },
      ],
      scenes: [
        {
          title: "Rooftop",
          description: "Elara studies the harvester.",
          characters: ["Elara"],
          dialogues: [{ character: "Elara", text: "Almost there." }],
        },
      ],
    };
    const approved = approvePlan(state, plan);
    assert.equal(
      approved.characters[0].appearance,
      state.characters[0].appearance,
    );
    assert.equal(approved.scenes[0].characterIds[0], "elara");
    const prompt = scenePrompt(approved, approved.scenes[0].id);
    assert.ok(prompt.prompt.includes("small visible cheek mark"));
    approved.scenes[0].takes = [
      {
        id: "take1",
        kind: "video",
        providerId: "provider1",
        status: "complete",
        prompt: "old prompt",
        createdAt: new Date().toISOString(),
      },
    ];
    approved.scenes[0].dialogues[0].audioUrl = "https://example.com/old.mp3";
    approved.timeline = [approved.scenes[0].id];
    const revisedPlan = structuredClone(plan);
    revisedPlan.scenes[0].dialogues[0].text = "Wait!";
    const revised = approvePlan(approved, revisedPlan);
    assert.equal(revised.scenes[0].id, approved.scenes[0].id);
    assert.equal(revised.scenes[0].takes[0].id, "take1");
    assert.equal(revised.scenes[0].outdated, true);
    assert.equal(revised.scenes[0].dialogues[0].audioUrl, undefined);
    console.log(
      "PASS: locked appearance preservation, cast retrieval, complete trait prompts, take retention, and stale dialogue invalidation.",
    );

    class StudioError extends Error {
      constructor(message, status = 400) {
        super(message);
        this.status = status;
      }
    }
    const calls = [];
    const stored = [];
    const media = loadTs("lib/studio/media.ts", {
      "@/lib/env": { getEnvValue: () => "test-key" },
      "./store": {
        StudioError,
        referenceData: async () => ({
          mimeType: "image/png",
          data: Buffer.from("reference").toString("base64"),
        }),
      },
      "@/lib/audio/tts-storage": {
        uploadTtsAudioToStorage: async () => "https://example.com/audio.mp3",
      },
      "@/lib/supabase-storage": {
        uploadToSupabaseStorage: async (options) => {
          stored.push(options);
          return {
            publicUrl:
              "https://example.supabase.co/storage/v1/object/public/generated-videos/saved.mp4",
          };
        },
      },
      fetch: async (url, options = {}) => {
        calls.push({
          url,
          options,
          body:
            options.body && typeof options.body === "string"
              ? JSON.parse(options.body)
              : undefined,
        });
        if (url.endsWith("/files/upload-urls"))
          return {
            ok: true,
            json: async () => ({
              items: [
                {
                  upload_url: "https://videos.magichour.ai/upload",
                  file_path: "api-assets/character.png",
                },
              ],
            }),
          };
        if (url.endsWith("/upload")) return { ok: true };
        if (url.endsWith("/take.mp4"))
          return {
            ok: true,
            headers: new Headers({ "content-type": "video/mp4" }),
            arrayBuffer: async () => new ArrayBuffer(200),
          };
        if (url.includes("/image-projects/"))
          return {
            ok: true,
            json: async () => ({
              downloads: [{ url: "https://videos.magichour.ai/scene.png" }],
            }),
          };
        return { ok: true, json: async () => ({ id: "provider-generated" }) };
      },
    });
    const mediaState = approvePlan(state, plan);
    const sceneImage = await media.startMedia(
      mediaState,
      "draft",
      mediaState.scenes[0].id,
      "image",
      false,
    );
    const imageCall = calls.find((call) =>
      call.url.endsWith("/ai-image-editor"),
    );
    assert.equal(
      imageCall.body.assets.image_file_paths[0],
      "api-assets/character.png",
    );
    assert.ok(
      imageCall.body.style.prompt.includes(state.characters[0].appearance),
    );
    assert.equal(
      calls.filter((call) => call.options.method === "PUT").length,
      1,
    );
    await assert.rejects(
      () =>
        media.startMedia(
          mediaState,
          "draft",
          mediaState.scenes[0].id,
          "video",
          false,
        ),
      /scene image first/,
    );
    const mediaScene = mediaState.scenes[0];
    mediaScene.takes.push({
      ...sceneImage,
      status: "complete",
      url: "https://videos.magichour.ai/scene.png",
    });
    mediaScene.selectedImageId = sceneImage.id;
    await assert.rejects(
      () =>
        media.startMedia(mediaState, "draft", mediaScene.id, "video", false),
      /successful appearance check/,
    );
    mediaScene.takes[0].continuity = {
      status: "passed",
      method: "visual-review",
    };
    await media.startMedia(mediaState, "draft", mediaScene.id, "video", false);
    assert.ok(calls.some((call) => call.url.endsWith("/image-to-video")));
    mediaState.characters[0].referenceId = "replacement-with-same-description";
    await assert.rejects(
      () =>
        media.startMedia(mediaState, "draft", mediaScene.id, "video", false),
      /changed|older plan or character profile/,
    );
    await media.startChatImage("draft", {
      prompt: "A moonlit forest",
      referenceIds: [],
    });
    const genericImage = calls.find((call) =>
      call.url.endsWith("/ai-image-generator"),
    );
    assert.equal(genericImage.body.style.prompt, "A moonlit forest");
    assert.equal(genericImage.body.model, "z-image-turbo");
    await assert.rejects(
      () =>
        media.startChatImage("draft", {
          prompt: "Group portrait",
          referenceIds: ["1", "2", "3", "4", "5", "6", "7"],
        }),
      /six character references/,
    );
    await assert.rejects(
      () =>
        media.startMedia(
          mediaState,
          "draft",
          mediaState.scenes[0].id,
          "video",
          true,
        ),
      /Text-only video/,
    );
    const landscapeState = structuredClone(mediaState);
    landscapeState.scenes[0].characterIds = [];
    await media.startMedia(
      landscapeState,
      "draft",
      mediaState.scenes[0].id,
      "video",
      true,
    );
    assert.ok(calls.some((call) => call.url.endsWith("/text-to-video")));
    const takeToArchive = {
      id: "take-copy",
      kind: "video",
      url: "https://videos.magichour.ai/take.mp4",
    };
    await media.archiveTake("project", "scene", takeToArchive);
    assert.equal(takeToArchive.stored, true);
    assert.equal(stored[0].bucket, "generated-videos");
    assert.equal(stored[0].upsert, true);
    console.log(
      "PASS: reference upload, image conditioning, appearance gate, reference invalidation, character text-only prevention, landscape video, and archival.",
    );

    let user = { id: "owner" };
    let loadedState = structuredClone(mediaState);
    let saves = 0;
    const route = loadTs("app/api/studio/[id]/route.ts", {
      "next/server": {
        NextResponse: {
          json: (body, options) => ({ body, status: options?.status || 200 }),
        },
      },
      "@/lib/supabase/server": {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user } }) },
        }),
      },
      "@/lib/studio/store": {
        StudioError,
        loadStudio: async (userId, id) => {
          if (userId !== "owner" || id !== "project")
            throw new StudioError("Project not found.", 404);
          return {
            project: { id },
            draft: { id: "draft" },
            state: loadedState,
          };
        },
        saveStudio: async (_, next) => {
          saves++;
          loadedState = {
            ...structuredClone(next),
            revision: loadedState.revision + 1,
          };
          return loadedState;
        },
      },
      "@/lib/studio/ai": {
        directorReply: async () => ({
          reply: "What kind of story interests you?",
          plan: null,
        }),
      },
      "@/lib/studio/media": {
        startMedia: async () => {
          throw new StudioError("Credits exhausted", 402);
        },
        generateVoices: async () => [],
        magicHour: async () => ({ status: "complete" }),
      },
      "@/lib/audio/music-service": {
        generateSceneMusic: async () => ({
          url: "https://example.com/music.mp3",
        }),
      },
    });
    const context = { params: Promise.resolve({ id: "project" }) };
    const post = (body) => route.POST({ json: async () => body }, context);
    user = null;
    assert.equal((await route.GET({}, context)).status, 401);
    user = { id: "intruder" };
    assert.equal((await route.GET({}, context)).status, 404);
    user = { id: "owner" };
    assert.equal(
      (
        await post({
          action: "chat",
          text: "Help me find an idea",
          tab: "plan",
          mode: "discover",
        })
      ).status,
      200,
    );
    assert.equal(loadedState.mode, "discover");
    assert.equal(saves, 1);
    assert.equal(
      (await post({ action: "timeline", sceneIds: ["unknown-scene"] })).status,
      400,
    );
    assert.equal(
      (
        await post({
          action: "edit",
          sceneId: mediaState.scenes[0].id,
          edit: {
            start: 4,
            end: 2,
            voiceDelay: 0,
            voiceVolume: 1,
            musicVolume: 0.2,
            videoVolume: 0,
          },
        })
      ).status,
      400,
    );
    const failure = await post({
      action: "generate",
      sceneId: mediaState.scenes[0].id,
      kind: "video",
      direct: true,
    });
    assert.equal(failure.status, 402);
    assert.equal(loadedState.operation, undefined);
    loadedState.operation = {
      id: "in-progress",
      startedAt: new Date().toISOString(),
    };
    assert.equal(
      (
        await post({
          action: "generate",
          sceneId: mediaState.scenes[0].id,
          kind: "image",
        })
      ).status,
      409,
    );
    console.log(
      "PASS: authentication, project ownership, intent persistence, timeline validation, trim validation, generation reservation and failure recovery.",
    );
    delete loadedState.operation;
    loadedState.messages.push({
      id: "edit-proposal",
      role: "assistant",
      tab: "assemble",
      text: "Lower the music",
      editProposal: [
        { sceneId: mediaState.scenes[0].id, changes: { musicVolume: 0.05 } },
      ],
    });
    assert.equal(
      (await post({ action: "applyEdits", messageId: "edit-proposal" })).status,
      200,
    );
    assert.equal(loadedState.edits[mediaState.scenes[0].id].musicVolume, 0.05);
    assert.equal((await post({ action: "undoEdits" })).status, 200);
    assert.equal(loadedState.edits[mediaState.scenes[0].id], undefined);
    console.log(
      "PASS: conversational edit approval, scene targeting, and undo.",
    );
    const exportUploads = [];
    const exportRoute = loadTs("app/api/studio/[id]/export/route.ts", {
      "next/server": {
        NextResponse: {
          json: (body, options) => ({ body, status: options?.status || 200 }),
        },
      },
      "@/lib/supabase/server": {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user } }) },
        }),
      },
      "@/lib/studio/store": {
        StudioError,
        loadStudio: async (owner, id) => {
          if (owner !== "owner" || id !== "project")
            throw new StudioError("Project not found.", 404);
          return { project: { id }, state: structuredClone(loadedState) };
        },
        saveStudio: async (_, next) => {
          loadedState = next;
          return next;
        },
      },
      "@/lib/supabase-storage": {
        uploadToSupabaseStorage: async (options) => {
          exportUploads.push(options);
          return { publicUrl: "https://example.supabase.co/film.webm" };
        },
      },
    });
    const exportRequest = (bytes, type = "video/webm") => {
      const form = new FormData();
      form.append("file", new File([bytes], "film.webm", { type }));
      return { formData: async () => form };
    };
    user = null;
    assert.equal(
      (await exportRoute.POST(exportRequest(new Uint8Array(200)), context))
        .status,
      401,
    );
    user = { id: "owner" };
    assert.equal(
      (await exportRoute.POST(exportRequest(new Uint8Array(200)), context))
        .status,
      400,
    );
    const validWebm = new Uint8Array(200);
    validWebm.set([0x1a, 0x45, 0xdf, 0xa3]);
    const savedExport = await exportRoute.POST(
      exportRequest(validWebm),
      context,
    );
    assert.equal(savedExport.status, 200);
    assert.equal(exportUploads[0].bucket, "generated-videos");
    assert.equal(savedExport.body.state.exports.length, 1);
    console.log(
      "PASS: export authentication, file-signature validation, generated-video storage, and saved-export persistence.",
    );
    await require("../tests/studio-director.cjs")();
    await require("../tests/studio-consistency.cjs")();
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
