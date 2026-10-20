// Real shared controls and the actual hero. No application page or paid render.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 12000 });

(async () => {
  const bundle = await esbuild.build({ stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
    import React,{useState}from'react';import{createRoot}from'react-dom/client';
    import{Select}from'./components/ui/select';import{DecisionFlow}from'./components/film/decision-flow';
    import{HeroSection}from'./components/hero-section';import{PublicMotion}from'./components/public/cinematic-video';
    function Fixture(){const[value,setValue]=useState('5');const[selected,setSelected]=useState(false);return <>
      <main style={{padding:24,maxWidth:800,margin:'auto'}}><h1>Shared controls</h1>
      <label>Scene length<Select aria-label="Scene length" value={value} onChange={e=>setValue(e.target.value)}><option value="5">5s</option><option value="10">10s</option><option value="15" disabled>15s unavailable</option><option value="20">20s</option></Select></label>
      <output data-testid="chosen">{value}</output><button className="guest-pill" aria-pressed={selected} onClick={()=>setSelected(!selected)}>Use this video</button>
      <div className="guest-progress-overview"><ol className="guest-steps"><li aria-current="step"><button aria-current="step"><span className="guest-step-number">1</span><span>Home story step</span></button></li></ol></div>
      <ol className="story-progress-stages"><li className="story-progress-stage current"><button aria-current="step"><span className="story-stage-number">1</span><span>Project story step</span></button></li></ol>
      <button aria-pressed="true">Selected text control</button>
      <div style={{height:52,overflow:'hidden',marginTop:20}}><Select aria-label="Clipped options" value="a"><option value="a">First</option><option value="b">Second</option><option value="c">Third</option></Select></div>
      <DecisionFlow storageKey="controls-test" pages={[{id:'first',title:'First decision',content:'First'},{id:'second',title:'Second decision',content:'Second'}]}/>
      </main><PublicMotion><HeroSection/></PublicMotion>
      <aside style={{position:'fixed',bottom:8,right:8,width:160,zIndex:30}}><Select aria-label="Bottom options" value="a"><option value="a">First</option><option value="b">Second</option><option value="c">Third</option></Select></aside></>}
    createRoot(document.getElementById('root')).render(<Fixture/>);` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    banner: { js: "var process={env:{}};" }, define: { "process.env.NODE_ENV": '"production"' } });
  const compiled = await require("postcss")([require("tailwindcss")]).process(fs.readFileSync("app/globals.css", "utf8"), { from: path.resolve("app/globals.css") });
  const css = compiled.css + fs.readFileSync("app/public.css", "utf8") + '\n:root{--font-body:Arial}body{margin:0;font-family:Arial}';
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); return; }
    if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); return; }
    const files = { "/films/ltx-hero-20s.mp4": "video/mp4", "/posters/ltx-hero-20s.jpg": "image/jpeg" };
    if (files[req.url]) { res.setHeader("Content-Type", files[req.url]); res.end(fs.readFileSync(`public${req.url}`)); return; }
    res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    const errors = [], videos = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", req => { if (req.url().endsWith(".mp4")) videos.push(req.url()); });
    const url = `http://127.0.0.1:${server.address().port}`;
    await page.goto(url);
    const combo = page.getByRole("combobox", { name: "Scene length", exact: true });
    await combo.click();
    const selected = page.getByRole("option", { name: "5s", exact: true });
    await expect(selected).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(selected).toHaveCSS("border-top-color", "rgb(193, 241, 123)");
    await selected.hover(); await expect(selected).toHaveCSS("background-color", "rgb(193, 241, 123)");
    await page.mouse.move(3, 3);
    await expect(selected).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(combo).toHaveAttribute("aria-expanded", "true");
    const ten = page.getByRole("option", { name: "10s", exact: true });
    await ten.hover(); await expect(ten).toHaveCSS("background-color", "rgb(193, 241, 123)");
    await ten.click(); await expect(page.getByTestId("chosen")).toHaveText("10");
    await combo.focus(); await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter");
    await expect(page.getByTestId("chosen")).toHaveText("20");
    await combo.press("Enter"); await combo.press("Escape"); await expect(combo).toHaveAttribute("aria-expanded", "false");
    await combo.press("5"); await combo.press("Enter"); await expect(page.getByTestId("chosen")).toHaveText("5");
    await combo.click(); await page.mouse.move(3, 3); await expect(combo).toHaveAttribute("aria-expanded", "true");
    await page.setViewportSize({ width: 1280, height: 1050 }); await expect(combo).toHaveAttribute("aria-expanded", "true");
    await page.evaluate(() => window.scrollBy(0, 60));
    await expect(combo).toHaveAttribute("aria-expanded", "true");
    await expect.poll(async () => Math.abs((await page.getByRole("listbox", { name: "Scene length", exact: true }).boundingBox()).y - ((await combo.boundingBox()).y + (await combo.boundingBox()).height))).toBeLessThan(2);
    await page.mouse.click(3, 3); await expect(combo).toHaveAttribute("aria-expanded", "false");
    const clipped = page.getByRole("combobox", { name: "Clipped options", exact: true });
    await clipped.click(); const list = page.getByRole("listbox", { name: "Clipped options", exact: true });
    await expect(list).toBeVisible(); assert.equal(await list.evaluate(el => el.parentElement === document.body), true);
    await expect(page.getByRole("option", { name: "Third", exact: true })).toBeVisible(); await clipped.press("Escape");
    const bottom = page.getByRole("combobox", { name: "Bottom options", exact: true });
    await bottom.click(); const bottomList = page.getByRole("listbox", { name: "Bottom options", exact: true });
    assert.ok((await bottomList.boundingBox()).y < (await bottom.boundingBox()).y); await bottom.press("Escape");
    await page.getByRole("button", { name: "Use this video", exact: true }).click();
    await expect(page.getByRole("button", { name: "Use this video", exact: true })).toHaveCSS("background-color", "rgb(193, 241, 123)");
    for (const name of ["Home story step", "Project story step", "Selected text control"]) {
      const button = page.getByRole("button", { name, exact: false });
      await expect(button).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(button).toHaveCSS("box-shadow", "none");
    }
    const motion = page.locator(".public-motion-toggle").first();
    assert.notEqual(await motion.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(193, 241, 123)");
    await expect(motion).toHaveCSS("box-shadow", "none");
    await page.locator(".decision-jump-trigger").click();
    const firstDecision = page.getByRole("option", { name: "1. First decision", exact: true });
    await expect(firstDecision).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await firstDecision.hover(); await expect(firstDecision).toHaveCSS("background-color", "rgb(193, 241, 123)");
    await page.getByRole("option", { name: "2. Second decision", exact: true }).hover();
    await expect(page.getByRole("option", { name: "2. Second decision", exact: true })).toHaveCSS("background-color", "rgb(193, 241, 123)");
    await page.mouse.move(3, 3);
    await expect(page.locator(".decision-jump-trigger")).toHaveAttribute("aria-expanded", "true");
    await expect(firstDecision).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await page.mouse.click(3, 3);
    await expect(page.locator(".decision-jump-trigger")).toHaveAttribute("aria-expanded", "false");
    const hero = page.locator(".public-hero video");
    await expect(hero).toHaveAttribute("src", "/films/ltx-hero-20s.mp4");
    await expect.poll(() => hero.evaluate(el => el.readyState)).toBeGreaterThanOrEqual(1);
    assert.ok(Math.abs(await hero.evaluate(el => el.duration) - 20) < .2);
    await page.getByRole("button", { name: "Play video sound", exact: true }).click();
    await expect.poll(() => hero.evaluate(el => el.muted)).toBe(false);
    assert.ok(videos.every(value => value.endsWith("/films/ltx-hero-20s.mp4")));
    fs.mkdirSync(".run-screenshots", { recursive: true });
    await page.screenshot({ path: ".run-screenshots/hero-20s-and-controls.png", fullPage: true });
    const touch = await browser.newPage({ viewport: { width: 390, height: 900 }, hasTouch: true, isMobile: true });
    await touch.goto(url);
    await touch.getByRole("combobox", { name: "Scene length", exact: true }).tap();
    await touch.getByRole("option", { name: "10s", exact: true }).tap();
    await expect(touch.getByTestId("chosen")).toHaveText("10");
    await touch.getByRole("combobox", { name: "Scene length", exact: true }).tap();
    await touch.getByRole("heading", { name: "Shared controls", exact: true }).tap();
    await expect(touch.getByRole("combobox", { name: "Scene length", exact: true })).toHaveAttribute("aria-expanded", "false");
    assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await touch.close(); assert.deepEqual(errors, []);
    console.log("PASS: 20s hero playback and sound, no old hero requests, green boxed selections only, original motion/story-step styling, outlined dropdown selection, all options green on hover, keyboard/typeahead, disabled choices, pointer/scroll/resize persistence, outside-click dismissal, unclipped/above placement and touch selection/dismissal. No paid calls.");
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
