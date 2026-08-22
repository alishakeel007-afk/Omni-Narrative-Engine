export const DEFAULT_AUTH_REDIRECT = "/story/mode";

export function getSafeRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  if (value.startsWith("/auth") || value.startsWith("/signup")) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return value;
}
