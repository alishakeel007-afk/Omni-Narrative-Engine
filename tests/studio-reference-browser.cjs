// Isolated browser fixture: real workflow components, simulated HTTP responses,
// and deliberate latency. No database, auth account or paid provider is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium, expect: baseExpect } = require("@playwright/test");
const { loadTs } = require("../scripts/test-studio.cjs");
const expect = baseExpect.configure({ timeout: 15000 });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
process.env.STUDIO_CLIP_SECONDS = "5,10,15,20";

(async () => {
  const { EMPTY_STUDIO } = loadTs("types/studio.ts");
  const { sceneImageRequirements, sceneIdentity } = loadTs("lib/studio/identity.ts");
  const { clipCapability } = loadTs("lib/film/duration.ts");
  let state = { ...structuredClone(EMPTY_STUDIO), title: "Reference workflow", step: "generate", premise: "A writer waits for an idea at a wooden desk.", characters: [{ id: "writer", name: "Writer", appearance: "Dark hair, blue shirt", locked: true, referenceId: "uploaded-photo" }], scenes: [
    { id: "s1", title: "The study", visualAction: "A writer sits at a desk beside the blue evening window.", description: "A writer sits at a desk beside the blue evening window.", characterIds: ["writer"], dialogues: [], takes: [] },
  ] };
  const take = (id, verdict) => ({ id, providerId: id, kind: "image", provider: "cloudflare", status: "complete", url: `/${id}.jpg`, prompt: "A writer at a desk", identity: sceneIdentity(state, state.scenes[0]), createdAt: new Date().toISOString(), sourceImageRequirements: sceneImageRequirements(state, state.scenes[0]), continuity: {
    status: verdict === "match" ? "passed" : "failed", method: "visual-review", checks: [],
    sceneCheck: { verdict, notes: verdict === "match" ? "The writer, desk and window match." : "The generated image shows a beach; the requested desk and window are missing." },
  } });
  state.scenes[0].takes = [take("bad", "mismatch"), take("good", "match")];
  const jobs = [], submissions = [], deletions = [], actions = [];
  state.scenes[0].takes.push({ ...take("bad-video", "mismatch"), kind: "video", url: "/sample.mp4", nativeAudio: true, duration: 10.04 });
  let selectRequests = 0, failSelection = true, stalePoll = true, initialPollCompleted = false, failImageCleanup = true, failNextSubmission = false, failQueue = false;
  const bundle = await esbuild.build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Film from './screens/FilmStudioScreen';createRoot(document.getElementById('root')).render(<Film/>);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", banner: { js: "var process={env:{}};" }, define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "reference-fixtures", setup(build) {
      build.onResolve({ filter: /^(next\/navigation|next\/link|@\/components\/protected-route)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ loader: "js", resolveDir: process.cwd(), contents:
        args.path === "next/navigation" ? `export const useParams=()=>({id:'project'});export const useRouter=()=>({push:()=>{}});` :
          args.path === "next/link" ? `import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{...props,href},children)}` :
            `export function ProtectedRoute({children}){return children}` }));
    } }],
  });
  const compiled = await require("postcss")([require("tailwindcss")]).process(fs.readFileSync("app/globals.css", "utf8"), { from: path.resolve("app/globals.css") });
  const css = compiled.css + fs.readFileSync("app/public.css", "utf8") + '\n:root{--font-body:Arial}body{margin:0;font-family:Arial}img,video{max-width:100%}details>summary{cursor:pointer}';
  const server = http.createServer(async (req, res) => {
    const respond = (body, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); return; }
    if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); return; }
    if (["/good.jpg", "/bad.jpg"].includes(req.url)) { res.setHeader("Content-Type", "image/jpeg"); res.end(fs.readFileSync("public/posters/ltx-hero-20s.jpg")); return; }
    if (req.url === "/sample.mp4") { res.setHeader("Content-Type", "video/mp4"); res.end(fs.readFileSync("public/films/ltx-hero-20s.mp4")); return; }
    if (req.url.startsWith("/api/studio/project")) {
      if (req.method === "GET") {
        if (failQueue && req.url.endsWith("/jobs")) { respond({ error: "The queue is temporarily unavailable. Retry shortly." }, 503); return; }
        const snapshot = structuredClone(state);
        if (stalePoll && req.url.endsWith("/jobs")) { stalePoll = false; await sleep(4600); initialPollCompleted = true; }
        respond(req.url.endsWith("/jobs") ? { state: snapshot, jobs } : { state: snapshot, capability: clipCapability() }); return;
      }
      let raw = ""; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw);
      actions.push(`${input.action}:${input.takeId ?? input.kind ?? ""}`);
      if (req.url.endsWith("/jobs")) {
        submissions.push(input); await sleep(1000);
        if (failNextSubmission) { failNextSubmission = false; respond({ error: "The video could not be queued. Try again." }, 503); return; }
        const job = { id: `job-${submissions.length}`, sceneId: input.sceneId, kind: input.kind, status: "queued", phase: "prepare", cancelRequested: false, createdAt: new Date().toISOString() };
        jobs.push(job); stalePoll = true; respond({ job }, 202); return;
      }
      if (input.action === "select") {
        selectRequests++; await sleep(1400);
        if (failSelection) { failSelection = false; respond({ error: "The reference selection could not be saved. Please retry." }, 503); return; }
        state = { ...state, revision: state.revision + 1, scenes: state.scenes.map(scene => ({ ...scene, selectedImageId: input.takeId,
          takes: scene.takes.map(take => input.skipCheck && take.id === input.takeId ? { ...take, reviewOverride: { approvedAt: new Date().toISOString(), requirements: sceneImageRequirements(state, scene), sourceUrl: take.url } } : take) })) };
      }
      if (input.action === "scenePatch") state = { ...state, revision: state.revision + 1, scenes: state.scenes.map(scene => ({ ...scene, ...input.patch, outdated: true })) };
      if (input.action === "keepTakes") state = { ...state, revision: state.revision + 1, scenes: state.scenes.map(scene => ({ ...scene, takes: scene.takes.map(take => input.takeIds.includes(take.id) ? { ...take, savedForLater: true } : take) })) };
      if (input.action === "deleteTake") {
        deletions.push(input.takeId); await sleep(800);
        const pending = state.scenes[0].takes.find(take => take.id === input.takeId) ?? state.takeDeletions?.find(item => item.takeId === input.takeId)?.pending;
        state = { ...state, revision: state.revision + 1, scenes: state.scenes.map(scene => ({ ...scene, takes: scene.takes.filter(take => take.id !== input.takeId), selectedImageId: scene.selectedImageId === input.takeId ? undefined : scene.selectedImageId, selectedVideoId: scene.selectedVideoId === input.takeId ? undefined : scene.selectedVideoId })) };
        if (input.takeId === "bad" && failImageCleanup) {
          failImageCleanup = false;
          const error = "The take is hidden, but storage cleanup did not finish. Retry deletion to free its remaining storage.";
          state.takeDeletions = [{ takeId: "bad", sceneId: "s1", kind: "image", pending, error }];
          respond({ state, error }, 502); return;
        }
        state.takeDeletions = state.takeDeletions?.filter(item => item.takeId !== input.takeId);
      }
      respond({ state }); return;
    }
    res.setHeader("Content-Type", "text/html");res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1300 } });
    page.setDefaultTimeout(12000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await expect(page.getByText("Need to change something first?", { exact: true })).toBeVisible();
    assert.equal(await page.locator(".generate-change-options").getAttribute("open"), null);
    const imageStage = page.getByRole("region", { name: "1. Reference image" });
    const videoStage = page.getByRole("region", { name: "2. Video" });
    assert.ok((await imageStage.boundingBox()).y < (await videoStage.boundingBox()).y);
    const bad = page.locator(".scene-reference-option").filter({ has: page.locator('img[src="/bad.jpg"]') });
    const good = page.locator(".scene-reference-option").filter({ has: page.locator('img[src="/good.jpg"]') });
    await expect(bad).toBeHidden();
    await imageStage.getByText("Saved image takes (1)", { exact: true }).click();
    await bad.getByRole("button", { name: "Use this reference", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "beach" }).first()).toBeVisible();
    assert.equal(selectRequests, 0);
    await imageStage.getByText("Saved image takes (1)", { exact: true }).click();
    await expect(bad).toBeHidden();
    await videoStage.getByRole("button", { name: "Generate another video", exact: true }).click();
    await expect(videoStage.getByRole("alert").filter({ hasText: "scene image first" })).toBeVisible();
    assert.equal(submissions.length, 0, "Video cannot be queued before image approval");
    await good.getByRole("button", { name: "Use this reference", exact: true }).click();
    await expect(page.getByText("Saving your selection…", { exact: true })).toBeVisible({ timeout: 350 });
    await expect(good.getByRole("alert").filter({ hasText: "reference selection could not be saved" })).toBeVisible();
    assert.equal(await page.locator(".action-error-toast").count(), 0, "Reference errors are shown beside the clicked take, not duplicated at the page top");
    await good.getByRole("button", { name: "Use this reference", exact: true }).click();
    await expect(good.getByRole("button", { name: "Using this reference" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("combobox", { name: "Video length", exact: true }).click();
    await page.getByRole("option", { name: "20s", exact: true }).click();
    await expect(page.getByText("Video length saved.", { exact: true })).toBeVisible();
    await expect.poll(() => initialPollCompleted).toBe(true);
    await expect(good.getByRole("button", { name: "Using this reference" })).toHaveAttribute("aria-pressed", "true");
    await page.getByText("Add instructions for the image", { exact: true }).click();
    await page.getByLabel("Additional image instructions").fill("Keep the desk and window; do not show a beach.");
    const regenerate = page.getByRole("button", { name: "Regenerate image", exact: true });
    await regenerate.dispatchEvent("click"); await regenerate.dispatchEvent("click");
    await expect(page.getByRole("group", { name: "Keep or delete old image takes" })).toBeVisible();
    assert.equal(submissions.length, 0, "A replacement waits for the user's storage choice");
    const keepImages = page.getByRole("button", { name: "Keep old images & generate", exact: true });
    await keepImages.evaluate(button => { button.click(); button.click(); });
    await expect(page.getByText("Queueing the reference image…", { exact: true })).toBeVisible({ timeout: 350 });
    await expect(page.getByText(/Reference image queued\./)).toBeVisible();
    assert.equal(submissions.length, 1, "Rapid double clicks submit once");
    assert.equal(submissions[0].kind, "image");
    assert.match(submissions[0].instructions, /Keep the desk/);
    assert.equal(deletions.length, 0, "Keeping an old take must never delete its file");
    assert.equal(state.scenes[0].takes.find(take => take.id === "bad").savedForLater, true);
    await expect(bad).toBeHidden();
    await expect(good.getByRole("button", { name: "Using this reference" })).toHaveAttribute("aria-pressed", "true");
    await videoStage.getByRole("button", { name: "Generate another video", exact: true }).click();
    await expect(page.getByRole("group", { name: "Keep or delete old video takes" })).toBeVisible();
    await page.getByRole("button", { name: "Delete old videos & generate", exact: true }).click();
    await expect(page.getByText("Queueing the video…", { exact: true })).toBeVisible({ timeout: 350 });
    await expect(page.getByText(/Video queued using your selected/)).toBeVisible();
    assert.equal(submissions[1].kind, "video");
    for (const job of jobs) { job.status = "complete"; job.phase = "done"; }
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(regenerate).toBeEnabled();
    assert.deepEqual(deletions, ["bad-video"]);
    assert.ok(actions.indexOf("deleteTake:bad-video") < actions.indexOf("submit:video"), "Storage cleanup precedes a paid replacement");
    await imageStage.getByText("Saved image takes (1)", { exact: true }).click();
    await bad.getByRole("button", { name: "Delete image", exact: true }).click();
    await expect(page.getByRole("group", { name: "Delete image confirmation" })).toBeVisible();
    await page.getByRole("button", { name: "Keep this image", exact: true }).click();
    assert.deepEqual(deletions, ["bad-video"]);
    await bad.getByRole("button", { name: "Delete image", exact: true }).click();
    await page.getByRole("button", { name: "Delete permanently", exact: true }).click();
    await expect(page.getByText("Deleting the take and clearing storage…", { exact: true })).toBeVisible({ timeout: 350 });
    await expect(bad).toHaveCount(0);
    await expect(imageStage.getByText("Saved image takes (1)", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry deletion", exact: true })).toBeVisible();
    await regenerate.click();
    await expect(page.getByRole("alert").filter({ hasText: "Finish deleting the old take" }).first()).toBeVisible();
    assert.equal(submissions.length, 2, "An unfinished cleanup must not start another paid replacement");
    await page.getByRole("button", { name: "Retry deletion", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry deletion", exact: true })).toHaveCount(0);
    await expect(good.getByRole("button", { name: "Using this reference" })).toHaveAttribute("aria-pressed", "true");
    assert.deepEqual(deletions, ["bad-video", "bad", "bad"]);
    await expect(page.locator('a[href="/examples/ltx-durations"]')).toHaveCount(0);
    await expect(good.getByRole("button", { name: "Using this reference" })).toHaveCSS("background-color", "rgb(193, 241, 123)");
    fs.mkdirSync(".run-screenshots", { recursive: true });
    await page.screenshot({ path: ".run-screenshots/reference-first-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    fs.mkdirSync(".run-screenshots", { recursive: true });
    await page.screenshot({ path: ".run-screenshots/reference-first-mobile.png", fullPage: true });
    // A failed check can be explicitly accepted, without changing its result.
    jobs.length = 0; stalePoll = false; failSelection = true;
    state.scenes[0].takes = [{ ...take("skip", "mismatch"), url: "/bad.jpg" }];
    delete state.scenes[0].selectedImageId; delete state.scenes[0].selectedVideoId; state.revision++;
    await page.reload();
    const skipTake = page.locator(".scene-reference-option");
    await skipTake.getByRole("button", { name: "Skip check and use this image", exact: true }).click();
    const selectionError = skipTake.getByRole("alert").filter({ hasText: "reference selection could not be saved" });
    await expect(selectionError).toBeVisible(); await expect(selectionError).toBeInViewport();
    await expect(page.locator(".action-error-toast")).toHaveCount(0);
    await skipTake.getByRole("button", { name: "Skip check and use this image", exact: true }).click();
    await expect(skipTake.getByText("Image check skipped. You chose to use this image.", { exact: true })).toBeVisible();
    await expect(skipTake.getByRole("button", { name: "Using this reference", exact: true })).toHaveAttribute("aria-pressed", "true");
    assert.equal(state.scenes[0].takes[0].continuity.status, "failed");
    assert.ok(state.scenes[0].takes[0].reviewOverride);
    await page.reload();
    await expect(skipTake.getByRole("button", { name: "Using this reference", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Generate video", exact: true }).click();
    await expect(page.getByText(/Video queued using your selected/)).toBeVisible();
    assert.equal(submissions.at(-1).direct, false);
    // A character written without an uploaded reference needs no image stage.
    jobs.length = 0; stalePoll = false;
    state = { ...state, revision: state.revision + 1, characters: [{ id: "writer", name: "Writer", appearance: "Dark hair and a blue shirt", locked: false }],
      scenes: [{ id: "s1", title: "The study", description: "A writer closes a book at a desk.", characterIds: ["writer"], dialogues: [], takes: [] }] };
    await page.reload();
    await expect(page.getByRole("heading", { name: "1. Reference image", exact: true })).toHaveCount(0);
    await expect(page.getByText("Add a reference image (optional)", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate reference image", exact: true })).toBeHidden();
    failNextSubmission = true;
    const generateDirect = page.getByRole("button", { name: "Generate video", exact: true });
    await generateDirect.click();
    const videoError = page.getByRole("region", { name: "Video", exact: true }).getByRole("alert").filter({ hasText: "video could not be queued" });
    await expect(videoError).toBeVisible(); await expect(videoError).toBeInViewport();
    await generateDirect.click();
    await expect(page.getByText(/Video queued directly from your scene/)).toBeVisible();
    assert.equal(submissions.at(-1).direct, true);
    assert.equal(submissions.at(-1).kind, "video");
    // An old optional frame must not trap a writer in image-based generation.
    jobs.length = 0; stalePoll = false;
    state.scenes[0].takes = [{ ...take("old", "mismatch"), url: "/bad.jpg", sourceImageRequirements: "old scene" }];
    state.scenes[0].selectedImageId = "old"; state.revision++;
    await page.reload();
    await page.getByRole("checkbox", { name: "Use the selected opening image", exact: true }).uncheck();
    await generateDirect.click();
    await expect(page.getByText(/Video queued directly from your scene/)).toBeVisible();
    assert.equal(submissions.at(-1).direct, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: ".run-screenshots/direct-video-mobile.png", fullPage: true });
    // Page-level errors remain visible wherever the writer has scrolled.
    failQueue = true;
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); document.dispatchEvent(new Event("visibilitychange")); });
    const toast = page.locator(".action-error-toast");
    await expect(toast).toContainText("queue is temporarily unavailable");
    await expect(toast).toBeInViewport(); await expect(toast).toHaveCSS("position", "fixed");
    await toast.getByRole("button", { name: "Dismiss error", exact: true }).click();
    await expect(toast).toHaveCount(0); failQueue = false;
    assert.deepEqual(errors, []);
    console.log("PASS: persisted skip-check approval, nearby in-viewport selection/submit errors, direct generation without cast references, bypassing an optional old frame, keep/delete choices, cleanup retries, green selections, duration dropdown and mobile layout. No provider calls.");
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
