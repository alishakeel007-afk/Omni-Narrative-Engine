// @ts-expect-error Node's native TypeScript runner requires source extensions.
import { fetchGeminiWithRetry, toGeminiRequestError } from "../lib/gemini-retry.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

async function run() {
  let calls = 0;
  const delays: number[] = [];
  const recovered = await fetchGeminiWithRetry({
    request: async () => {
      calls += 1;
      return calls === 1 ? new Response("temporarily unavailable", { status: 503 }) : new Response("ok", { status: 200 });
    },
    random: () => 0,
    sleep: async (delay) => { delays.push(delay); }
  });
  if (recovered.status !== 200 || calls !== 2 || delays.length !== 1) throw new Error("503 should receive exactly one retry.");

  calls = 0;
  const stillUnavailable = await fetchGeminiWithRetry({
    request: async () => { calls += 1; return new Response("busy", { status: 503 }); },
    sleep: async () => undefined
  });
  if (stillUnavailable.status !== 503 || calls !== 2) throw new Error("A repeated 503 must stop after one retry.");

  for (const status of [502, 504]) {
    calls = 0;
    const recoveredGateway = await fetchGeminiWithRetry({
      request: async () => { calls += 1; return calls === 1 ? new Response("gateway", { status }) : new Response("ok"); },
      sleep: async () => undefined
    });
    if (recoveredGateway.status !== 200 || calls !== 2) throw new Error(`${status} should receive one retry.`);
  }

  for (const status of [400, 401, 403]) {
    calls = 0;
    await fetchGeminiWithRetry({ request: async () => { calls += 1; return new Response("permanent", { status }); } });
    if (calls !== 1) throw new Error(`${status} must not retry.`);
  }

  calls = 0;
  await fetchGeminiWithRetry({
    request: async () => { calls += 1; return new Response("daily quota exceeded", { status: 429, headers: { "retry-after": "1" } }); },
    sleep: async () => undefined
  });
  if (calls !== 1) throw new Error("Daily quota exhaustion must not retry.");

  calls = 0;
  const rateLimited = await fetchGeminiWithRetry({
    request: async () => { calls += 1; return calls === 1 ? new Response("try shortly", { status: 429, headers: { "retry-after": "1" } }) : new Response("ok"); },
    sleep: async () => undefined
  });
  if (rateLimited.status !== 200 || calls !== 2) throw new Error("A short, temporary 429 should retry once.");

  calls = 0;
  try {
    await fetchGeminiWithRetry({ request: async () => { calls += 1; throw new TypeError("network lost"); } });
  } catch { /* expected: network completion is ambiguous */ }
  if (calls !== 1) throw new Error("Network failures must not retry.");

  const unavailableError = await toGeminiRequestError(new Response("high demand", { status: 503 }), "story generation");
  if (!unavailableError.message.includes("temporarily unavailable")) throw new Error("503 user-facing error is unclear.");
  if (unavailableError.message.toLowerCase().includes("groq")) throw new Error("No-fallback error must not suggest an unconfigured Groq fallback.");
  const quotaError = await toGeminiRequestError(new Response("daily quota exceeded", { status: 429 }), "story generation");
  if (!quotaError.message.includes("quota")) throw new Error("Quota error is unclear.");

  for (const routePath of [
    "app/api/story/generate-scene/route.ts",
    "app/api/story/generate-dialogue/route.ts",
  ]) {
    const source = readFileSync(resolve(process.cwd(), routePath), "utf8");
    if (!/if \(!groqApiKey\) \{\s*const message = geminiError instanceof Error \? geminiError\.message : "Gemini [^"]+ failed\.";\s*return NextResponse\.json\(\{ error: message \}, \{ status: 500 \}\);\s*\}/.test(source)) {
      throw new Error(`${routePath} must return the sanitized Gemini error when Groq is not configured.`);
    }
  }
}

await run();
console.log("Gemini retry tests passed.");
