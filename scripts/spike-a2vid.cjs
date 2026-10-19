// One-off Phase 1 validation: drive the real audio-conditioned path end to end.
//
// This uses the production functions in lib/studio/ltx.ts rather than a bespoke
// request, so what passes here is what the app will do. It submits exactly one
// generation and never resubmits: polling only reads job status, so a failure
// is reported, not retried.
//
//   node scripts/spike-a2vid.cjs --audio <file> --image <file> [--minutes 30]
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { loadTs } = require("./test-studio.cjs");

const root = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(root, ".env.local") });

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : fallback;
}

const audioFile = arg("audio");
const imageFile = arg("image");
const budgetMinutes = Number(arg("minutes", "30"));
const outputDir = arg("out", path.join(root, ".run-screenshots", "a2vid-spike"));

// The spike enables the gated pipeline for this process only; .env.local is
// left alone so nothing is turned on for the app without an explicit change.
process.env.STUDIO_LTX_AUDIO_PIPELINE = "a2vid";

const PROMPT = [
  "A woman in a dark navy suit jacket and pale pink shirt sits upright on a blue sofa against a plain green background, facing the camera and speaking directly to it.",
  "Medium close-up, eye level, static camera, even studio lighting. Her long dark hair falls over her left shoulder.",
  "She is the only person in frame and the only voice.",
  "Speak the supplied audio exactly as provided. Do not add any other speech, narration, voiceover or subtitles.",
].join("\n");

function elapsed(since) {
  return ((Date.now() - since) / 1000).toFixed(1);
}

(async () => {
  if (!audioFile || !imageFile) {
    throw new Error("Pass --audio <file> and --image <file>.");
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const storage = loadTs("lib/supabase-storage.ts");
  const ltx = loadTs("lib/studio/ltx.ts");
  if (!ltx.audioVideoEnabled()) throw new Error("Audio pipeline is not enabled.");

  const started = Date.now();
  const deadline = started + budgetMinutes * 60_000;

  // 1. Publish the conditioning speech where the worker is allowed to read it.
  const audioBytes = fs.readFileSync(audioFile);
  const uploaded = await storage.uploadToSupabaseStorage({
    bucket: process.env.SUPABASE_AUDIO_BUCKET || "generated-audio",
    path: `spike/a2vid-${randomUUID()}.mp3`,
    body: audioBytes,
    contentType: "audio/mpeg",
    upsert: true,
  });
  console.log(`[${elapsed(started)}s] uploaded conditioning audio (${audioBytes.length} bytes)`);

  // 2. Publish the reference portrait: startLtxAudioVideo reads it as an image
  //    payload through the same host allowlist.
  const imageBytes = fs.readFileSync(imageFile);
  const portrait = await storage.uploadToSupabaseStorage({
    bucket: process.env.SUPABASE_IMAGE_BUCKET || "generated-images",
    path: `spike/a2vid-${randomUUID()}.jpg`,
    body: imageBytes,
    contentType: "image/jpeg",
    upsert: true,
  });
  console.log(`[${elapsed(started)}s] uploaded reference portrait (${imageBytes.length} bytes)`);

  // 3. Exactly one billable submission.
  const requestId = randomUUID();
  const submitted = Date.now();
  const take = await ltx.startLtxAudioVideo({
    prompt: PROMPT,
    audioUrl: uploaded.publicUrl,
    imageUrl: portrait.publicUrl,
    identity: [],
    continuityKey: `spike-${requestId}`,
    requestId,
    // Validation size: enough to judge mouth movement at lower GPU cost.
    width: 768,
    height: 512,
  });
  console.log(`[${elapsed(started)}s] submitted job ${take.providerId} (request ${requestId})`);

  // 4. Read-only polling. pollLtxVideo archives the MP4 to Supabase on success.
  let lastStatus = "";
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    try {
      await ltx.pollLtxVideo("spike", "shot-1", take);
    } catch (error) {
      console.log(`[${elapsed(started)}s] poll error: ${error.message}`);
      if (Date.now() >= deadline) break;
      continue;
    }
    if (take.status !== lastStatus) {
      lastStatus = take.status;
      console.log(`[${elapsed(started)}s] status: ${take.status}`);
    }
    if (take.status === "error") {
      console.log(`\nFAILED after ${elapsed(started)}s: ${take.error}`);
      console.log("No retry was attempted. Inspect the Modal logs before resubmitting.");
      process.exitCode = 1;
      return;
    }
    if (take.status === "complete" && take.stored) break;
  }

  if (take.status !== "complete") {
    console.log(`\nBUDGET REACHED after ${elapsed(started)}s with status "${take.status}".`);
    console.log("Nothing was resubmitted. The job may still be running on Modal.");
    process.exitCode = 1;
    return;
  }

  const generationSeconds = ((Date.now() - submitted) / 1000).toFixed(1);
  console.log(`\n[${elapsed(started)}s] complete. generation wall clock: ${generationSeconds}s`);
  console.log(`archived: ${take.url}`);
  console.log(`reported duration: ${take.duration}s`);

  // 5. Keep a local copy to review.
  const response = await fetch(take.url);
  const local = path.join(outputDir, `a2vid-${requestId}.mp4`);
  fs.writeFileSync(local, Buffer.from(await response.arrayBuffer()));
  console.log(`local copy: ${local}`);
  fs.writeFileSync(
    path.join(outputDir, `a2vid-${requestId}.json`),
    JSON.stringify({ requestId, providerId: take.providerId, url: take.url, duration: take.duration, generationSeconds, prompt: PROMPT }, null, 2),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
