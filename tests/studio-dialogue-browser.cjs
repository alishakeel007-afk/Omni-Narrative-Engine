// Real editor components with delayed local saves. No auth, model or paid render.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const esbuild = require("esbuild");
const { chromium, expect: baseExpect } = require("@playwright/test");
const { loadTs } = require("../scripts/test-studio.cjs");
const expect = baseExpect.configure({ timeout: 10000 });

(async () => {
  process.env.STUDIO_CLIP_SECONDS = "5,10,15,20";
  const { EMPTY_STUDIO } = loadTs("types/studio.ts");
  const { clipCapability } = loadTs("lib/film/duration.ts");
  const initial = { ...structuredClone(EMPTY_STUDIO), title: "Timing guidance", clipSeconds: 5, directionMode: "director",
    characters: [{ id: "a", name: "Ayesha", appearance: "Black hair", locked: false }, { id: "b", name: "Bilal", appearance: "Brown hair", locked: false }],
    scenes: [{ id: "s", title: "The doorway", description: "Ayesha opens a door.", visualAction: "Ayesha opens a door.", characterIds: ["a", "b"], takes: [],
      dialogues: [{ id: "d1", character: "Ayesha", text: "I came back for the recording." }, { id: "d2", character: "Bilal", text: "Come inside." }] }] };
  const source = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import{ScriptStep}from'./components/film/script-step';import{SetupStep}from'./components/film/setup-step';import{GenerateStep}from'./components/film/generate-step';
    const cap=${JSON.stringify(clipCapability())};window.saves=0;window.posts=0;
    function Fixture(){const[state,setState]=useState(${JSON.stringify(initial)});const[view,setView]=useState('script');
      const ok=async()=>true;const handlers={onCharacter:ok,onReference:ok,onUpload:async()=>null,onVoice:ok,onAction:ok};
      const patch=async(id,p)=>{setState(s=>({...s,scenes:s.scenes.map(scene=>scene.id===id?{...scene,...p}:scene)}));return true};
      const dialogue=async(id,op)=>{window.saves++;await new Promise(r=>setTimeout(r,900));setState(s=>({...s,scenes:s.scenes.map(scene=>scene.id!==id?scene:{...scene,dialogues:op.kind==='add'?[...scene.dialogues,{id:'new',character:op.character,text:op.text}]:scene.dialogues.map(line=>line.id===op.dialogueId?{...line,text:op.text??line.text}:line)})}));return true};
      return <><nav><button onClick={()=>setView('setup')}>Show setup</button><button onClick={()=>setView('script')}>Show script</button><button onClick={()=>setView('generate')}>Show generate</button></nav>
        {view==='script'?<ScriptStep projectId="timing" state={state} capability={cap} {...handlers} onScenePatch={patch} onDialogue={dialogue} onBeats={ok} onContinue={()=>{}} onAutoDirect={ok} onDirect={ok} directing={false}/>:view==='setup'?<SetupStep projectId="timing" state={state} capability={cap} busy={false} onSave={async p=>{setState(s=>({...s,...p}));return true}} onGenerateScript={ok} onContinue={()=>{}} characters={handlers}/>:<GenerateStep projectId="timing" state={state} capability={cap} onState={setState} onAssemble={ok} onSelect={ok} onReview={ok} onScenePatch={patch} onGoToStep={()=>setView('script')} onLockAll={ok}/>}</>}
    createRoot(document.getElementById('root')).render(<Fixture/>);`;
  const bundle = await esbuild.build({ stdin: { contents: source, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", banner: { js: "var process={env:{}};" }, define: { "process.env.NODE_ENV": '"production"' } });
  const compiled = await require("postcss")([require("tailwindcss")]).process(fs.readFileSync("app/globals.css", "utf8"), { from: path.resolve("app/globals.css") });
  const css = compiled.css + fs.readFileSync("app/public.css", "utf8") + '\n:root{--font-body:Arial}body{margin:20px;font-family:Arial}nav{display:flex;gap:16px;margin-bottom:20px}';
  const server = http.createServer(async (req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); return; }
    if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); return; }
    if (req.url.startsWith("/api/")) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ jobs: [] })); return; }
    res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    const errors = []; page.on("pageerror", error => { errors.push(error.message); console.error("Browser error:", error.message); });
    let posts = 0; page.on("request", req => { if (req.method() === "POST") posts++; });
    await page.addInitScript(() => localStorage.setItem("story:timing:script", "s:dialogue"));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const summary = page.locator("#scene-speech-s");
    const first = page.getByRole("textbox", { name: "Ayesha’s dialogue", exact: true });
    await expect(summary).toContainText("5s scene: aim for about 10 spoken words total");
    await expect(summary).toContainText("8 words");
    await first.fill("One two three four five six seven eight nine ten.");
    await expect(summary).toContainText("12 words", { timeout: 500 });
    await expect(summary).toContainText("choose 10s or longer");
    await expect(first).toHaveAttribute("aria-invalid", "true");
    assert.equal(await page.evaluate(() => window.saves), 0, "Live guidance needs no save or request");
    await first.fill("");
    await expect(summary).toContainText("2 words");
    await expect(first).not.toHaveAttribute("aria-invalid", "true");
    await first.fill("One two three four five six seven eight.");
    await first.blur();
    await first.fill(Array(16).fill("word").join(" "));
    await expect.poll(() => page.evaluate(() => window.saves)).toBe(1);
    await page.waitForTimeout(1100);
    await expect(first).toHaveValue(Array(16).fill("word").join(" "));
    await expect(summary).toContainText("18 words", { timeout: 500 });
    await page.getByRole("combobox", { name: "This scene's length", exact: true }).click();
    await page.getByRole("option", { name: "10s", exact: true }).click();
    await expect(summary).toContainText("10s scene: aim for about 20 spoken words total");
    await expect(summary).not.toContainText("blocked");
    await page.getByRole("button", { name: "Add a line", exact: true }).click();
    if (errors.length) throw new Error(errors.join("\n"));
    await page.waitForTimeout(200);
    if (!await page.getByRole("textbox", { name: "New dialogue", exact: true }).count()) {
      fs.mkdirSync(".run-screenshots", { recursive: true });
      await page.screenshot({ path: ".run-screenshots/dialogue-debug.png", fullPage: true });
      throw new Error(`Add-line form missing: ${await page.locator('.decision-answer').innerText()}`);
    }
    const newLine = page.getByRole("textbox", { name: "New dialogue", exact: true });
    await newLine.fill("One two three four.");
    await expect(page.locator("#new-dialogue-speech-s")).toContainText("22 words");
    await expect(page.locator("#new-dialogue-speech-s")).toContainText("choose 15s or longer");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "Show generate", exact: true }).click();
    await expect(page.getByRole("region", { name: "2. Video" })).toContainText("10s scene: aim for about 20 spoken words total");
    await page.getByRole("combobox", { name: "Video length", exact: true }).click();
    await page.getByRole("option", { name: "5s", exact: true }).click();
    await expect(page.getByRole("region", { name: "2. Video" })).toContainText("Video generation is blocked until it fits");
    await page.getByRole("button", { name: "Show setup", exact: true }).click();
    await page.getByRole("button", { name: "I have a script", exact: true }).click();
    await expect(page.locator("#script-length-help")).toContainText("about 10 spoken words per scene across all speakers");
    await expect(page.locator("#script-length-help")).toContainText("Action descriptions and scene headings are not spoken");
    await page.getByRole("button", { name: "Show script", exact: true }).click();
    await expect(page.locator("#scene-speech-s")).toContainText("blocked");
    fs.mkdirSync(".run-screenshots", { recursive: true });
    await page.screenshot({ path: ".run-screenshots/dialogue-guidance-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: ".run-screenshots/dialogue-guidance-mobile.png", fullPage: true });
    assert.deepEqual(errors, []);
    assert.equal(posts, 0, "Typing, guidance and length changes never call a provider");
    console.log("PASS: live unsaved multi-speaker budgets, delayed-save preservation, duration overrides, new-line preview, longer-duration suggestions, script-import guidance, generation warnings and mobile layout. No provider calls.");
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
