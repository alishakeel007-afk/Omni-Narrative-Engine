const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { chromium, expect: baseExpect } = require("@playwright/test");
const expect = baseExpect.configure({ timeout: 12000 });
const { loadTs } = require("../scripts/test-studio.cjs");

(async () => {
  const { EMPTY_STUDIO } = loadTs("types/studio.ts");
  const initial = { ...structuredClone(EMPTY_STUDIO), characters: [{ id: "a", name: "Aleeza", appearance: "", locked: false }], scenes: [] };
  const bundle = await require("esbuild").build({ stdin: { loader: "tsx", resolveDir: process.cwd(), contents: `
    import React,{useState}from"react";import{createRoot}from"react-dom/client";import{CharacterPanel}from"./components/film/character-panel";
    const initial=${JSON.stringify(initial)};window.detailWrites=[];window.failDetails=false;
    function Fixture(){const[state,setState]=useState(()=>{const saved=localStorage.getItem("qa-details");if(saved)initial.characters[0].details=JSON.parse(saved);return initial});window.characterState=state;
      const ok=async()=>true;const action=async input=>{window.detailWrites.push(input);await new Promise(resolve=>setTimeout(resolve,900));if(window.failDetails){window.failDetails=false;return false}if(input.action==="characterDetails"){localStorage.setItem("qa-details",JSON.stringify(input.details));setState(current=>({...current,characters:current.characters.map(character=>({...character,details:input.details}))}))}return true};
      return <main style={{maxWidth:720,padding:16,margin:"auto"}}><h1>Character details</h1><CharacterPanel projectId="fixture" characterId="a" state={state} onCharacter={ok} onReference={ok} onUpload={async()=>null} onVoice={ok} onAction={action}/><button onClick={()=>setState(current=>({...current,characters:current.characters.map(character=>({...character,locked:true}))}))}>Lock fixture identity</button></main>}
    createRoot(document.getElementById("root")).render(<Fixture/>);` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", banner: { js: "var process={env:{}};" }, define: { "process.env.NODE_ENV": '"production"' } });
  const css = (await require("postcss")([require("tailwindcss")]).process(fs.readFileSync("app/globals.css", "utf8"), { from: path.resolve("app/globals.css") })).css + fs.readFileSync("app/public.css", "utf8");
  const server = http.createServer((req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].text); }
    else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: "chrome" });
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [], providerCalls = []; page.on("pageerror", error => errors.push(error.message));
    await page.route("**/api/**", async route => { providerCalls.push(route.request().url()); await route.abort(); });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const choose = async (field, value) => { await page.getByRole("combobox", { name: field, exact: true }).click(); await page.getByRole("option", { name: value, exact: true }).click(); };
    for (const field of ["Gender", "Age", "Nationality", "Ethnicity / community", "Religion"]) await expect(page.getByRole("combobox", { name: field, exact: true })).toContainText("Not specified");
    await choose("Gender", "Female"); await choose("Age", "Young adult (18–25)"); await choose("Nationality", "Pakistani"); await choose("Ethnicity / community", "Punjabi"); await choose("Religion", "Muslim");
    const clothing = page.getByRole("textbox", { name: "Clothing preferences", exact: true });
    await clothing.fill("Blue cotton kurta, no headscarf.");
    await page.getByRole("button", { name: "Save character details", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saving details…", exact: true })).toBeVisible();
    await clothing.fill("Green cotton kurta, no headscarf.");
    await expect(page.getByText("Earlier details saved. Save again to apply your latest changes.", { exact: true })).toBeVisible();
    await expect(clothing).toHaveValue("Green cotton kurta, no headscarf.");
    await page.getByRole("button", { name: "Save character details", exact: true }).click();
    await expect(page.getByText("Character details saved. Images and videos will follow these choices.", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.characterState.characters[0].details.clothing), "Green cotton kurta, no headscarf.");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Nationality", exact: true })).toContainText("Pakistani");
    await expect(clothing).toHaveValue("Green cotton kurta, no headscarf.");
    await choose("Nationality", "Specify another…");
    await page.getByRole("textbox", { name: "Custom nationality", exact: true }).fill("Turkish");
    await choose("Religion", "Not specified");
    await page.evaluate(() => { window.failDetails = true; });
    await page.getByRole("button", { name: "Save character details", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("could not be saved"); await expect(page.getByRole("alert")).toBeInViewport();
    await page.getByRole("button", { name: "Save character details", exact: true }).click();
    await expect(page.getByText("Character details saved. Images and videos will follow these choices.", { exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => window.characterState.characters[0].details.nationality), "Turkish");
    assert.equal(await page.evaluate(() => window.characterState.characters[0].details.religion), undefined);
    await page.setViewportSize({ width: 390, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    fs.mkdirSync(".run-screenshots", { recursive: true }); await page.screenshot({ path: ".run-screenshots/character-details-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "3. Approve a reference", exact: true }).click();
    await expect(page.getByRole("button", { name: "Generate concept portrait", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "1. Identity", exact: true }).click();
    await page.getByRole("button", { name: "Lock fixture identity", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "Gender", exact: true })).toBeDisabled();
    await expect(clothing).toBeDisabled();
    assert.deepEqual(errors, []); assert.deepEqual(providerCalls, []);
    console.log("PASS: optional identity/cultural choices, custom values, saved-state reload, delayed-save draft preservation, local error/retry, clearing religion, trait-only portraits, lock controls and mobile layout. No provider calls.");
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
