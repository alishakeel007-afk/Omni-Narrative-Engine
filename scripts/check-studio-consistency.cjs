// Opt-in live Gemini checks using the previous synthetic smoke-test artifacts.
// No GPU jobs, identity training, or paid image/video renders are submitted.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { loadTs } = require("./test-studio.cjs");
class StudioError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
(async () => {
  const portrait = fs.readFileSync(".run-screenshots/director-live-image.png");
  const reference = {
    mimeType: "image/png",
    data: portrait.toString("base64"),
  };
  const ai = loadTs("lib/studio/ai.ts", { "./store": { StudioError } });
  const { appearance } = await ai.analyseCharacter(
    [reference, reference],
    "Cartographer",
  );
  assert.ok(appearance.length > 20);
  console.log("PASS: live multi-reference canonical appearance analysis.");
  const checker = loadTs("lib/studio/continuity.ts", {
    "./ai": ai,
    "./store": { StudioError, referenceData: async () => reference },
    fetch: async () =>
      new Response(portrait, { headers: { "Content-Type": "image/png" } }),
  });
  const take = {
    status: "complete",
    kind: "image",
    url: "https://images.magichour.ai/smoke.png",
    identity: [
      {
        characterId: "fictional",
        name: "Cartographer",
        appearance,
        referenceIds: ["front", "other-view"],
        key: "test",
      },
    ],
  };
  const review = await checker.reviewTake("smoke", take);
  console.log(
    JSON.stringify({
      check: "identical reference and output image",
      status: review.status,
      notes: review.checks?.[0]?.notes,
    }),
  );
  assert.equal(review.status, "passed");
  const video = fs.readFileSync(".run-screenshots/synthetic-clip.webm");
  const videoChecker = loadTs("lib/studio/continuity.ts", {
    "./ai": ai,
    "./store": { StudioError, referenceData: async () => reference },
    fetch: async () =>
      new Response(video, { headers: { "Content-Type": "video/webm" } }),
  });
  const videoReview = await videoChecker.reviewTake("smoke", {
    ...take,
    kind: "video",
  });
  console.log(
    JSON.stringify({
      check: "video without the reference character",
      status: videoReview.status,
      sampleFps: videoReview.sampleFps,
      notes: videoReview.checks?.[0]?.notes,
    }),
  );
  assert.notEqual(
    videoReview.status,
    "passed",
    "Absent/unverifiable characters must remain blocked",
  );
  console.log(
    "PASS: live reference-image comparison and 24 fps video review with conservative rejection.",
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
