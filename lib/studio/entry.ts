// Only an opaque ID goes in the URL. The visitor's message stays in this browser
// until authentication completes, including an email confirmation in a new tab.
import type { FilmAssist, FilmLanguage, StudioTab } from "@/types/studio";
export const STUDIO_ENTRY_LIMIT = 24000;
const PREFIX = "omni-studio-entry:";
export const ACTIVE_ENTRY_KEY = "omni-studio-active-entry";
const LIFETIME = 24 * 60 * 60 * 1000;
type EntryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
/**
 * The setup choices a visitor made on the landing page.
 *
 * Carried through authentication with the idea text, so the film they land on
 * already reflects every decision they made before signing up rather than
 * resetting to defaults.
 */
export type StudioEntrySetup = {
  assist?: FilmAssist;
  language?: FilmLanguage;
  visualStyle?: string;
  clipSeconds?: number;
  sourceScript?: string;
};

export type StudioEntry = {
  text: string;
  createdAt: number;
  projectId?: string;
  guestProjectId?: string;
  tab?: StudioTab;
  pendingText?: string;
  setup?: StudioEntrySetup;
};

/** Validates the stored setup, discarding anything unrecognised. */
function readSetup(value: unknown): StudioEntrySetup | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const setup: StudioEntrySetup = {};
  if (raw.assist === "guided" || raw.assist === "custom") setup.assist = raw.assist;
  if (raw.language === "en" || raw.language === "ur") setup.language = raw.language;
  if (typeof raw.visualStyle === "string" && raw.visualStyle.trim().length <= 300)
    setup.visualStyle = raw.visualStyle;
  if (typeof raw.clipSeconds === "number" && raw.clipSeconds > 0 && raw.clipSeconds <= 60)
    setup.clipSeconds = raw.clipSeconds;
  if (typeof raw.sourceScript === "string" && raw.sourceScript.length <= STUDIO_ENTRY_LIMIT) setup.sourceScript = raw.sourceScript;
  return Object.keys(setup).length ? setup : undefined;
}
export function isStudioEntryId(id: string | null): id is string {
  return !!id && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id);
}
export function readStudioEntry(
  id: string | null,
  suppliedStorage?: EntryStorage,
): StudioEntry | null {
  if (!isStudioEntryId(id)) return null;
  try {
    const storage = suppliedStorage || window.localStorage;
    const entry = JSON.parse(storage.getItem(PREFIX + id) || "null");
    if (
      !entry ||
      typeof entry.text !== "string" ||
      !entry.text.trim() ||
      entry.text.length > STUDIO_ENTRY_LIMIT ||
      typeof entry.createdAt !== "number" ||
      Date.now() - entry.createdAt > LIFETIME ||
      entry.createdAt > Date.now() + 60000 ||
      (entry.projectId !== undefined && typeof entry.projectId !== "string") ||
      (entry.guestProjectId !== undefined &&
        typeof entry.guestProjectId !== "string") ||
      (entry.tab !== undefined &&
        !["plan", "scenes", "assemble"].includes(entry.tab)) ||
      (entry.pendingText !== undefined &&
        (typeof entry.pendingText !== "string" ||
          entry.pendingText.length > STUDIO_ENTRY_LIMIT))
    ) {
      storage.removeItem(PREFIX + id);
      return null;
    }
    return { ...entry, setup: readSetup(entry.setup) };
  } catch {
    return null;
  }
}
export function saveStudioEntry(
  text: string,
  storage: EntryStorage = window.localStorage,
  details: Pick<StudioEntry, "guestProjectId" | "tab" | "pendingText" | "setup"> = {},
) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > STUDIO_ENTRY_LIMIT)
    throw new Error(
      "Write a message of up to 24,000 characters to start your story.",
    );
  // Remove expired drafts without touching the user's other browser data.
  for (const key of Array.from({ length: storage.length }, (_, i) =>
    storage.key(i),
  )) {
    if (key?.startsWith(PREFIX))
      readStudioEntry(key.slice(PREFIX.length), storage);
  }
  const id = crypto.randomUUID();
  storage.setItem(
    PREFIX + id,
    JSON.stringify({ text: trimmed, createdAt: Date.now(), ...details }),
  );
  return id;
}
export function linkStudioEntry(
  id: string,
  projectId: string,
  storage: EntryStorage = window.localStorage,
) {
  const entry = readStudioEntry(id, storage);
  if (entry)
    storage.setItem(PREFIX + id, JSON.stringify({ ...entry, projectId }));
}
export function removeStudioEntry(id: string, storage?: EntryStorage) {
  try {
    (storage || window.localStorage).removeItem(PREFIX + id);
    if ((storage || window.localStorage).getItem(ACTIVE_ENTRY_KEY) === id) (storage || window.localStorage).removeItem(ACTIVE_ENTRY_KEY);
  } catch {
    /* The project already contains the message. */
  }
}

/** Removes browser-only recovery data once its linked story is permanently deleted. */
export function clearProjectBrowserData(projectId: string) {
  try {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(Boolean) as string[];
    for (const key of keys) {
      if (key.startsWith(PREFIX)) {
        const entry = readStudioEntry(key.slice(PREFIX.length), storage);
        if (entry?.projectId === projectId || entry?.guestProjectId === projectId) storage.removeItem(key);
      }
      if (key.startsWith(`story:${projectId}:`) || key === `omni-film-export:${projectId}`) storage.removeItem(key);
      if (key.startsWith("omni-home-project:") && storage.getItem(key) === projectId) storage.removeItem(key);
    }
    if (storage.getItem(ACTIVE_ENTRY_KEY)) {
      const active = readStudioEntry(storage.getItem(ACTIVE_ENTRY_KEY), storage);
      if (!active || active.projectId === projectId || active.guestProjectId === projectId) storage.removeItem(ACTIVE_ENTRY_KEY);
    }
  } catch {
    /* Local recovery data is optional; server deletion has already completed. */
  }
}

/** Updates one local draft instead of accumulating a new entry per keystroke. */
export function updateStudioEntry(id: string | null, text: string, details: Pick<StudioEntry, "setup" | "guestProjectId">) {
  const existing = readStudioEntry(id);
  const nextId = existing && id ? id : saveStudioEntry(text, window.localStorage, details);
  window.localStorage.setItem(PREFIX + nextId, JSON.stringify({ ...existing, text: text.trim(), createdAt: Date.now(), ...details }));
  window.localStorage.setItem(ACTIVE_ENTRY_KEY, nextId);
  window.dispatchEvent(new Event("omni:entry-saved"));
  return nextId;
}
/**
 * Where a signed-in visitor lands with their trial in hand.
 *
 * The id is the ENTRY id, which only this browser can resolve into the text
 * they typed. The dashboard reads it, turns it into a real project, and sends
 * them to that film's Setup step.
 */
export const STUDIO_ENTRY_ROUTE = "/dashboard";

export function studioEntryPath(id: string) {
  return `${STUDIO_ENTRY_ROUTE}?start=${encodeURIComponent(id)}`;
}

export function studioEntryFromPath(path: string) {
  const url = new URL(path, "https://omninarrative.invalid");
  return url.origin === "https://omninarrative.invalid" &&
    url.pathname === STUDIO_ENTRY_ROUTE
    ? url.searchParams.get("start")
    : null;
}
