const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { chromium, expect } = require("@playwright/test");

// Run against a local Next.js development server. This suite never submits a
// valid account form, creates an account, sends email, or calls generation APIs.
(async () => {
  const base = process.env.PUBLIC_PREVIEW_URL || "http://127.0.0.1:3000";
  const artifacts = path.resolve(".run-screenshots");
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.STUDIO_CHROME_PATH ||
      (process.platform === "win32"
        ? "C:/Program Files/Google/Chrome/Application/chrome.exe"
        : undefined),
  });
  const errors = [];
  let checks = 0;
  const visit = async (page, route) => {
    const response = await page.goto(base + route, {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    assert.equal(response.status(), 200, route);
    await expect(page.locator(".public-header")).toBeVisible({
      timeout: 60000,
    });
    await page.evaluate(() => document.fonts.ready);
    // Server-rendered controls can appear before their React handlers attach.
    await page.waitForFunction(() => {
      const control =
        document.querySelector("form") ||
        document.querySelector(".public-menu-toggle");
      return (
        control &&
        Object.keys(control).some(
          (key) =>
            key.startsWith("__reactProps$") &&
            typeof control[key][
              control.tagName === "FORM" ? "onSubmit" : "onClick"
            ] === "function",
        )
      );
    });
    assert.equal(
      await page.locator("h1").count(),
      1,
      `${route}: one clear page heading`,
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `${route}: no horizontal overflow`,
    );
    checks += 3;
  };
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await visit(page, "/");
    assert.equal(await page.locator("html").evaluate(el => getComputedStyle(el, "::-webkit-scrollbar").width), "5px", "Page scrollbar stays minimal");
    assert.equal(await page.locator(".public-inline-studio .studio-scroll").evaluate(el => getComputedStyle(el, "::-webkit-scrollbar").width), "5px", "Chat uses the shared minimal scrollbar");
    await expect(
      page.getByText("YOUR CREATIVE DIRECTOR PARTNER", { exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".public-hero-copy .public-button"),
    ).toHaveAttribute("href", "#how-it-works");
    const heroVideo = page.locator(".public-hero video");
    await expect(heroVideo).toHaveAttribute("src", /emerald-world-web\.mp4$/, {
      timeout: 30000,
    });
    await expect
      .poll(() => heroVideo.evaluate((v) => v.readyState), { timeout: 30000 })
      .toBeGreaterThanOrEqual(2);
    await expect.poll(() => heroVideo.evaluate((v) => v.paused)).toBe(false);
    await page.screenshot({
      path: path.join(artifacts, "public-home-desktop.png"),
    });
    await page
      .locator(".public-hero")
      .getByRole("button", { name: "Pause background videos" })
      .click();
    await expect.poll(() => heroVideo.evaluate((v) => v.paused)).toBe(true);
    assert.equal(
      await page.evaluate(() => localStorage.getItem("omni-public-motion")),
      "paused",
    );
    checks += 5;

    const stepsBox = await page.locator(".public-step-list").boundingBox();
    const chatBox = await page.locator(".public-inline-studio").boundingBox();
    assert.ok(stepsBox.x + stepsBox.width < chatBox.x, "Desktop steps sit beside the live chat");
    await page.locator(".public-step").nth(1).click();
    const scenes = page.getByRole("tab", { name: "Scenes", exact: true });
    await expect(scenes).toHaveAttribute("aria-selected", "true");
    await scenes.click();
    await expect(scenes).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Shape the opening");
    await scenes.press("End");
    await expect(page.locator(".public-step").nth(2)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("tabpanel")).toContainText("Your story, in sequence.");
    await expect(page.getByRole("textbox", { name: "Message your director" })).toHaveCount(0);
    await scenes.press("Home");
    await expect(page.getByRole("tabpanel")).toContainText("Help me find an idea");
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal(await page.locator(".public-chat-launcher").count(), 0);
    await page.locator("#how-it-works").scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator(".public-header").evaluate(el => Math.round(el.getBoundingClientRect().top))).toBe(0);
    await expect(page.locator(".public-hero .public-button")).toHaveCSS("background-color", "rgb(193, 241, 123)");
    await page.locator(".public-faq-list summary").first().click();
    await expect(
      page.locator(".public-faq-list details").first(),
    ).toHaveAttribute("open", "");
    for (const section of [
      "#possibilities",
      ".public-final-cta",
      "#how-it-works",
    ]) {
      await page.locator(section).scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
    }
    await page.screenshot({
      path: path.join(artifacts, "public-home-full.png"),
      fullPage: true,
    });
    checks += 5;

    await visit(page, "/auth?next=%2Fstudio");
    await page.getByRole("button", { name: "Return to my story" }).click();
    await expect(page.locator(".public-auth-error")).toContainText(
      "valid email",
    );
    await page.locator("input[name=email]").fill("reader@example.com");
    await page.locator("input[name=password]").fill("Example-password-42");
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    await expect(page.locator("input[name=password]")).toHaveAttribute(
      "type",
      "text",
    );
    await expect(page.locator("input[name=password]")).toHaveValue(
      "Example-password-42",
    );
    await page
      .getByRole("button", { name: "Hide password", exact: true })
      .click();
    await page.screenshot({
      path: path.join(artifacts, "public-login.png"),
      fullPage: true,
    });
    checks += 3;

    await visit(page, "/signup?next=%2Fstudio");
    await page.getByRole("button", { name: "Create my studio" }).click();
    await expect(page.locator(".public-auth-error")).toContainText("full name");
    await page.locator("input[name=name]").fill("Story Builder");
    await page.locator("input[name=email]").fill("reader@example.com");
    await page.locator("input[autocomplete=new-password]").first().fill("weak");
    await page.getByRole("button", { name: "Create my studio" }).click();
    await expect(page.locator(".public-auth-error")).toContainText("strength");
    await page
      .getByRole("button", { name: "Show password", exact: true })
      .click();
    await expect(
      page.locator("input[autocomplete=new-password]").first(),
    ).toHaveValue("weak");
    await page.screenshot({
      path: path.join(artifacts, "public-signup.png"),
      fullPage: true,
    });
    checks += 3;
    for (const route of [
      "/forgot-password",
      "/reset-password",
      "/verify-email",
    ])
      await visit(page, route);

    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    mobile.on("pageerror", (e) => errors.push(e.message));
    const videoRequests = [];
    mobile.on("request", (request) => {
      if (/\.mp4(?:\?|$)/.test(request.url()))
        videoRequests.push(request.url());
    });
    await visit(mobile, "/");
    await expect(
      mobile.locator(".public-hero .public-cinema-poster"),
    ).toBeVisible();
    await mobile.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      mobile.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeVisible();
    await mobile.keyboard.press("Escape");
    await expect(
      mobile.getByRole("button", { name: "Open navigation" }),
    ).toHaveAttribute("aria-expanded", "false");
    assert.equal(
      await mobile.locator("video[src]").count(),
      0,
      "Reduced motion must not load video",
    );
    assert.deepEqual(
      videoRequests,
      [],
      "Reduced motion must not request video files",
    );
    await mobile.screenshot({
      path: path.join(artifacts, "public-home-mobile.png"),
      fullPage: true,
    });
    checks += 4;
    // Keep real model services out of browser QA while exercising real routes/UI.
    const trialState = {
      version: 1,
      revision: 0,
      title: "Trial story",
      premise: "",
      world: "",
      characters: [],
      scenes: [],
      messages: [],
      timeline: [],
      edits: {},
    };
    await mobile.route("**/api/studio/guest", async (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        const turn = trialState.messages.length / 2 + 1;
        trialState.messages.push(
          {
            id: `user-${turn}`,
            role: "user",
            text: body.text,
            tab: body.tab,
            createdAt: new Date().toISOString(),
          },
          {
            id: `reply-${turn}`,
            role: "assistant",
            text: `Trial reply ${turn}`,
            tab: body.tab,
            createdAt: new Date().toISOString(),
          },
        );
      }
      await route.fulfill({
        json: {
          id: "12345678-1234-4234-8234-123456789012",
          state: trialState,
          remaining: 3 - trialState.messages.length / 2,
          limit: 3,
        },
      });
    });
    const mobileIdea = mobile.getByRole("textbox", { name: "Message your director" });
    await mobileIdea.fill("A tiny robot plants a forest.");
    await mobileIdea.press("Shift+Enter");
    await expect(mobileIdea).toHaveValue("A tiny robot plants a forest.\n");
    await mobileIdea.press("Enter");
    assert.equal(new URL(mobile.url()).pathname, "/");
    await expect(
      mobile.getByText("Trial reply 1", { exact: true }),
    ).toBeVisible();
    await expect(
      mobile.getByText("2 of 3 messages left", { exact: true }),
    ).toBeVisible();
    for (const [tab, message] of [
      ["Scenes", "Show the opening scene."],
      ["Plan", "Suggest a gentle soundtrack."],
    ]) {
      await mobile.getByRole("tab", { name: tab, exact: true }).click();
      await mobile
        .getByRole("textbox", { name: "Message your director" })
        .fill(message);
      await mobile
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      if (tab === "Scenes")
        await expect(
          mobile.getByText("Trial reply 2", { exact: true }),
        ).toBeVisible();
    }
    await mobile.waitForURL(/\/signup\?next=/);
    const entryPath = new URL(mobile.url()).searchParams.get("next");
    assert.match(entryPath, /^\/studio\?start=[a-f\d-]+$/);
    await expect(
      mobile.getByRole("complementary", { name: "Your saved story idea" }),
    ).toContainText("Suggest a gentle soundtrack.");
    await expect(
      mobile.getByText("Trial reply 3", { exact: true }),
    ).toBeVisible();
    assert.ok(!mobile.url().includes("robot"));
    checks += 4;
    await visit(
      mobile,
      new URL(mobile.url()).pathname + new URL(mobile.url()).search,
    );
    await mobile.screenshot({
      path: path.join(artifacts, "public-signup-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, [], "No browser runtime errors");
    console.log(
      `Public pages: ${checks} layout, navigation, motion, playback, and form checks passed.`,
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
