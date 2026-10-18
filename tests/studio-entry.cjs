const assert = require("node:assert/strict");
const { loadTs } = require("../scripts/test-studio.cjs");

(async () => {
  const entry = loadTs("lib/studio/entry.ts");
  const values = new Map();
  const storage = {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] || null,
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  const id = entry.saveStudioEntry(
    "  My exact story\nwith another line.  ",
    storage,
  );
  assert.equal(
    entry.readStudioEntry(id, storage).text,
    "My exact story\nwith another line.",
  );
  assert.equal(entry.studioEntryFromPath(entry.studioEntryPath(id)), id);
  assert.equal(
    entry.studioEntryFromPath("https://other.example/studio?start=" + id),
    null,
  );
  entry.linkStudioEntry(id, "owned-project", storage);
  assert.equal(entry.readStudioEntry(id, storage).projectId, "owned-project");
  assert.throws(() => entry.saveStudioEntry(" ", storage));
  assert.throws(() => entry.saveStudioEntry("a".repeat(24001), storage));
  assert.equal(entry.readStudioEntry("invalid", storage), null);
  values.set(
    "omni-studio-entry:" + id,
    JSON.stringify({ text: "Old", createdAt: Date.now() - 86400001 }),
  );
  assert.equal(entry.readStudioEntry(id, storage), null);
  assert.equal(values.size, 0);
  const next = "/studio?start=12345678-1234-1234-1234-123456789012";
  const { getSafeRedirectPath } = loadTs("lib/auth-redirect.ts");
  assert.equal(getSafeRedirectPath(next), next);
  for (const unsafe of [
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/auth?next=/studio",
    "/a/../signup",
    "/\nevil.example",
  ])
    assert.equal(getSafeRedirectPath(unsafe), "/studio", unsafe);
  let signedIn = false,
    badCode = false;
  const cookies = {
    getAll: () => [{ name: "refreshed", value: "session" }],
    set: () => {},
  };
  const { updateSession } = loadTs("lib/supabase/middleware.ts", {
    "@supabase/ssr": {
      createServerClient: () => ({
        auth: {
          getUser: async () => ({
            data: { user: signedIn ? { id: "qa" } : null },
          }),
          exchangeCodeForSession: async () => ({
            error: badCode ? new Error("Expired") : null,
          }),
        },
      }),
    },
    "next/server": {
      NextResponse: {
        next: () => ({ cookies }),
        redirect: (url) => {
          const written = [];
          return {
            url: url.toString(),
            written,
            cookies: { set: (cookie) => written.push(cookie) },
          };
        },
      },
    },
  });
  const request = (path) => {
    const url = new URL(path, "https://local.example");
    url.clone = () => new URL(url);
    return { nextUrl: url, url: url.href, cookies };
  };
  let response = await updateSession(request(next));
  assert.equal(new URL(response.url).pathname, "/auth");
  assert.equal(new URL(response.url).searchParams.get("next"), next);
  assert.equal(
    response.written.length,
    1,
    "Redirect must retain refreshed cookies",
  );
  signedIn = true;
  response = await updateSession(
    request("/signup?next=" + encodeURIComponent(next)),
  );
  assert.equal(response.url, "https://local.example" + next);
  response = await updateSession(
    request("/auth?next=" + encodeURIComponent("//evil.example")),
  );
  assert.equal(response.url, "https://local.example/studio");
  badCode = true;
  response = await updateSession(request(next + "&code=expired"));
  assert.equal(new URL(response.url).searchParams.get("next"), next);
  assert.equal(new URL(response.url).pathname, "/auth");
  console.log(
    "PASS: prompt fidelity, size limits, expiration, project linking, safe redirects, query preservation, confirmation failure recovery, and redirect cookies.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
