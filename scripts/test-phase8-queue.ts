/**
 * ═══════════════════════════════════════════════════════════════
 * MODULE 7.7 — Save Queue Edge Cases
 * ═══════════════════════════════════════════════════════════════
 *
 * Tests the offline resilient queue logic as recommended in Phase 8 feedback.
 * - Queue persists to localStorage and preserves order.
 * - Failed saves persist permanently instead of dropping.
 * - `syncPendingSavesForDraft` preserves order and stops on failure.
 * - Recovery logic falls back correctly.
 */

import { getLocalQueue, saveLocalQueue, enqueueLocalSave, syncPendingSavesForDraft, type SavePayload, type QueuedSave } from "../lib/save-queue.ts";

// Mock localStorage for the NodeJS test environment
const mockStorage: Record<string, string> = {};
global.window = {
  localStorage: {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, val: string) => { mockStorage[key] = val; },
    removeItem: (key: string) => { delete mockStorage[key]; },
  }
} as any;

let fetchMock: jest.Mock | null = null;
global.fetch = async (...args) => {
  if (fetchMock) return fetchMock(...args);
  return { ok: true } as any;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function ok(label: string) { passed++; console.log(`   ✅ ${label}`); }
function fail(label: string, reason: string) { failed++; failures.push(`${label}: ${reason}`); console.error(`   ❌ ${label} — ${reason}`); }
function section(title: string) { console.log(`\n${"─".repeat(60)}\n  ${title}\n${"─".repeat(60)}`); }

function createMockPayload(sceneNumber: number): SavePayload {
  return {
    projectId: "proj-1",
    draftId: "draft-1",
    sceneNumber,
    scene: {} as any,
    choice: { text: "choice", choiceType: "Custom" },
    currentState: { sceneNumber, healthStatus: { health: 100, mana: 100, resolve: 100 }, inventory: [] }
  };
}

async function runTests() {
  console.log("🚀 Save Queue Recovery Tests\n");

  section("TEST 1 — LocalStorage Persistence & FIFO");
  saveLocalQueue([]);
  
  enqueueLocalSave(createMockPayload(10));
  enqueueLocalSave(createMockPayload(11));
  enqueueLocalSave(createMockPayload(12));

  let queue = getLocalQueue();
  if (queue.length === 3) ok("Queue correctly persists 3 items");
  else fail("Queue length", `Expected 3, got ${queue.length}`);

  if (queue[0].payload.sceneNumber === 10 && queue[2].payload.sceneNumber === 12) {
    ok("FIFO order preserved (10, 11, 12)");
  } else {
    fail("Queue order", `Expected 10,11,12 got ${queue.map(q => q.payload.sceneNumber)}`);
  }

  section("TEST 2 — Offline sync stops on first failure (Preserves Order)");
  // Mock fetch to fail on scene 11
  global.fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string);
    if (body.sceneNumber === 11) {
      return { ok: false } as any; // simulate offline/failure
    }
    return { ok: true } as any;
  };

  const syncResult = await syncPendingSavesForDraft("draft-1");
  if (!syncResult) ok("Sync correctly returns false on failure");
  else fail("Sync Result", "Expected false, got true");

  queue = getLocalQueue();
  if (queue.length === 2) ok("Scene 10 was successful and removed from queue");
  else fail("Queue length", `Expected 2, got ${queue.length}`);

  if (queue[0].payload.sceneNumber === 11 && queue[1].payload.sceneNumber === 12) {
    ok("Scenes 11 and 12 remain in queue preserving FIFO");
  } else {
    fail("Queue order after failure", `Expected 11,12 got ${queue.map(q => q.payload.sceneNumber)}`);
  }

  section("TEST 3 — Reconnect successfully drains remaining");
  global.fetch = async () => ({ ok: true } as any); // back online

  const syncResult2 = await syncPendingSavesForDraft("draft-1");
  if (syncResult2) ok("Sync correctly returns true on success");
  else fail("Sync Result", "Expected true, got false");

  queue = getLocalQueue();
  if (queue.length === 0) ok("Queue is empty after successful sync");
  else fail("Queue length", `Expected 0, got ${queue.length}`);

  section("TEST 4 — Draft Isolation");
  saveLocalQueue([]);
  enqueueLocalSave({ ...createMockPayload(1), draftId: "draft-A" });
  enqueueLocalSave({ ...createMockPayload(2), draftId: "draft-B" });
  
  global.fetch = async () => ({ ok: true } as any);

  await syncPendingSavesForDraft("draft-A");
  
  queue = getLocalQueue();
  if (queue.length === 1 && queue[0].draftId === "draft-B") {
    ok("syncPendingSavesForDraft only processed items for draft-A");
  } else {
    fail("Draft Isolation", `Expected 1 item for draft-B, got ${queue.map(q => q.draftId)}`);
  }

  // --- RESULTS ---
  section("RESULTS");
  console.log(`   Passed:  ${passed}`);
  console.log(`   Failed:  ${failed}`);
  if (failures.length > 0) {
    console.log("\n   Failures:");
    failures.forEach(f => console.log(`     ❌ ${f}`));
  }
}

runTests().catch(console.error);
