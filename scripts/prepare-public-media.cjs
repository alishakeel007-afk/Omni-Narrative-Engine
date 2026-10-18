// Generate only the original public landscape prompts below. Never prints keys.
// --account is read-only. --generate submits one 5s 4K hero job and one 5s
// 4K supporting job, reusing job IDs from ignored local state on later runs.
const fs = require("node:fs");
const path = require("node:path");
const { loadTs } = require("./test-studio.cjs");
const { getEnvValue } = loadTs("lib/env.ts");
const directory = path.resolve("public/films");
const statePath = path.resolve(".run-screenshots/public-media-jobs.json");
const scenes = [
  {
    slug: "emerald-world",
    name: "OmniNarrative original — A world waiting to be written",
    prompt:
      "Photorealistic cinematic aerial wide shot of an ancient weathered stone observatory on a tiny moss-covered rocky island in the middle of an immense emerald-green mountain lake, layered dramatic alpine peaks disappearing into soft mist, small warm amber windows, deep forest green water with gentle moving ripples, luminous overcast dawn sky. Very slow and steady cinematic camera push forward, subtle low clouds drifting between the mountains. Premium fantasy film, sophisticated natural green and charcoal palette, realistic stone and moss textures. Broad open mist and dark water on the left third for website typography. Peaceful, intriguing, highly detailed, tasteful film grain. Single continuous shot, no cuts, no text, no logos, no people, no dialogue, no audio.",
  },
  {
    slug: "forest-light",
    name: "OmniNarrative original — Follow a little wonder",
    prompt:
      "Photorealistic cinematic wide shot in an ancient dense temperate rainforest, an elegant narrow moss-covered stone footbridge crossing a calm emerald stream beneath enormous fern-covered trees. A soft shaft of pale warm morning sunlight through the green canopy, tiny drifting mist particles, delicate moving leaves and gentle water ripples. Very slow steady camera push forward along the stream. Premium fantasy adventure film, deep forest greens, near-black shadows, soft white highlights. Magical atmosphere grounded in realistic plants and stone. Single continuous composition, no cuts, no characters, no text, no logos, no speech, silent.",
  },
];
async function api(endpoint, body) {
  const key = getEnvValue(["MAGIC_HOUR_API_KEY"]);
  if (!key) throw new Error("MAGIC_HOUR_API_KEY is not configured.");
  const response = await fetch(`https://api.magichour.ai/v1${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `Magic Hour ${response.status}: ${String(data.message || data.code || "request rejected").slice(0, 300)}`,
    );
  return data;
}
(async () => {
  if (process.argv.includes("--account")) {
    const account = await api("/account");
    console.log(
      JSON.stringify({
        credits: account.credits,
        subscription: account.subscription,
        availableFields: Object.keys(account),
      }),
    );
    return;
  }
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : {};
  const persist = () =>
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
  const web = process.argv.includes("--generate-web");
  if (process.argv.includes("--generate") || web)
    for (const scene of scenes) {
      if (state[scene.slug]?.id) continue;
      const model = web ? "ltx-2.5" : "kling-3.0";
      const resolution = web ? "480p" : "4k";
      const result = await api("/text-to-video", {
        name: scene.name,
        style: { prompt: scene.prompt },
        model,
        aspect_ratio: "16:9",
        resolution,
        end_seconds: 5,
        audio: false,
      });
      state[scene.slug] = {
        id: result.id,
        credits: result.credits_charged,
        prompt: scene.prompt,
        model,
        requestedResolution: resolution,
        status: "queued",
      };
      persist();
      console.log(
        `${scene.slug}: accepted (${result.credits_charged ?? "unknown"} credits).`,
      );
    }
  for (const scene of scenes) {
    const job = state[scene.slug];
    if (!job?.id || job.saved) continue;
    const result = await api(`/video-projects/${encodeURIComponent(job.id)}`);
    job.status = result.status;
    persist();
    console.log(`${scene.slug}: ${result.status}`);
    if (result.status !== "complete") continue;
    const url = result.downloads?.[0]?.url;
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname.endsWith(".magichour.ai")
    )
      throw new Error("Unexpected media download host.");
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok)
      throw new Error("Could not download the generated video.");
    fs.writeFileSync(
      path.join(
        directory,
        `${scene.slug}-${job.requestedResolution === "4k" ? "4k" : "source"}.mp4`,
      ),
      Buffer.from(await response.arrayBuffer()),
    );
    job.saved = true;
    persist();
    console.log(`${scene.slug}: ${job.requestedResolution} source downloaded.`);
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
