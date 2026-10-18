const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const esbuild = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const { loadTs } = require("../scripts/test-studio.cjs");
(async () => {
  const artifacts = path.resolve(".run-screenshots");
  fs.mkdirSync(artifacts, { recursive: true });
  const bundle = await esbuild.build({
    stdin: {
      contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Studio from './screens/StudioScreen';createRoot(document.getElementById('root')).render(<Studio/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "local-identity",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^(next\/link|@\/context\/AuthContext|@\/components\/protected-route)$/,
            },
            (args) => ({ path: args.path, namespace: "fixture" }),
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            resolveDir: process.cwd(),
            loader: "js",
            contents:
              args.path === "next/link"
                ? `import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{...props,href},children)}`
                : args.path.includes("AuthContext")
                  ? `export const useAuth=()=>({currentUser:{id:'qa',name:'Director'},logout:async()=>{}});`
                  : `export function ProtectedRoute({children}){return children}`,
          }));
        },
      },
    ],
  });
  const { EMPTY_STUDIO } = loadTs("types/studio.ts");
  const state = structuredClone(EMPTY_STUDIO);
  state.title = "Two worlds";
  state.scenes = [1, 2].map((n) => ({
    id: `scene-${n}`,
    title: `Scene ${n}`,
    description: `A quiet landscape in scene ${n}`,
    characterIds: [],
    dialogues: [],
    takes: [],
  }));
  const jobs = [],
    threads = [],
    submissions = [];
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=",
    "base64",
  );
  let video;
  const complete = (job) => {
    const take = {
      id: randomUUID(),
      jobId: job.id,
      threadId: job.threadId,
      providerId: "qa-provider",
      kind: job.kind,
      status: "complete",
      url: "https://storage.example/qa",
      stored: true,
      prompt: job.text,
      createdAt: new Date().toISOString(),
    };
    state.scenes.find((scene) => scene.id === job.sceneId).takes.push(take);
    job.status = "complete";
    job.phase = "done";
    job.result = { take, reply: "Your take is ready for review." };
    state.revision++;
    return take;
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    const json = (value) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    };
    if (url.pathname === "/api/studio/test-project/jobs") {
      if (req.method === "GET") return json({ jobs, threads, state });
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      if (body.action === "submit") {
        submissions.push(body);
        const target = /scene\s*2/i.test(body.text)
          ? "scene-2"
          : body.sceneId || "scene-1";
        const threadId = body.threadId || randomUUID();
        if (!threads.some((thread) => thread.id === threadId))
          threads.push({
            id: threadId,
            sceneId: target,
            title: `${target} revision`,
            parentTakeId: body.parentTakeId,
          });
        const parent =
          body.parentTakeId &&
          state.scenes
            .flatMap((scene) => scene.takes)
            .find((take) => take.id === body.parentTakeId);
        const job = {
          id: randomUUID(),
          sceneId: target,
          threadId,
          text: body.text,
          kind:
            body.kind ||
            parent?.kind ||
            (/image/i.test(body.text) ? "image" : "video"),
          status: "running",
          phase: "poll",
          createdAt: new Date().toISOString(),
          cancelRequested: false,
        };
        jobs.push(job);
        return json({ job });
      }
      const job = jobs.find((job) => job.id === body.jobId);
      if (job) job.status = body.action === "cancel" ? "cancelled" : "queued";
      return json({ ok: true });
    }
    if (url.pathname.endsWith("/media")) {
      const job = jobs.find((job) => job.id === url.searchParams.get("jobId"));
      res.setHeader(
        "Content-Type",
        job?.kind === "video" ? "video/webm" : "image/png",
      );
      return res.end(job?.kind === "video" ? video : image);
    }
    if (url.pathname === "/api/studio")
      return json({
        projects: [
          {
            id: "test-project",
            title: state.title,
            updatedAt: new Date().toISOString(),
          },
        ],
      });
    if (url.pathname === "/api/studio/test-project") {
      if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const scene = state.scenes.find((scene) => scene.id === body.sceneId);
        if (body.action === "select") {
          const take = scene.takes.find((take) => take.id === body.takeId);
          scene[take.kind === "image" ? "selectedImageId" : "selectedVideoId"] =
            take.id;
        }
        if (body.action === "timeline") state.timeline = body.sceneIds;
        state.revision++;
      }
      return json({ state });
    }
    if (url.pathname === "/bundle.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(bundle.outputFiles[0].text);
    }
    if (url.pathname === "/studio.css") {
      res.setHeader("Content-Type", "text/css");
      return res.end(fs.readFileSync("app/studio/studio.css"));
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/studio.css"><style>:root{--font-body:Arial}body{margin:0}button{border:0;background:none}*{box-sizing:border-box}h1,h2,h3,p{margin:0}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(3110, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.STUDIO_CHROME_PATH ||
      (process.platform === "win32"
        ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
        : undefined),
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:3110/studio?project=test-project");
    await page
      .getByRole("button", { name: "Reload project", exact: true })
      .waitFor();
    await page.getByRole("tab", { name: "Scenes", exact: true }).click();
    const input = page.getByRole("textbox", { name: "Message your director" });
    await input.fill("Generate an image for Scene 1");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText("Generate an image for Scene 1", { exact: true }),
    ).toBeVisible();
    await expect(input).toHaveValue("");
    await input.fill("Generate Scene 2");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.getByText("2 pending", { exact: true })).toBeVisible();
    assert.equal(submissions.length, 2);
    assert.ok(jobs.every((job) => job.status === "running"));
    const original = complete(jobs[0]);
    await page
      .getByRole("button", { name: "Refine this take", exact: true })
      .waitFor({ timeout: 10000 });
    await page
      .getByRole("button", { name: "Refine this take", exact: true })
      .click();
    await expect(page.locator(".scene-composer-target")).toContainText(
      "Based on the selected take",
    );
    await input.fill("Keep the composition and make the lighting warmer.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page
        .locator(".scene-job > header")
        .getByText("Keep the composition and make the lighting warmer.", {
          exact: true,
        }),
    ).toBeVisible();
    assert.equal(submissions[2].parentTakeId, original.id);
    assert.equal(submissions[2].parentJobId, jobs[0].id);
    assert.notEqual(jobs[2].threadId, jobs[0].threadId);
    await page.screenshot({
      path: path.join(artifacts, "parallel-scene-thread.png"),
    });
    await page
      .locator(".scene-queue")
      .getByRole("button", { name: "Back to all scenes", exact: true })
      .click();
    await expect(
      page.getByText("Generate Scene 2", { exact: true }),
    ).toBeVisible();
    assert.equal(jobs[1].status, "running");
    const revised = complete(jobs[2]);
    assert.equal(state.scenes[0].takes[0].id, original.id);
    assert.deepEqual(state.timeline, []);
    video = Buffer.from(
      await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 90;
        canvas.getContext("2d").fillRect(0, 0, 160, 90);
        const stream = canvas.captureStream(10);
        const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
        const chunks = [];
        const done = new Promise((resolve) => {
          recorder.onstop = async () =>
            resolve(
              Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
            );
        });
        recorder.ondataavailable = (event) => chunks.push(event.data);
        recorder.start();
        await new Promise((resolve) => setTimeout(resolve, 250));
        recorder.stop();
        stream.getTracks().forEach((track) => track.stop());
        return done;
      }),
    );
    complete(jobs[1]);
    await page
      .getByRole("button", { name: "Add to film", exact: true })
      .waitFor({ timeout: 10000 });
    await page
      .getByRole("button", { name: "Add to film", exact: true })
      .click();
    await page
      .getByRole("button", { name: "In your film", exact: true })
      .waitFor();
    assert.deepEqual(state.timeline, ["scene-2"]);
    const branch = page
      .getByRole("article", { name: "Scene 1 image job" })
      .filter({
        hasText: "Keep the composition and make the lighting warmer.",
      });
    await branch
      .getByRole("button", { name: "Use this image", exact: true })
      .click();
    await expect(
      branch.getByRole("button", { name: "Image selected", exact: true }),
    ).toBeVisible();
    assert.equal(state.scenes[0].selectedImageId, revised.id);
    await page.reload();
    await page
      .getByRole("button", { name: "Reload project", exact: true })
      .waitFor();
    await page.getByRole("tab", { name: "Scenes", exact: true }).click();
    await expect(
      page
        .locator(".scene-job > header")
        .getByText("Keep the composition and make the lighting warmer.", {
          exact: true,
        }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Collapse project board", exact: true })
      .click();
    await page.screenshot({
      path: path.join(artifacts, "parallel-scenes-mobile.png"),
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: two running scene cards with a responsive composer, exact take revision thread, independent ongoing scene, original retention, explicit image/video selection, saved threads after reload, mobile layout, and no browser errors.",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
