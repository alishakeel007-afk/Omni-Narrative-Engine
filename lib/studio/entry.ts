// Only an opaque ID goes in the URL. The visitor's message stays in this browser
// until authentication completes, including an email confirmation in a new tab.
import type { StudioTab } from "@/types/studio";
export const STUDIO_ENTRY_LIMIT = 24000;
const PREFIX = "omni-studio-entry:";
const LIFETIME = 24 * 60 * 60 * 1000;
type EntryStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
export type StudioEntry = {
  text: string;
  createdAt: number;
  projectId?: string;
  guestProjectId?: string;
  tab?: StudioTab;
  pendingText?: string;
};
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
    return entry;
  } catch {
    return null;
  }
}
export function saveStudioEntry(
  text: string,
  storage: EntryStorage = window.localStorage,
  details: Pick<StudioEntry, "guestProjectId" | "tab" | "pendingText"> = {},
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
  } catch {
    /* The project already contains the message. */
  }
}
export function studioEntryPath(id: string) {
  return `/studio?start=${encodeURIComponent(id)}`;
}
export function studioEntryFromPath(path: string) {
  const url = new URL(path, "https://omninarrative.invalid");
  return url.origin === "https://omninarrative.invalid" &&
    url.pathname === "/studio"
    ? url.searchParams.get("start")
    : null;
}
