export const DEFAULT_AUTH_REDIRECT = "/studio";

export function getSafeRedirectPath(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return DEFAULT_AUTH_REDIRECT;
  }

  const url = new URL(value, "https://omninarrative.invalid");
  if (
    url.origin !== "https://omninarrative.invalid" ||
    url.pathname.startsWith("/auth") ||
    url.pathname.startsWith("/signup")
  ) {
    return DEFAULT_AUTH_REDIRECT;
  }

  return url.pathname + url.search + url.hash;
}
