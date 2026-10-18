const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

// Exercise the route without network requests or billable generations.
let user = { id: "user-a" };
let upstreamStatus = 200;
const calls = [];
const exported = { exports: {} };
const source = ts.transpileModule(fs.readFileSync("app/api/video/render/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(source, {
  exports: exported.exports,
  module: exported,
  Buffer, URL, AbortSignal,
  require(name) {
    if (name === "next/server") return { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } };
    if (name === "@/lib/env") return { getEnvValue: () => "test-only-secret" };
    if (name === "@/lib/supabase/server") return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) };
    return require(name);
  },
  fetch: async (url, options) => {
    calls.push({ url, options });
    return { ok: upstreamStatus === 200, status: upstreamStatus, json: async () => options.method === "POST" ? { id: "job-123" } : { status: "complete", downloads: [{ url: "https://example.com/clip.mp4" }] } };
  },
});
const route = exported.exports;
const request = (body) => ({ json: async () => body });
(async () => {
  user = null;
  assert.equal((await route.POST(request({}))).status, 401);
  assert.equal(calls.length, 0);
  user = { id: "user-a" };
  assert.equal((await route.POST(request({ prompt: "", name: "Scene" }))).status, 400);
  const created = await route.POST(request({ prompt: "A forest at dawn", name: "Scene", duration: 5 }));
  assert.equal(created.status, 200);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.model, "ltx-2.5");
  assert.equal(payload.audio, false);
  assert.equal(payload.end_seconds, 5);
  const url = `http://localhost/api/video/render?id=${created.body.id}&token=${created.body.token}`;
  const completed = await route.GET({ url });
  assert.equal(completed.body.url, "https://example.com/clip.mp4");
  user = { id: "user-b" };
  assert.equal((await route.GET({ url })).status, 403);
  assert.equal((await route.GET({ url: "http://localhost/api/video/render?id=job-123&token=bad" })).status, 403);
  user = { id: "user-a" };
  upstreamStatus = 402;
  assert.equal((await route.POST(request({ prompt: "A forest", name: "Scene" }))).status, 402);
  console.log("Magic Hour route checks passed: authentication, validation, payload, polling, ownership, and insufficient credits.");
})().catch(error => { console.error(error); process.exitCode = 1; });
