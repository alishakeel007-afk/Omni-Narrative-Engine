const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { loadTs } = require("../scripts/test-studio.cjs");
(async () => {
  const rows = new Map();
  let calls = 0,
    fail = false,
    release,
    hold = false;
  const prisma = {
    filmWorkspace: {
      create: async ({ data }) => {
        const row = {
          ...structuredClone(data),
          id: randomUUID(),
          revision: 0,
          createdAt: new Date(),
        };
        rows.set(row.id, row);
        return structuredClone(row);
      },
      findFirst: async ({ where }) => {
        const row = rows.get(where.id);
        return row && row.userId === where.userId ? structuredClone(row) : null;
      },
      updateMany: async ({ where, data }) => {
        const row = rows.get(where.id);
        if (
          !row ||
          row.userId !== where.userId ||
          row.revision !== where.revision
        )
          return { count: 0 };
        Object.assign(row, structuredClone(data));
        return { count: 1 };
      },
    },
  };
  const guest = loadTs("lib/studio/guest.ts", {
    "@/lib/prisma": { prisma },
    "./ai": {
      directorReply: async (_state, text, tab, _scene, preview) => {
        assert.equal(preview, true);
        calls++;
        if (hold)
          await new Promise((resolve) => {
            release = resolve;
          });
        if (fail) {
          fail = false;
          throw new Error("Model unavailable");
        }
        return {
          reply: `Reply in ${tab}: ${text}`,
          plan: null,
          choices: [
            {
              label: "Explore",
              message: "Explore the idea",
              description: null,
            },
          ],
          image: { prompt: "Never render in trial", characterNames: [] },
        };
      },
    },
  });
  const turn = (text, tab = "plan") => ({ text, tab, requestId: randomUUID() });
  const firstInput = turn("A lighthouse remembers the sea.");
  const first = await guest.guestTurn(undefined, firstInput);
  const cookie = first.cookie;
  assert.ok(cookie);
  assert.equal(first.remaining, 2);
  const replay = await guest.guestTurn(cookie, firstInput);
  assert.equal(replay.remaining, 2);
  assert.equal(calls, 1);
  await guest.guestTurn(cookie, turn("Make scene one mysterious.", "scenes"));
  const third = await guest.guestTurn(
    cookie,
    turn("Suggest music and pacing.", "assemble"),
  );
  assert.equal(third.remaining, 0);
  assert.equal(third.state.messages.length, 6);
  assert.ok(
    !third.state.messages.some((message) => message.image),
    "A trial response must never start or store generated media",
  );
  assert.equal(
    (await guest.loadGuest(cookie)).state.messages.length,
    6,
    "Quota and history survive another request",
  );
  await assert.rejects(
    guest.guestTurn(cookie, turn("Fourth")),
    (error) => error.status === 403,
  );
  assert.equal(calls, 3, "Fourth request must not call a model");
  await assert.rejects(
    guest.claimGuest("user", undefined, first.id),
    (error) => error.status === 404,
  );
  const claimed = await guest.claimGuest("user", cookie, first.id);
  assert.equal(claimed.state.messages.length, 6);
  assert.equal(rows.get(first.id).userId, "user");
  assert.equal(
    await guest.loadGuest(cookie),
    null,
    "Guest credentials lose access after transfer",
  );
  assert.equal(
    (await guest.claimGuest("user", undefined, first.id)).id,
    first.id,
    "A claim retry must not create a duplicate project",
  );
  await assert.rejects(
    guest.claimGuest("other-user", cookie, first.id),
    (error) => error.status === 404,
  );

  fail = true;
  let failedCookie;
  const retryInput = turn("Keep my question on failure");
  try {
    await guest.guestTurn(undefined, retryInput);
    assert.fail("Expected failure");
  } catch (error) {
    failedCookie = error.guestCookie;
  }
  assert.ok(failedCookie, "A first failed reply must retain its session");
  const failedState = (await guest.loadGuest(failedCookie)).state;
  assert.equal(failedState.messages.length, 0);
  assert.ok(!failedState.operation);
  const recovered = await guest.guestTurn(failedCookie, retryInput);
  assert.equal(recovered.remaining, 2, "Failed replies do not spend a message");
  hold = true;
  const pending = guest.guestTurn(failedCookie, turn("Slow reply", "scenes"));
  while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
  const before = calls;
  await assert.rejects(
    guest.guestTurn(failedCookie, turn("Concurrent reply", "assemble")),
    (error) => error.status === 409,
  );
  assert.equal(
    calls,
    before,
    "A concurrent message cannot bypass the reservation",
  );
  release();
  hold = false;
  await pending;
  rows.get(recovered.id).createdAt = new Date(Date.now() - 86400001);
  assert.equal(await guest.loadGuest(failedCookie), null);
  class RouteError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }
  let routeCalls = 0;
  const api = loadTs("app/api/studio/guest/route.ts", {
    "@/lib/studio/guest": {
      ...guest,
      guestTurn: async () => {
        routeCalls++;
        const error = new RouteError("Model unavailable", 503);
        error.guestCookie = cookie;
        throw error;
      },
    },
    "@/lib/studio/store": { StudioError: RouteError },
  });
  const request = (body, origin = "http://127.0.0.1:3000") =>
    Object.assign(
      new Request("http://localhost:3000/api/studio/guest", {
        method: "POST",
        headers: {
          host: "127.0.0.1:3000",
          origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
      { cookies: { get: () => undefined } },
    );
  assert.equal(
    (await api.POST(request({}))).status,
    400,
    "Loopback host must accept same-origin validation before rejecting invalid input",
  );
  assert.equal(
    (await api.POST(request({}, "https://other.example"))).status,
    403,
  );
  assert.equal(
    routeCalls,
    0,
    "Invalid or cross-site requests must not spend model calls",
  );
  const failedResponse = await api.POST(request(turn("Valid request")));
  assert.equal(failedResponse.status, 503);
  assert.match(failedResponse.headers.get("set-cookie"), /HttpOnly/i);
  assert.match(failedResponse.headers.get("set-cookie"), /omni-guest-studio=/);
  assert.ok(
    !(await failedResponse.text()).includes(cookie),
    "The private session token must not appear in JSON",
  );
  console.log(
    "PASS: durable three-message allowance across tabs, replay, no fourth model call or guest media generation, failure recovery, concurrent reservation, expiration, private ownership, idempotent transfer, origin/input validation, and HTTP-only failure cookies.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
