/**
 * Storage cleanup deliberately accepts only paths created by this application
 * for a single project. It never derives an object path from a public URL or
 * from client input.
 */
export type ProjectStorageObject = {
  bucket: "audio" | "images";
  path: string;
  storagePath: string;
};

const DISALLOWED_PATH_SEGMENTS = new Set(["", ".", ".."]);

function hasSafeSegments(path: string) {
  return !path.includes("\\") && !path.includes("\0") && path.split("/").every((segment) => !DISALLOWED_PATH_SEGMENTS.has(segment));
}

/**
 * Returns a deletion target only for current server-generated project paths.
 * `default` and unknown/legacy layouts are intentionally retained.
 */
export function getOwnedProjectStorageObject(storagePath: unknown, projectId: string): ProjectStorageObject | null {
  if (typeof storagePath !== "string" || !projectId || storagePath.length > 2_000) return null;
  const value = storagePath.trim();
  if (!value || value.startsWith("/") || !hasSafeSegments(value)) return null;

  const knownPrefixes: Array<{ bucket: ProjectStorageObject["bucket"]; prefix: string }> = [
    { bucket: "images", prefix: `images/${projectId}/` },
    { bucket: "audio", prefix: `audio/tts/${projectId}/` },
    { bucket: "audio", prefix: `audio/music/${projectId}/` },
  ];
  const known = knownPrefixes.find(({ prefix }) => value.startsWith(prefix));
  if (!known) return null;

  const path = value.slice(`${known.bucket}/`.length);
  return path && hasSafeSegments(path) ? { bucket: known.bucket, path, storagePath: value } : null;
}

export function planOwnedProjectStorageCleanup(
  projectId: string,
  storagePaths: Array<string | null | undefined>,
) {
  const safe = new Map<string, ProjectStorageObject>();
  const retained = new Set<string>();

  for (const storagePath of storagePaths) {
    if (!storagePath) continue;
    const object = getOwnedProjectStorageObject(storagePath, projectId);
    if (object) safe.set(object.storagePath, object);
    else retained.add(storagePath);
  }

  return { objects: [...safe.values()], retainedStoragePaths: [...retained] };
}

/** Avoid deleting a path if another project still has a database reference. */
export function excludeSharedProjectStorageObjects(
  objects: ProjectStorageObject[],
  sharedStoragePaths: Iterable<string>,
) {
  const shared = new Set(sharedStoragePaths);
  return {
    deletable: objects.filter((object) => !shared.has(object.storagePath)),
    retainedSharedStoragePaths: objects.filter((object) => shared.has(object.storagePath)).map((object) => object.storagePath),
  };
}
