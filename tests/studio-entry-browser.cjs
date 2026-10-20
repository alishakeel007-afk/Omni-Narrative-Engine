const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const esbuild = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const { loadTs } = require("../scripts/test-studio.cjs");
const { randomUUID } = require("node:crypto");
const { EMPTY_STUDIO } = loadTs("types/studio.ts");

// Exercise real page components and AuthProvider with a local fake Supabase
// client and fake studio backend. No accounts, emails, or AI calls are made.
(async () => {
  const artifacts = path.resolve(".run-screenshots");
  fs.mkdirSync(artifacts, { recursive: true });
  const bundle = await esbuild.build({
    stdin: {
      contents: `import React,{StrictMode} from 'react'; import {createRoot} from 'react-dom/client'; import {AuthProvider} from './context/AuthContext'; import Home from './screens/HomeScreen'; import Login from './screens/AuthScreen'; import Signup from './screens/SignupScreen'; import Studio from './screens/StudioScreen'; import Trial from './screens/GuestStudioScreen'; const Page=({'/auth':Login,'/signup':Signup,'/studio':Studio,'/try':Trial})[location.pathname]||Home; createRoot(document.getElementById('root')).render(<StrictMode><AuthProvider><Page/></AuthProvider></StrictMode>);`,
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    jsx: "automatic",
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [
      {
        name: "local-entry-fixtures",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^(next\/link|next\/navigation|@\/lib\/supabase\/client)$/,
            },
            (args) => ({ path: args.path, namespace: "fixture" }),
          );
          build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
            loader: "js",
            resolveDir: process.cwd(),
            contents:
              args.path === "next/link"
                ? `import React from 'react'; export default function Link({href,children,prefetch,...props}){return React.createElement('a',{...props,href},children)}`
                : args.path === "next/navigation"
                  ? `const router={push:path=>location.assign(path),replace:path=>location.replace(path)}; export const useRouter=()=>router; export const usePathname=()=>location.pathname; export const useSearchParams=()=>new URLSearchParams(location.search);`
                  : `const user={id:'qa-director',email:'director@example.com',user_metadata:{full_name:'Director'}}; const listeners=new Set(); const current=()=>localStorage.getItem('qa-user')?user:null; const client={auth:{getUser:async()=>({data:{user:current()}}),onAuthStateChange:fn=>{listeners.add(fn);return{data:{subscription:{unsubscribe:()=>listeners.delete(fn)}}}},signInWithPassword:async()=>{localStorage.setItem('qa-user','yes');listeners.forEach(fn=>fn('SIGNED_IN',{user}));return{data:{user}}},signUp:async input=>{localStorage.setItem('qa-email-redirect',input.options.emailRedirectTo);return{data:{user,session:null}}},signOut:async()=>{localStorage.removeItem('qa-user');listeners.forEach(fn=>fn('SIGNED_OUT',null));return{}},resetPasswordForEmail:async()=>({}),updateUser:async()=>({})}};export const createClient=()=>client;`,
          }));
        },
      },
    ],
  });
  let projects = new Map(),
    creates = 0,
    chats = 0,
    fail = false,
    lostReply = false,
    slowGuest = false;
  let guestId = null;
  const reset = () => {
    projects = new Map();
    creates = chats = 0;
    fail = lostReply = false;
    slowGuest = false;
    guestId = null;
  };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const json = (value, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (url.pathname.startsWith("/api/studio")) {
      if (url.pathname === "/api/studio/guest/claim") {
        let input = "";
        for await (const chunk of req) input += chunk;
        const requested = JSON.parse(input).id;
        const id = requested || guestId;
        if (!id || !projects.has(id)) return json({ id: null });
        guestId = null;
        return json({ id, state: projects.get(id) });
      }
      if (url.pathname === "/api/studio/guest") {
        if (req.method === "POST") {
          let input = "";
          for await (const chunk of req) input += chunk;
          const body = JSON.parse(input);
          if (slowGuest) await new Promise((resolve) => setTimeout(resolve, 1200));
          if (!guestId) {
            guestId = randomUUID();
            creates++;
            projects.set(guestId, structuredClone(EMPTY_STUDIO));
          }
          const state = projects.get(guestId);
          if (state.messages.filter((m) => m.role === "user").length >= 3)
            return json({ error: "Sign in to continue." }, 403);
          if (!state.messages.some((m) => m.requestId === body.requestId)) {
            chats++;
            state.messages.push(
              {
                id: `user-${chats}`,
                requestId: body.requestId,
                role: "user",
                text: body.text,
                tab: body.tab,
                createdAt: new Date().toISOString(),
              },
              {
                id: `reply-${chats}`,
                role: "assistant",
                text: chats === 3 ? "Your final plan director replied." : `Your ${body.tab} director replied.`,
                choices: [{ label: "Make it a mystery", message: "Develop this as a mystery." }],
                tab: body.tab,
                createdAt: new Date().toISOString(),
              },
            );
          }
        }
        const state = projects.get(guestId) || structuredClone(EMPTY_STUDIO);
        return json({
          id: guestId,
          state,
          remaining: 3 - state.messages.filter((m) => m.role === "user").length,
          limit: 3,
        });
      }
      if (url.pathname === "/api/studio") {
        if (req.method === "POST") {
          const id = `project-${++creates}`;
          const state = structuredClone(EMPTY_STUDIO);
          projects.set(id, state);
          return json({ id, state });
        }
        return json({
          projects: [...projects].map(([id]) => ({
            id,
            title: "New story",
            updatedAt: new Date().toISOString(),
          })),
        });
      }
      const state = projects.get(url.pathname.split("/")[3]);
      if (!state) return json({ error: "Missing project" }, 404);
      if (req.method === "POST") {
        let input = "";
        for await (const chunk of req) input += chunk;
        const body = JSON.parse(input);
        if (body.action === "chat") {
          chats++;
          if (fail) {
            fail = false;
            return json(
              { error: "Director temporarily unavailable. Try again." },
              503,
            );
          }
          state.mode = body.mode || state.mode;
          state.messages.push(
            {
              id: `user-${chats}`,
              role: "user",
              text: body.text,
              tab: body.tab || "plan",
              createdAt: new Date().toISOString(),
            },
            {
              id: `reply-${chats}`,
              role: "assistant",
              text: "Let’s bring your idea to life.",
              tab: body.tab || "plan",
              createdAt: new Date().toISOString(),
            },
          );
          if (lostReply) {
            lostReply = false;
            return json({ error: "Connection interrupted." }, 503);
          }
        }
      }
      return json({ state });
    }
    if (url.pathname === "/bundle.js") {
      res.setHeader("Content-Type", "text/javascript");
      return res.end(bundle.outputFiles[0].text);
    }
    if (url.pathname.endsWith(".css")) {
      res.setHeader("Content-Type", "text/css");
      return res.end(
        fs.readFileSync(
          url.pathname === "/public.css"
            ? "app/public.css"
            : "app/studio/studio.css",
        ),
      );
    }
    if (url.pathname.startsWith("/films/")) {
      const file = path.resolve("public", "." + url.pathname);
      if (
        !file.startsWith(path.resolve("public") + path.sep) ||
        !fs.existsSync(file)
      ) {
        res.writeHead(404);
        return res.end();
      }
      res.setHeader(
        "Content-Type",
        file.endsWith(".jpg") ? "image/jpeg" : "video/mp4",
      );
      return res.end(fs.readFileSync(file));
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public.css"><link rel="stylesheet" href="/studio.css"><style>:root{--font-body:Arial;--brand-accent:#c1f17b;--brand-accent-rgb:193 241 123;--brand-ink:#161616;--brand-muted:#6b6b6b;--brand-line:#e6e6e6;--brand-surface:#f7f7f7}body{margin:0}button,input,textarea{font:inherit}button{border:0}*{box-sizing:border-box}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise((resolve) => server.listen(3108, "127.0.0.1", resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.STUDIO_CHROME_PATH ||
      (process.platform === "win32"
        ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
        : undefined),
  });
  const base = "http://127.0.0.1:3108";
  const errors = [];
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    context.on("page", (page) =>
      page.on("pageerror", (error) => errors.push(error.message)),
    );
    const page = await context.newPage();
    const submit = async (text, signedIn = false, keyboard = false) => {
      await page.goto(base);
      await page.evaluate((signed) => {
        localStorage.clear();
        if (signed) localStorage.setItem("qa-user", "yes");
      }, signedIn);
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Help me find an idea", exact: true }),
      ).toBeEnabled();
      const input = page.getByRole("textbox", { name: "Message your director" });
      await input.fill("   ");
      await expect(
        page.getByRole("button", { name: "Send message" }),
      ).toBeDisabled();
      await input.fill(text);
      await input.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(artifacts, "public-interactive-chat.png"),
        fullPage: false,
      });
      const sent = page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("/api/studio/"));
      if (keyboard) await input.press("Enter");
      else
        await page
          .getByRole("button", { name: "Send message" })
          .click();
      await sent;
      await expect(page.locator(".trial-thinking")).toBeHidden();
      assert.equal(new URL(page.url()).pathname, "/", "Homepage messages stay inline");
    };
    const prompt = "A rain collector discovers a city hidden inside a cloud.";
    await submit(prompt);
    await expect(
      page.getByText("Your plan director replied.", { exact: true }),
    ).toBeVisible();
    assert.equal(chats, 1, "First message must reply before authentication");
    await page.locator(".public-step").nth(1).click();
    await expect(page.getByRole("tab", { name: "Scenes", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Your plan director replied.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Bring a scene to life.", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Plan", exact: true }).click();
    await expect(page.getByText("Your plan director replied.", { exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, "/", "Step changes keep the conversation on the homepage");
    await expect(
      page.getByText("2 of 3 messages left", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Scenes", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Message your director" })
      .fill("Make the opening scene mysterious.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText("Your scenes director replied.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Plan", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Message your director" })
      .fill("Suggest music and pacing.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await page.waitForURL(/\/signup\?/);
    await expect(
      page.getByRole("complementary", { name: "Your saved story idea" }),
    ).toContainText("Suggest music and pacing.");
    await expect(
      page.getByText("Your final plan director replied.", { exact: true }),
    ).toBeVisible();
    const next = new URL(page.url()).searchParams.get("next");
    assert.match(next, /^\/studio\?start=[a-f\d-]+$/);
    assert.ok(
      !page.url().includes("rain"),
      "Prompt must not be included in the URL",
    );
    await page.locator(".public-auth-switch a").click();
    await page.waitForURL(/\/auth\?/);
    assert.equal(
      new URL(page.url()).searchParams.get("next"),
      next,
      "Switching to login preserves the message",
    );
    await page.locator("input[name=email]").fill("director@example.com");
    await page.locator("input[name=password]").fill("Example-password-42");
    await page.getByRole("button", { name: "Return to my story" }).click();
    await expect(
      page.getByText("Your final plan director replied.", { exact: true }),
    ).toBeVisible();
    assert.equal(creates, 1);
    assert.equal(
      chats,
      3,
      "Claiming the trial must not send any messages again",
    );
    assert.equal([...projects.values()][0].messages.length, 6);
    assert.equal([...projects.values()][0].messages[0].text, prompt);
    assert.equal(
      await page.evaluate(
        () =>
          Object.keys(localStorage).filter((k) =>
            k.startsWith("omni-studio-entry:"),
          ).length,
      ),
      0,
    );
    await page.reload();
    await expect(
      page.getByText("Your plan director replied.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Plan", exact: true }).click();
    await expect(
      page.getByText("Your final plan director replied.", { exact: true }),
    ).toBeVisible();
    assert.equal(chats, 3, "Refreshing a finished handoff must not send again");

    reset();
    await submit("A fox astronaut searches for a lost moon.", true, true);
    await expect(
      page.getByText("Let’s bring your idea to life.", { exact: true }),
    ).toBeVisible();
    assert.equal(chats, 1);
    assert.equal(creates, 1);
    assert.equal([...projects.values()][0].mode, "develop");

    reset();
    await submit("A lighthouse stores memories in its beam.");
    await expect(
      page.getByText("Your plan director replied.", { exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Keep creating", exact: true })
      .click();
    await page.waitForURL(/\/signup\?/);
    await page.locator("input[name=name]").fill("Director");
    await page.locator("input[name=email]").fill("director@example.com");
    await page
      .locator("input[autocomplete=new-password]")
      .nth(0)
      .fill("Example-password-42");
    await page
      .locator("input[autocomplete=new-password]")
      .nth(1)
      .fill("Example-password-42");
    await page.getByRole("button", { name: "Create my studio" }).click();
    await expect(page.getByRole("status")).toContainText("Check your inbox");
    const emailTarget = await page.evaluate(() =>
      localStorage.getItem("qa-email-redirect"),
    );
    assert.match(
      emailTarget,
      /\/studio\?start=/,
      "Real AuthProvider must preserve the entry in the confirmation URL",
    );
    assert.equal(chats, 1);
    await page.evaluate(() => localStorage.setItem("qa-user", "yes"));
    const confirmationTab = await context.newPage();
    await confirmationTab.goto(emailTarget);
    await expect(
      confirmationTab.getByText("Your plan director replied.", {
        exact: true,
      }),
    ).toBeVisible();
    assert.equal(
      chats,
      1,
      "Email confirmation in a new tab retains the saved prompt",
    );
    await confirmationTab.close();

    reset();
    fail = true;
    await submit("A gardener grows stars in a glass greenhouse.", true);
    await expect(
      page.getByText("Director temporarily unavailable. Try again.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Message your director" }),
    ).toHaveValue("A gardener grows stars in a glass greenhouse.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByText("Let’s bring your idea to life.", { exact: true }),
    ).toBeVisible();
    assert.equal(chats, 2);
    assert.equal(creates, 1, "Retry must use the same project");

    reset();
    lostReply = true;
    await submit("A clockmaker repairs the seasons.", true);
    await expect(
      page.getByText("Connection interrupted.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText("Let’s bring your idea to life.", { exact: true }),
    ).toBeVisible();
    assert.equal(
      chats,
      1,
      "A saved response must be recovered without resending",
    );

    reset();
    await page.evaluate(() => localStorage.removeItem("qa-user"));
    await page.goto(base);
    await expect(
      page.getByRole("button", { name: "Help me find an idea", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Help me find an idea", exact: true }).click();
    await expect(
      page.getByText("Your plan director replied.", { exact: true }),
    ).toBeVisible();
    assert.match(
      [...projects.values()][0].messages[0].text,
      /find a story/,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("tab", { name: "Scenes", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Message your director" })
      .fill("A draft that survives switching tabs");
    await page.getByRole("tab", { name: "Assemble", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Message your director" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Assemble editor preview" })).toBeVisible();
    await page.getByRole("tab", { name: "Plan", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Message your director" })).toHaveValue("");
    await page.getByRole("tab", { name: "Scenes", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Message your director" })).toHaveValue("A draft that survives switching tabs");
    assert.equal(new URL(page.url()).pathname, "/");

    await page.screenshot({
      path: path.join(artifacts, "guest-studio-mobile.png"),
    });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert.deepEqual(errors, []);
    reset();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base);
    const inline = page.locator(".public-inline-studio");
    await expect(page.getByRole("button", { name: "Help me find an idea", exact: true })).toBeEnabled();
    await inline.scrollIntoViewIfNeeded();
    const composer = page.getByRole("textbox", { name: "Message your director" });
    await composer.focus();
    await expect(composer).toBeFocused();
    await composer.blur();
    await expect(page.locator(".public-caret-field")).toHaveAttribute("data-idle", "true");
    await expect(page.locator(".public-header")).toHaveCSS("position", "sticky");
    await expect(page.locator(".public-header .public-button")).toHaveCSS("background-color", "rgb(193, 241, 123)");
    assert.equal(await page.locator(".public-chat-launcher, .lucide-sparkles, .lucide-wand-sparkles").count(), 0);
    slowGuest = true;
    await composer.fill("A story that takes a moment.");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByLabel("Sending message")).toContainText("A story that takes a moment.");
    await expect(composer).toHaveValue("");
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
    assert.equal(new URL(page.url()).pathname, "/");
    await expect(page.getByText("Your plan director replied.", { exact: true })).toBeVisible();
    slowGuest = false;
    await page.getByRole("button", { name: "Make it a mystery", exact: true }).click();
    await expect(page.locator(".studio-message.user")).toHaveCount(2);
    await expect(page.locator(".trial-thinking")).toBeHidden();
    assert.equal(new URL(page.url()).pathname, "/", "Reply choices remain in the homepage conversation");
    assert.equal(chats, 2);
    await expect.poll(() => page.locator(".public-inline-studio .studio-scroll").evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop))).toBeLessThan(2);
    await page.screenshot({ path: path.join(artifacts, "home-inline-conversation.png") });
    await page.getByRole("tab", { name: "Assemble", exact: true }).click();
    await expect(page.getByRole("region", { name: "Assemble editor preview" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Message your director" })).toHaveCount(0);
    await page.getByRole("button", { name: /02 A hidden path/ }).click();
    await expect(page.getByLabel("Preview A hidden path")).toHaveAttribute("poster", "/posters/forest-light-frame.jpg");
    assert.equal(chats, 2, "Previewing assembly never submits a chat or generation request");
    assert.equal(new URL(page.url()).pathname, "/");
    await page.screenshot({ path: path.join(artifacts, "home-assemble-preview.png") });
    await page.getByRole("tab", { name: "Plan", exact: true }).click();
    await expect(page.locator(".studio-message.user")).toHaveCount(2);
    reset();
    guestId = randomUUID();
    const legacyPrompt = "Help me develop a story about the last lighthouse in a forgotten city above the clouds.";
    const oldExample = structuredClone(EMPTY_STUDIO);
    oldExample.messages = [
      { id: "old-user", role: "user", text: legacyPrompt, tab: "plan", createdAt: new Date().toISOString() },
      { id: "old-reply", role: "assistant", text: "An earlier example reply.", tab: "plan", createdAt: new Date().toISOString() },
    ];
    projects.set(guestId, oldExample);
    await page.goto(base);
    await expect(page.getByRole("button", { name: "Help me find an idea", exact: true })).toBeEnabled();
    await expect(page.getByRole("textbox", { name: "Message your director" })).toHaveValue("");
    await expect(page.locator(".studio-message.user")).toHaveCount(0);
    assert.equal(chats, 0, "Loading an old example never submits a prompt");
    await expect(page.getByText("2 of 3 messages left", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Resume previous conversation" }).click();
    await expect(page.getByText(legacyPrompt, { exact: true })).toBeVisible();
    assert.equal(chats, 0, "Resuming only reveals saved messages");
    await page.reload();
    await expect(page.getByRole("button", { name: "Help me find an idea", exact: true })).toBeEnabled();
    await expect(page.getByText(legacyPrompt, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Help me find an idea", exact: true }).click();
    await expect(page.getByText("Your plan director replied.", { exact: true })).toBeVisible();
    await expect(page.locator(".studio-message.user")).toHaveCount(1);
    assert.equal(chats, 1, "A new prompt is sent only after a user chooses it");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: inline guest and signed-in chat, optimistic message bubbles, clickable replies, persistent caret, sticky navigation, shared accent, third-message signup handoff, full conversation transfer, keyboard send, new-tab confirmation, Strict Mode, reload recovery, retry, mobile tabs, and no browser errors.",
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
