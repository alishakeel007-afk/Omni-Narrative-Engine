export const DEFAULT_AUTH_REDIRECT = "/dashboard";

/** Resolution base used only to normalize a candidate path; never navigated to. */
const BASE = "https://redirect.invalid";

/** Landing on these would bounce the user straight back into authentication. */
const BLOCKED = ["/auth", "/signup"];

/**
 * A browser can read a backslash as a path separator, so a value beginning
 * with a slash then a backslash behaves as a protocol-relative URL. Control
 * characters are rejected for the same reason: they can split or disguise the
 * real target.
 */
function hasUnsafeCharacter(value: string) {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (character === "\\" || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Returns a same-origin in-app path, or the default landing path.
 *
 * A value is trusted only after it normalizes to a path on this origin,
 * because "/a/../signup" reveals its real target only once normalized.
 */
export function getSafeRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/")) return DEFAULT_AUTH_REDIRECT;
  if (hasUnsafeCharacter(value)) return DEFAULT_AUTH_REDIRECT;

  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
  // A protocol-relative or absolute input resolves to a different origin.
  if (url.origin !== BASE) return DEFAULT_AUTH_REDIRECT;
  if (BLOCKED.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
