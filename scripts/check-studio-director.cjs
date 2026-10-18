// Opt-in live provider smoke check. Text calls use configured LLM credentials.
// --render additionally submits ONE billable Magic Hour image job; never run in CI.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadTs } = require("./test-studio.cjs");
class StudioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
(async () => {
  const { EMPTY_STUDIO } = loadTs("types/studio.ts");
  const { directorReply } = loadTs("lib/studio/ai.ts", {
    "./store": { StudioError },
  });
  const { chatImageRequest } = loadTs("lib/studio/logic.ts");
  const state = { ...structuredClone(EMPTY_STUDIO), mode: "discover" };
  async function turn(text) {
    const result = await directorReply(state, text, "plan");
    state.messages.push(
      { role: "user", text, tab: "plan" },
      {
        role: "assistant",
        text: result.reply,
        choices: result.choices,
        plan: result.plan,
        tab: "plan",
      },
    );
    console.log(
      JSON.stringify({
        reply: result.reply,
        choices: result.choices?.map((choice) => choice.label),
        hasImageRequest: !!result.image,
      }),
    );
    return result;
  }
  const ideas = await turn(
    "I don't have a clear idea yet. Help me discover one and develop it into a story.",
  );
  assert.ok(
    ideas.choices?.length >= 2,
    "Discovery must produce clickable actual ideas",
  );
  const development = await turn(ideas.choices[0].message);
  assert.ok(
    development.choices?.length >= 2,
    "Development must offer concrete next choices",
  );
  const text =
    "Generate a photo of the main character from the idea we just chose. Choose a suitable appearance if we haven't decided it yet.";
  const imageReply = await turn(text);
  assert.ok(
    imageReply.image?.prompt,
    "The model must request an image in Plan",
  );
  const request = chatImageRequest(state, text, imageReply.image).request;
  assert.ok(request);
  console.log(
    "PASS: live discovery, story development and Plan image routing.",
  );
  if (!process.argv.includes("--render")) return;
  const { startChatImage, magicHour } = loadTs("lib/studio/media.ts", {
    "./store": { StudioError },
    "@/lib/audio/tts-storage": {},
    "@/lib/supabase-storage": {},
  });
  const take = await startChatImage("live-smoke-check", request);
  console.log("Magic Hour accepted one image generation request.");
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const details = await magicHour(
      `/image-projects/${encodeURIComponent(take.providerId)}`,
    );
    console.log(`Image status: ${details.status}`);
    if (["error", "canceled"].includes(details.status))
      throw new Error("The live image render failed.");
    if (details.status !== "complete") continue;
    const url = details.downloads?.[0]?.url || details.files?.[0]?.url;
    const parsed = new URL(url);
    assert.ok(
      parsed.protocol === "https:" && parsed.hostname.endsWith(".magichour.ai"),
    );
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(45000),
    });
    assert.ok(response.ok);
    const contentType = response.headers.get("content-type") || "";
    assert.ok(contentType.startsWith("image/"));
    const directory = path.resolve(".run-screenshots");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(
      path.join(directory, "director-live-image.png"),
      Buffer.from(await response.arrayBuffer()),
    );
    console.log("PASS: one live Magic Hour image rendered and downloaded.");
    return;
  }
  console.log(
    "Image was accepted but is still rendering after the smoke-check window. No second job was submitted.",
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
