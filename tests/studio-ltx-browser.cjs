const fs = require("node:fs");
const http = require("node:http");
const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { execFileSync } = require("node:child_process");
const { chromium } = require("@playwright/test");
(async () => {
  const ffmpeg = execFileSync(
    ".venv-modal/Scripts/python.exe",
    ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"],
    { encoding: "utf8" },
  ).trim();
  execFileSync(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=0x171717:s=640x360:r=24:d=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000:duration=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    ".run-screenshots/ltx-synthetic.mp4",
  ]);
  let media = fs.readFileSync(".run-screenshots/ltx-synthetic.mp4"),
    polls = 0,
    finish = false;
  let state = {
    version: 1,
    revision: 0,
    title: "Native audio film",
    premise: "",
    world: "",
    characters: [],
    messages: [],
    timeline: ["s"],
    edits: {},
    scenes: [
      {
        id: "s",
        title: "Opening",
        description: "A scene",
        characterIds: [],
        dialogues: [
          {
            character: "Old",
            text: "Legacy track",
            audioUrl: "https://unused.example/voice",
          },
        ],
        takes: [
          {
            id: "take",
            providerId: "provider",
            provider: "modal-ltx",
            kind: "video",
            nativeAudio: true,
            status: "complete",
            url: "https://demo.supabase.co/native.mp4",
            createdAt: new Date().toISOString(),
            prompt: "Cinematic scene",
          },
        ],
        selectedVideoId: "take",
      },
    ],
  };
  const bundle = await esbuild.build({
    stdin: {
      contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {FilmAssembly} from './components/studio/film-assembly';function Harness(){const [state,setState]=useState(window.initialState);return <FilmAssembly state={state} projectId="project" disabled={false} mp4Export onRenderState={setState} onExporting={()=>{}} onError={message=>{document.querySelector('#error').textContent=message}} onSaveExport={async()=>true} onAction={async body=>{const response=await fetch('/edit',{method:'POST',body:JSON.stringify(body)});const next=await response.json();setState(next);return next}}/>}createRoot(document.querySelector('#root')).render(<Harness/>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const server = http.createServer(async (req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(bundle.outputFiles[0].text);
    }
    if (req.url === "/style.css") {
      res.setHeader("Content-Type", "text/css");
      return res.end(fs.readFileSync("app/studio/studio.css"));
    }
    if (req.url === "/fonts/Manrope.ttf") {
      res.setHeader("Content-Type", "font/ttf");
      return res.end(fs.readFileSync("public/fonts/Manrope.ttf"));
    }
    if (req.url === "/edit") {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      const body = JSON.parse(raw);
      state.edits[body.sceneId] = body.edit;
      state.revision++;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify(state));
    }
    if (req.url.startsWith("/api/studio/project/render")) {
      if (req.method === "POST") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const { requestId } = JSON.parse(raw);
        assert.equal(state.edits.s.videoVolume, 1);
        assert.equal(state.edits.s.texts[0].text, "Our story starts here.");
        state.renderJobs = [
          {
            id: "render",
            requestId,
            providerId: "worker-render",
            status: "queued",
          },
        ];
        state.revision++;
      } else {
        polls++;
        if (finish) {
          state.renderJobs[0].status = "complete";
          state.exports = [
            {
              id: "render",
              name: "Native audio film.mp4",
              url: "https://demo.supabase.co/film.mp4",
              createdAt: new Date().toISOString(),
            },
          ];
          state.revision++;
        }
      }
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ state, job: state.renderJobs[0] }));
    }
    if (req.url.startsWith("/api/studio/project/media")) {
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Accept-Ranges", "bytes");
      if (req.headers.range) {
        const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range);
        const start = Number(match[1]),
          end = match[2] ? Number(match[2]) : media.length - 1;
        res.statusCode = 206;
        res.setHeader("Content-Range", `bytes ${start}-${end}/${media.length}`);
        res.setHeader("Content-Length", end - start + 1);
        return res.end(media.subarray(start, end + 1));
      }
      res.setHeader("Content-Length", media.length);
      return res.end(media);
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<html><head><link rel="stylesheet" href="/style.css"><style>body{margin:20px}button{cursor:pointer}*{box-sizing:border-box}</style></head><body><p id="error"></p><main id="root"></main><script>window.initialState=${JSON.stringify(state).replace(/</g, "\\u003c")}</script><script src="/bundle.js"></script></body></html>`,
    );
  });
  await new Promise((resolve) => server.listen(3123, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    executablePath:
      process.platform === "win32"
        ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
        : undefined,
    headless: true,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:3123");
    await page.waitForFunction(
      () => document.querySelector("video")?.readyState >= 2,
    );
    assert.equal(
      await page.locator("audio").count(),
      0,
      "Native playback excludes legacy tracks",
    );
    assert.match(
      await page.locator(".studio-mix").first().innerText(),
      /Clip audio.*100%/s,
    );
    await page.getByText("Text on this clip", { exact: true }).click();
    await page.getByRole("button", { name: "Add text", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Caption text", exact: true })
      .fill("Our story starts here.");
    await page
      .getByLabel("Hide at (0 = clip end)", { exact: true })
      .fill("0.6");
    await page.getByLabel("Audio fade in (sec)", { exact: true }).fill("0.1");
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".studio-text-preview");
      return (
        canvas &&
        canvas
          .getContext("2d")
          .getImageData(0, 0, 1024, 576)
          .data.some((value, at) => at % 4 === 3 && value > 0)
      );
    });
    await page.evaluate(() => {
      document.querySelector("video").currentTime = 1;
    });
    await page.waitForFunction(
      () =>
        !document
          .querySelector(".studio-text-preview")
          .getContext("2d")
          .getImageData(0, 0, 1024, 576)
          .data.some((value, at) => at % 4 === 3 && value > 0),
    );
    await page.evaluate(() => {
      document.querySelector("video").currentTime = 0;
    });
    await page
      .getByRole("button", { name: "Preview full film", exact: true })
      .click();
    await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
    await page.getByRole("button", { name: "Stop", exact: true }).click();
    await page.screenshot({
      path: ".run-screenshots/ltx-assemble-editor.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Export MP4", exact: true }).click();
    await page.waitForFunction(() =>
      document.body.innerText.includes("Preparing your MP4"),
    );
    while (!polls) await new Promise((resolve) => setTimeout(resolve, 100));
    finish = true;
    await page.reload();
    await page
      .getByRole("link", { name: "Download edited film (.mp4)", exact: true })
      .waitFor();
    assert.equal(state.exports.length, 1);
    assert.equal(state.edits.s.videoVolume, 1);
    assert.equal(state.edits.s.fadeIn, 0.1);
    assert.equal(await page.locator("#error").innerText(), "");
    assert.deepEqual(errors, []);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    console.log(
      "PASS: native audio defaults and playback, no duplicate voice tracks, timed caption preview, fades, MP4 submission, refresh recovery, saved export and mobile width.",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
