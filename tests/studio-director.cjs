const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");
class StudioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

async function testDirector() {
  const { EMPTY_STUDIO } = loadTs("types/studio.ts");
  const { chatImageRequest, isImageRequest, scenePrompt } = loadTs(
    "lib/studio/logic.ts",
  );
  const state = structuredClone(EMPTY_STUDIO);
  state.characters = [
    {
      id: "elara",
      name: "Elara",
      appearance: "Dark curls, a blue coat and brass goggles.",
      locked: true,
      referenceId: "ref-original",
    },
  ];
  state.scenes = [
    {
      id: "scene",
      title: "Rooftop",
      description: "Elara repairs the machine.",
      characterIds: ["elara"],
      dialogues: [],
      takes: [],
    },
  ];
  const request = chatImageRequest(
    state,
    "Generate a photo of the character.",
  ).request;
  assert.ok(request.prompt.includes("brass goggles"));
  assert.deepEqual(Array.from(request.referenceIds), ["ref-original"]);
  for (const text of [
    "How can I generate a photo?",
    "Don't generate a photo yet.",
    "I don't want an image.",
    "Generate a portrait later.",
    "Let's discuss her hair",
    "Can I generate a portrait?",
  ])
    assert.equal(isImageRequest(text), false);
  assert.equal(isImageRequest("Can you generate an image of Elara?"), true);
  assert.equal(isImageRequest("I'd like a portrait of Elara."), true);
  assert.equal(
    chatImageRequest(
      state,
      "Here is my script: the painter says generate a photo of Elara.",
    ).request,
    undefined,
  );
  assert.ok(
    chatImageRequest(EMPTY_STUDIO, "Draw a picture of a moonlit forest.")
      .request,
  );
  const two = structuredClone(state);
  two.characters.push({
    id: "jax",
    name: "Jax",
    appearance: "A silver robot.",
    locked: false,
  });
  assert.equal(
    chatImageRequest(two, "Generate a photo of the character.").choices.length,
    2,
  );
  const draft = structuredClone(EMPTY_STUDIO);
  draft.messages.push({
    plan: {
      world: "An amber desert",
      characters: [
        { name: "Nora", appearance: "A red scarf and short silver hair." },
      ],
    },
  });
  assert.ok(
    chatImageRequest(
      draft,
      "Generate a portrait of Nora.",
    ).request.prompt.includes("red scarf"),
  );
  const previousKey = scenePrompt(state, "scene").continuityKey;
  state.characters[0].referenceId = "ref-replacement";
  assert.notEqual(scenePrompt(state, "scene").continuityKey, previousKey);
  console.log(
    "PASS: image intent, negation/instructions, generic subjects, draft character retrieval, ambiguity choices, reference revision tracking.",
  );

  const prompts = [];
  let responses = [];
  const ai = loadTs("lib/studio/ai.ts", {
    "@/lib/env": { getEnvValue: () => "configured-test-value" },
    "./store": { StudioError },
    fetch: async (_, options) => {
      prompts.push(JSON.parse(options.body).contents[0].parts[0].text);
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: responses.shift() }] } }],
        }),
      };
    },
  });
  assert.equal(
    ai.parseDirectorResponse({
      reply: "A quieter scene?",
      edits: [
        { sceneId: "scene", changes: { musicVolume: 0.1, voiceDelay: null } },
      ],
      plan: null,
      choices: null,
      image: null,
    }).success,
    true,
  );
  responses = [
    JSON.stringify({
      reply: "Let's try these ideas.",
      choices: [
        {
          label: "The last seed",
          description: "A gardener saves a city.",
          message: "Develop the gardener who saves a city with its last seed.",
        },
      ],
      plan: null,
    }),
  ];
  const ideas = await ai.directorReply(draft, "Give me new ideas", "plan");
  assert.equal(ideas.choices[0].label, "The last seed");
  assert.ok(prompts[0].includes("red scarf"));
  assert.ok(prompts[0].includes("THREE concrete"));
  responses = [
    JSON.stringify({ reply: "Oops", plan: {} }),
    JSON.stringify({ reply: "A valid turn", plan: null }),
  ];
  assert.equal(
    (await ai.directorReply(state, "Help me plan", "plan")).reply,
    "A valid turn",
  );
  responses = [
    JSON.stringify({ reply: "Oops", plan: {} }),
    JSON.stringify({ reply: "Oops", plan: {} }),
  ];
  await assert.rejects(
    () => ai.directorReply(state, "Help me plan", "plan"),
    (error) => error.status === 502 && !error.message.includes("Invalid input"),
  );
  responses = ['```json\n{"reply":"Fenced JSON works"}\n```'];
  assert.equal(
    (await ai.directorReply(state, "Hello", "plan")).reply,
    "Fenced JSON works",
  );
  console.log(
    "PASS: clickable choice contract, proposed-plan memory, optional null fields, JSON fences, malformed plan recovery and upstream error classification.",
  );

  let user = { id: "owner" };
  let saved = structuredClone(state);
  let failImage = true;
  let starts = 0;
  const nextResponse = {
    NextResponse: {
      json: (body, options) => ({ body, status: options?.status || 200 }),
    },
  };
  const store = {
    StudioError,
    loadStudio: async (owner, id) => {
      if (owner !== "owner" || id !== "project")
        throw new StudioError("Project not found", 404);
      return { project: { id, userId: owner }, state: structuredClone(saved) };
    },
    saveStudio: async (loaded, next) => {
      if (loaded.state.revision !== saved.revision)
        throw new StudioError("Revision conflict", 409);
      saved = { ...structuredClone(next), revision: saved.revision + 1 };
      return saved;
    },
  };
  const auth = {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
    }),
  };
  const route = loadTs("app/api/studio/[id]/route.ts", {
    "next/server": nextResponse,
    "@/lib/supabase/server": auth,
    "@/lib/studio/store": store,
    // Only DELETE queries the database; these assertions never reach it.
    "@/lib/prisma": {},
    "@/lib/studio/ai": {
      directorReply: async () => ({
        reply: "Your image",
        plan: null,
        image: {
          prompt: "Elara in a sunlit studio",
          characterNames: ["Elara"],
        },
      }),
    },
    "@/lib/studio/media": {
      startChatImage: async (_, input) => {
        starts++;
        assert.ok(
          saved.operation,
          "Generation must be reserved before charging",
        );
        assert.ok(
          saved.messages.at(-1).imageRequest,
          "The image request must survive provider failure",
        );
        assert.equal(input.referenceIds[0], "ref-replacement");
        if (failImage)
          throw new StudioError("Magic Hour has insufficient credits.", 402);
        return {
          id: `image-${starts}`,
          providerId: "provider-image",
          kind: "image",
          status: "queued",
          prompt: input.prompt,
        };
      },
      magicHour: async () => ({
        status: "complete",
        downloads: [{ url: "https://videos.magichour.ai/portrait.png" }],
      }),
      archiveTake: async (_, __, take) => {
        take.stored = true;
      },
    },
    "@/lib/audio/music-service": {},
  });
  const context = { params: Promise.resolve({ id: "project" }) };
  const post = (body) => route.POST({ json: async () => body }, context);
  assert.equal(
    (
      await post({
        action: "chat",
        tab: "plan",
        text: "Generate a photo of Elara.",
      })
    ).status,
    200,
  );
  const messageId = saved.messages.at(-1).id;
  assert.match(saved.messages.at(-1).imageError, /credits/);
  assert.equal(saved.operation, undefined);
  failImage = false;
  assert.equal(
    (await post({ action: "generateChatImage", messageId })).status,
    200,
  );
  assert.equal(saved.messages.at(-1).image.status, "queued");
  assert.equal(
    (await post({ action: "generateChatImage", messageId })).status,
    409,
  );
  assert.equal(starts, 2, "A duplicate retry must not reach the provider");
  assert.equal((await post({ action: "poll" })).status, 200);
  assert.equal(saved.messages.at(-1).image.status, "complete");
  assert.equal(saved.messages.at(-1).image.stored, true);
  assert.equal(
    (await post({ action: "generateChatImage", messageId })).status,
    409,
  );
  for (const tab of ["scenes", "assemble"]) {
    assert.equal(
      (await post({ action: "chat", tab, text: "Generate an image of Elara." }))
        .status,
      200,
    );
    assert.equal(saved.messages.at(-1).tab, tab);
    assert.equal(saved.messages.at(-1).image.status, "queued");
  }
  user = { id: "intruder" };
  assert.equal(
    (await post({ action: "generateChatImage", messageId })).status,
    404,
  );
  console.log(
    "PASS: chat image generation in all tabs, failure persistence, explicit retry, duplicate protection, reservation release, polling, archival and ownership.",
  );

  let mediaFetches = 0;
  const mediaRoute = loadTs("app/api/studio/[id]/media/route.ts", {
    "next/server": nextResponse,
    "@/lib/supabase/server": auth,
    "@/lib/studio/store": store,
    // These assertions use the chat-image path, which never queries scene jobs.
    "@/lib/prisma": {},
    fetch: async () => {
      mediaFetches++;
      return new Response("image-bytes", {
        headers: { "Content-Type": "image/png" },
      });
    },
  });
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  try {
    const req = new Request(
      `https://app.example/api/studio/project/media?messageId=${messageId}`,
    );
    assert.equal((await mediaRoute.GET(req, context)).status, 404);
    user = { id: "owner" };
    const served = await mediaRoute.GET(req, context);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("Content-Type"), "image/png");
    assert.equal(mediaFetches, 1);
    saved.messages.find((message) => message.id === messageId).image.url =
      "http://127.0.0.1/secret";
    assert.equal((await mediaRoute.GET(req, context)).status, 400);
    assert.equal(mediaFetches, 1);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  }
  console.log(
    "PASS: authenticated chat image playback, project ownership and outbound source restriction.",
  );
}
module.exports = testDirector;
if (require.main === module)
  testDirector().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
