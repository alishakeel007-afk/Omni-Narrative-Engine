import assert from "node:assert/strict";
// @ts-expect-error Focused Node tests load TypeScript sources directly.
import { classifyCustomSaveFailure } from "../lib/custom-save-error.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

assert.deepEqual(classifyCustomSaveFailure({ code: "P2034" }), {
  status: 409, logCode: "P2034", error: "This project changed while it was being saved. Please retry once.",
});
assert.equal(classifyCustomSaveFailure({ code: "P2022" }).status, 503, "missing schema must be distinguished from a generic write failure");
assert.equal(classifyCustomSaveFailure({ code: "ETIMEDOUT" }).status, 503, "connectivity failures retain a safe retry message");
assert.deepEqual(classifyCustomSaveFailure(new Error("sensitive driver detail")), {
  status: 500, logCode: "UNKNOWN", error: "The project could not be saved. Your local draft is still safe.",
});

const route = readFileSync(resolve(process.cwd(), "app/api/story/custom/save/route.ts"), "utf8");
const client = readFileSync(resolve(process.cwd(), "lib/custom-story-db.ts"), "utf8");
assert.match(route, /classifyCustomSaveFailure\(error\)/, "the save route must classify the caught transaction error");
assert.match(route, /console\.error\("Custom Mode project save failed", \{ code: failure\.logCode \}\)/, "logs must contain only the stable safe code");
assert.match(client, /responseError\(payload, saveErrorForStatus\(response\.status\)\)/, "the UI client must use the safe server response");

console.log("Step 130C.2 Custom save failure classification and safe response contracts passed.");
