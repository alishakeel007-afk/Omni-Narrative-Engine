const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { chromium } = require("@playwright/test");
const { identityProfile } = require("../scripts/test-studio.cjs").loadTs(
  "lib/studio/identity.ts",
);

// Isolated browser harness: fake identity and API responses exist only here.
// The application's authentication middleware is never bypassed or changed.
(async () => {
  const artifactDir = path.resolve(".run-screenshots");
  fs.mkdirSync(artifactDir, { recursive: true });
  const bundle = await esbuild.build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import StudioScreen from './screens/StudioScreen'; createRoot(document.getElementById('root')).render(<StudioScreen/>);`,
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
        name: "test-identity",
        setup(build) {
          build.onResolve({ filter: /^next\/link$/ }, () => ({
            path: "link",
            namespace: "test",
          }));
          build.onResolve({ filter: /^@\/context\/AuthContext$/ }, () => ({
            path: "identity",
            namespace: "test",
          }));
          build.onResolve(
            { filter: /^@\/components\/protected-route$/ },
            () => ({ path: "protected", namespace: "test" }),
          );
          build.onLoad({ filter: /.*/, namespace: "test" }, (args) => ({
            resolveDir: process.cwd(),
            contents:
              args.path === "link"
                ? `import React from 'react'; export default function Link({href,children,...props}){return React.createElement('a',{...props,href},children)}`
                : args.path === "identity"
                  ? `export function useAuth(){return {currentUser:{id:'qa',name:'Director'},logout:async()=>{}}}`
                  : `export function ProtectedRoute({children}){return children}`,
            loader: "js",
          }));
        },
      },
    ],
  });
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].text);
    } else if (req.url === "/studio.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(fs.readFileSync("app/studio/studio.css"));
    } else {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/studio.css"><style>body{margin:0}button{border:0;background:none}*{box-sizing:border-box}h1,h2,h3,p{margin:0}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
      );
    }
  });
  await new Promise((resolve) => server.listen(3107, "127.0.0.1", resolve));
  const executablePath =
    process.env.STUDIO_CHROME_PATH ||
    (process.platform === "win32"
      ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
      : undefined);
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1512, height: 982 },
    });
    const errors = [];
    page.on("pageerror", (error) => {
      errors.push(error.message);
      console.log("Browser error:", error.message);
    });
    const state = {
      version: 1,
      revision: 0,
      title: "Untitled film",
      premise: "",
      world: "",
      characters: [],
      scenes: [],
      messages: [],
      timeline: [],
      edits: {},
    };
    let sampleVideo;
    const sampleImage = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB1sAAAAASUVORK5CYII=",
      "base64",
    );
    const sampleAudio = Buffer.alloc(44 + 16000 * 2);
    sampleAudio.write("RIFF", 0);
    sampleAudio.writeUInt32LE(sampleAudio.length - 8, 4);
    sampleAudio.write("WAVEfmt ", 8);
    sampleAudio.writeUInt32LE(16, 16);
    sampleAudio.writeUInt16LE(1, 20);
    sampleAudio.writeUInt16LE(1, 22);
    sampleAudio.writeUInt32LE(16000, 24);
    sampleAudio.writeUInt32LE(32000, 28);
    sampleAudio.writeUInt16LE(2, 32);
    sampleAudio.writeUInt16LE(16, 34);
    sampleAudio.write("data", 36);
    sampleAudio.writeUInt32LE(sampleAudio.length - 44, 40);
    for (let i = 0; i < 16000; i++)
      sampleAudio.writeInt16LE(
        Math.round(Math.sin((i * Math.PI * 2 * 440) / 16000) * 3000),
        44 + i * 2,
      );
    const plan = {
      title: "The Rain Harvester",
      premise: "An engineer brings rain back to a forgotten city.",
      world: "Rain-soaked city. Cinematic realism.",
      characters: [
        {
          name: "Elara",
          appearance: "Dark curls, blue work coat, brass goggles.",
        },
      ],
      scenes: [
        {
          title: "The rooftop",
          description: "Elara studies her rain harvester on the rooftop.",
          characters: ["Elara"],
          dialogues: [{ character: "Elara", text: "Almost there." }],
        },
      ],
    };
    await page.route("**/api/studio**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const body =
        request.method() === "POST" &&
        request.postData() &&
        request.headers()["content-type"]?.includes("application/json")
          ? request.postDataJSON()
          : null;
      if (url.pathname.endsWith("/media")) {
        if (url.searchParams.has("messageId")) {
          await route.fulfill({
            status: 200,
            contentType: "image/png",
            body: sampleImage,
          });
          return;
        }
        const audio = ["voice", "music"].includes(url.searchParams.get("kind"));
        await route.fulfill({
          status: 200,
          contentType: audio ? "audio/wav" : "video/webm",
          body: audio ? sampleAudio : sampleVideo,
        });
        return;
      }
      let data;
      if (url.pathname.endsWith("/jobs")) {
        if (request.method() === "POST") {
          const take = {
            id: "queued-image",
            jobId: "qa-job",
            providerId: "qa-image",
            kind: "image",
            status: "complete",
            url: "https://videos.magichour.ai/qa.png",
            prompt: "Queued scene request",
            createdAt: new Date().toISOString(),
            identity: [identityProfile(state.characters[0])],
            continuity: { status: "passed", method: "visual-review" },
          };
          state.scenes[0].takes.push(take);
          await route.fulfill({
            json: {
              job: {
                id: "qa-job",
                sceneId: state.scenes[0].id,
                threadId: "qa-thread",
                kind: "image",
                status: "complete",
                phase: "done",
                text: body.text,
                result: { take },
                createdAt: new Date().toISOString(),
              },
            },
          });
        } else await route.fulfill({ json: { state, jobs: [], threads: [] } });
        return;
      }
      if (url.pathname.endsWith("/reference") && request.method() === "POST") {
        assert.ok(
          request.postDataBuffer().includes(sampleImage),
          "The actual generated pixels must be sent for character analysis",
        );
        state.characters[0].referenceId = "generated-reference";
        state.characters[0].locked = false;
        await route.fulfill({ json: { state } });
        return;
      }
      if (url.pathname.endsWith("/export")) {
        state.exports = [
          {
            id: "export-1",
            name: "The Rain Harvester.webm",
            url: "https://example.com/film.webm",
            createdAt: new Date().toISOString(),
          },
        ];
        await route.fulfill({ json: { state } });
        return;
      }
      if (url.pathname === "/api/studio")
        data =
          request.method() === "POST"
            ? { id: "test-project", state }
            : {
                projects: state.messages.length
                  ? [
                      {
                        id: "test-project",
                        title: state.title,
                        updatedAt: new Date().toISOString(),
                      },
                    ]
                  : [],
              };
      else if (body?.action === "chat") {
        if (/generate.*(?:photo|image)/i.test(body.text)) {
          const id = `chat-image-${state.messages.length}`;
          state.messages.push(
            { id: `${id}-user`, role: "user", text: body.text, tab: body.tab },
            {
              id,
              role: "assistant",
              text: "Your requested image.",
              tab: body.tab,
              imageRequest: {
                prompt: "Elara, dark curls and brass goggles.",
                referenceIds: [],
              },
              imageError: "Image generation could not start. Please try again.",
            },
          );
          await route.fulfill({ json: { state } });
          return;
        }
        if (/Develop the rooftop inventor/i.test(body.text)) {
          state.messages.push(
            { id: "choice-user", role: "user", text: body.text, tab: body.tab },
            {
              id: "choice-assistant",
              role: "assistant",
              text: "Let's give Elara a distinctive look.",
              tab: body.tab,
              choices: [
                {
                  label: "Brass goggles and blue coat",
                  description: "Dark curls and practical work clothes.",
                  message:
                    "Generate a photo of Elara with dark curls, brass goggles and a blue coat.",
                },
              ],
            },
          );
          await route.fulfill({ json: { state } });
          return;
        }
        if (body.tab === "assemble") {
          state.messages.push(
            { id: "edit-u", role: "user", text: body.text, tab: "assemble" },
            {
              id: "edit-a",
              role: "assistant",
              text: "I suggest lowering the rooftop music to 8%.",
              tab: "assemble",
              editProposal: [
                { sceneId: "scene1", changes: { musicVolume: 0.08 } },
              ],
            },
          );
          await route.fulfill({ json: { state } });
          return;
        }
        state.mode = body.mode || state.mode;
        state.messages.push(
          { id: "u1", role: "user", text: body.text, tab: body.tab },
          {
            id: "a1",
            role: "assistant",
            text: "Here is a story direction. Review it before approving.",
            tab: body.tab,
            plan,
            choices: [
              {
                label: "A rooftop inventor",
                description: "An engineer restores rain to her city.",
                message:
                  "Develop the rooftop inventor who restores rain to her city.",
              },
            ],
          },
        );
        data = { state };
      } else if (body?.action === "generateChatImage") {
        const message = state.messages.find(
          (item) => item.id === body.messageId,
        );
        delete message.imageError;
        message.image = {
          id: `take-${message.id}`,
          providerId: "test-image",
          kind: "image",
          status: "queued",
          prompt: message.imageRequest.prompt,
        };
        data = { state };
      } else if (body?.action === "poll") {
        for (const message of state.messages)
          if (message.image) {
            message.image.status = "complete";
            message.image.url = "https://videos.magichour.ai/test.png";
          }
        data = { state };
      } else if (body?.action === "approve") {
        Object.assign(state, {
          title: plan.title,
          premise: plan.premise,
          world: plan.world,
          characters: [{ id: "elara", ...plan.characters[0], locked: false }],
          scenes: [
            {
              id: "scene1",
              ...plan.scenes[0],
              characterIds: ["elara"],
              takes: [],
            },
          ],
        });
        state.messages.find((item) => item.id === "a1").approved = true;
        data = { state };
      } else if (body?.action === "character") {
        Object.assign(state.characters[0], {
          name: body.name,
          appearance: body.appearance,
          locked: body.locked,
        });
        data = { state };
      } else if (body?.action === "reviewTake") {
        const take = state.scenes
          .find((scene) => scene.id === body.sceneId)
          .takes.find((take) => take.id === body.takeId);
        take.continuity = {
          status: "passed",
          method: "visual-review",
          checks: [
            {
              characterId: "elara",
              verdict: "match",
              notes: "Reference appearance preserved.",
            },
          ],
        };
        data = { state };
      } else if (body?.action === "select") {
        state.scenes.find(
          (scene) => scene.id === body.sceneId,
        ).selectedVideoId = body.takeId;
        data = { state };
      } else if (body?.action === "timeline") {
        state.timeline = body.sceneIds;
        data = { state };
      } else if (body?.action === "edit") {
        state.undoEdits = structuredClone(state.edits);
        state.edits[body.sceneId] = body.edit;
        data = { state };
      } else if (body?.action === "applyEdits") {
        state.undoEdits = structuredClone(state.edits);
        state.edits.scene1.musicVolume = 0.08;
        state.messages.find((item) => item.id === body.messageId).approved =
          true;
        data = { state };
      } else if (body?.action === "undoEdits") {
        state.edits = state.undoEdits;
        delete state.undoEdits;
        data = { state };
      } else data = { state };
      await route.fulfill({ json: data });
    });
    await page.goto("http://127.0.0.1:3107/studio");
    await page.getByRole("button", { name: "Help me find an idea" }).waitFor();
    await page.screenshot({
      path: path.join(artifactDir, "studio-welcome.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Expand projects" }).click();
    await page.getByRole("button", { name: "Collapse projects" }).waitFor();
    await page.getByRole("button", { name: "Collapse projects" }).click();
    await page.getByRole("button", { name: "Collapse project board" }).click();
    await page.getByRole("button", { name: "Expand project board" }).click();
    await page.getByRole("button", { name: "Develop my idea" }).click();
    await page.getByRole("button", { name: "Use this plan" }).waitFor();
    assert.equal(state.mode, "develop");
    await page.getByRole("button", { name: /A rooftop inventor/ }).click();
    await page
      .getByRole("button", { name: /Brass goggles and blue coat/ })
      .waitFor();
    assert.equal(
      state.messages.at(-2).text,
      "Develop the rooftop inventor who restores rain to her city.",
    );
    await page
      .getByRole("button", { name: /Brass goggles and blue coat/ })
      .click();
    await page.getByRole("button", { name: "Retry image generation" }).click();
    await page.getByRole("button", { name: "Refresh image status" }).click();
    await page.getByRole("link", { name: "Download image" }).waitFor();
    assert.equal(
      await page
        .locator(".studio-chat-image img")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
      true,
    );
    await page.screenshot({
      path: path.join(artifactDir, "studio-interactive-plan.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Use this plan" }).click();
    await page.getByRole("button", { name: "Approved", exact: true }).waitFor();
    await page
      .getByText("Use as a character reference", { exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Generated character name" })
      .fill("Elara");
    await page
      .getByRole("button", { name: "Save reference", exact: true })
      .click();
    await page.getByRole("button", { name: "Lock appearance" }).waitFor();
    assert.equal(state.characters[0].referenceId, "generated-reference");
    await page.getByRole("button", { name: "Lock appearance" }).click();
    await page.getByRole("button", { name: "Save locked profile" }).waitFor();
    await page.getByRole("tab", { name: "Scenes", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Message your director" })
      .fill("Generate an image of a moonlit forest.");
    await page.getByRole("button", { name: "Send message" }).click();
    await page.getByRole("button", { name: "Retry image generation" }).click();
    await page.getByRole("button", { name: "Refresh image status" }).click();
    await page.getByRole("link", { name: "Download image" }).waitFor();
    await page
      .getByRole("button", {
        name: "Generate reference scene image",
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: /Scenes.*planned/ }).click();
    await page.screenshot({
      path: path.join(artifactDir, "studio-scenes.png"),
      fullPage: true,
    });
    await page.getByRole("tab", { name: "Assemble", exact: true }).click();
    await page.getByText("Bring your story together.").waitFor();
    // Create synthetic footage and a tone locally; no provider calls or credits.
    sampleVideo = Buffer.from(
      await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 360;
        const stream = canvas.captureStream(24);
        const recording = new MediaRecorder(stream, {
          mimeType: "video/webm;codecs=vp8",
        });
        const chunks = [];
        recording.ondataavailable = (event) => chunks.push(event.data);
        const done = new Promise((resolve) => {
          recording.onstop = async () =>
            resolve(
              Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
            );
        });
        const context = canvas.getContext("2d");
        context.fillStyle = "#087f83";
        context.fillRect(0, 0, 640, 360);
        let frame = 0;
        const timer = setInterval(() => {
          context.fillStyle = "#087f83";
          context.fillRect(0, 0, 640, 360);
          context.fillStyle = "#fff";
          context.font = "32px Arial";
          context.fillText("Synthetic QA scene " + frame++, 60, 180);
        }, 40);
        recording.start();
        await new Promise((resolve) => setTimeout(resolve, 2600));
        recording.stop();
        clearInterval(timer);
        stream.getTracks().forEach((track) => track.stop());
        return done;
      }),
    );
    fs.writeFileSync(
      path.join(artifactDir, "synthetic-clip.webm"),
      sampleVideo,
    );
    state.scenes[0].takes = [
      {
        id: "take1",
        providerId: "provider1",
        kind: "video",
        status: "complete",
        url: "https://videos.magichour.ai/test.mp4",
        prompt: "QA scene",
        identity: [identityProfile(state.characters[0])],
        continuity: { status: "pending", method: "visual-review" },
      },
    ];
    state.scenes[0].dialogues[0].audioUrl = "https://example.com/voice.wav";
    state.scenes[0].musicUrl = "https://example.com/music.wav";
    state.scenes.push({
      ...structuredClone(state.scenes[0]),
      id: "scene2",
      title: "The discovery",
      selectedVideoId: "take2",
      takes: [
        {
          ...state.scenes[0].takes[0],
          id: "take2",
          continuity: { status: "passed", method: "visual-review" },
        },
      ],
    });
    await page.getByRole("button", { name: "Reload project" }).click();
    await page.getByRole("tab", { name: "Scenes", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Add to film", exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByRole("button", { name: "Check appearance now", exact: true })
      .click();
    await page.getByText("Appearance check passed", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Add to film", exact: true })
      .click();
    await page.getByRole("button", { name: "In your film" }).waitFor();
    await page.getByRole("tab", { name: "Assemble", exact: true }).click();
    await page.getByRole("button", { name: "Preview full film" }).waitFor();
    await page.getByLabel("Trim end (0 = full clip)").fill("1.5");
    await page.getByRole("button", { name: "Save clip edits" }).click();
    await page.getByText("Add another selected scene", { exact: true }).click();
    await page
      .getByRole("button", { name: "The discovery", exact: true })
      .click();
    await page
      .getByRole("button", { name: "2. The discovery", exact: true })
      .click();
    await page.getByLabel("Trim end (0 = full clip)").fill("1.5");
    await page.getByRole("button", { name: "Save clip edits" }).click();
    await page
      .getByRole("button", { name: "Move clip earlier" })
      .nth(1)
      .click();
    assert.deepEqual(state.timeline, ["scene2", "scene1"]);
    await page
      .getByRole("button", { name: "Export film", exact: true })
      .click();
    try {
      await page
        .getByRole("link", { name: "Download edited film (.webm)" })
        .waitFor({ timeout: 45000 });
    } catch (error) {
      console.log(
        "Export diagnostic:",
        await page.evaluate(() => ({
          text: document.body.innerText.slice(-3000),
          media: [...document.querySelectorAll("video,audio")].map(
            (element) => ({
              tag: element.tagName,
              current: element.currentTime,
              duration: element.duration,
              ready: element.readyState,
              paused: element.paused,
              error: element.error?.message,
            }),
          ),
        })),
      );
      await page.screenshot({
        path: path.join(artifactDir, "studio-export-failure.png"),
      });
      throw error;
    }
    await page.screenshot({
      path: path.join(artifactDir, "studio-assemble.png"),
      fullPage: true,
    });
    const exportedSize = await page
      .getByRole("link", { name: "Download edited film (.webm)" })
      .evaluate(
        async (element) => (await (await fetch(element.href)).blob()).size,
      );
    assert.ok(exportedSize > 1000, "Export should contain real encoded media");
    const audioCheck = await page
      .getByRole("link", { name: "Download edited film (.webm)" })
      .evaluate(async (element) => {
        const context = new AudioContext();
        try {
          const audio = await context.decodeAudioData(
            await (await fetch(element.href)).arrayBuffer(),
          );
          let peak = 0;
          for (const value of audio.getChannelData(0))
            peak = Math.max(peak, Math.abs(value));
          return { duration: audio.duration, peak };
        } finally {
          await context.close();
        }
      });
    assert.ok(
      audioCheck.peak > 0.01,
      "Export must contain audible mixed audio, not silence",
    );
    assert.ok(
      audioCheck.duration > 2.4 && audioCheck.duration < 5,
      `Export must include both trimmed scenes (decoded ${audioCheck.duration}s; edits ${JSON.stringify(state.edits)})`,
    );
    await page
      .getByRole("button", { name: "Save export to project", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Export saved", exact: true })
      .waitFor();
    await page.getByText("Saved exports (1)", { exact: true }).click();
    await page
      .getByRole("link", { name: "The Rain Harvester.webm", exact: true })
      .waitFor();
    await page
      .getByRole("textbox", { name: "Message your director" })
      .fill("Lower the music in the rooftop scene.");
    await page.getByRole("button", { name: "Send message" }).click();
    await page
      .getByRole("button", { name: "Apply edits", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Edits applied", exact: true })
      .waitFor();
    assert.equal(state.edits.scene1.musicVolume, 0.08);
    await page
      .getByRole("button", { name: "Undo last edit", exact: true })
      .click();
    assert.equal(state.edits.scene1.musicVolume, 0.2);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Plan", exact: true }).click();
    await page.screenshot({
      path: path.join(artifactDir, "studio-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: welcome, both sidebars, develop intent, clickable idea/appearance choices, Plan and Scenes images, retry/preview/download, saving portrait reference, approval, character lock, scene selection, timeline, trimming, actual encoded audio/video export, mobile rendering, and no runtime errors.",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
