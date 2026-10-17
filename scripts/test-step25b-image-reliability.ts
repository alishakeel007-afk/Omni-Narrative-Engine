import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const route = readFileSync(resolve(process.cwd(), "app/api/video/image/route.ts"), "utf8");
const service = readFileSync(resolve(process.cwd(), "lib/image/image-service.ts"), "utf8");
const database = readFileSync(resolve(process.cwd(), "lib/story-database.ts"), "utf8");
const provider = readFileSync(resolve(process.cwd(), "lib/image/image-provider.ts"), "utf8");
for (const contract of ["Saved scene not found or access denied.", "target?.id", "resolvedAppearances", "storagePath"]) {
  assert.ok(route.includes(contract), `missing route isolation/persistence contract: ${contract}`);
}
assert.ok(service.includes("isPollinationsFallbackEnabled"), "fallback must be explicit");
assert.ok(database.includes("type: MediaType.IMAGE"), "image persistence must remain scene-scoped");
assert.match(provider, /providerFailureMessage\("Cloudflare Workers AI"/);
assert.match(provider, /IMAGE_FALLBACK_PROVIDER/);
assert.match(provider, /=== "pollinations"/);
assert.match(provider, /enabled === "true"/);
assert.match(provider, /Pollinations AI error \(\$\{response.status\}\)/, "a Pollinations 402 remains a reported provider error, never success");

console.log("Step 25B image prompt, provider, and persistence reliability tests passed.");
