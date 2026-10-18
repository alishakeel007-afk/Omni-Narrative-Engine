const SECURE_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

function rawPasswordSegment(value) {
  const schemeEnd = value.indexOf("://");
  const afterScheme = value.slice(schemeEnd + 3);
  const authorityEnd = afterScheme.search(/[/?#]/);
  const authority = afterScheme.slice(0, authorityEnd === -1 ? afterScheme.length : authorityEnd);
  const userInfo = authority.slice(0, authority.lastIndexOf("@"));
  const separator = userInfo.indexOf(":");
  return separator === -1 ? "" : userInfo.slice(separator + 1);
}

export function validateDatabaseUrl(name, value, expectedPort) {
  if (!value || /^(your_|replace_|USER:)/.test(value)) {
    throw new Error(`${name} is not configured.`);
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is not a valid PostgreSQL URL.`);
  }

  const password = rawPasswordSegment(value);
  if (/%(?![0-9A-Fa-f]{2})/.test(password) || /[\s@/#?]/.test(password)) {
    throw new Error(`${name} contains an unencoded reserved character in its password. URL-encode the password.`);
  }
  if (url.protocol !== "postgresql:" || url.port !== expectedPort || url.pathname !== "/postgres") {
    throw new Error(`${name} does not have the expected PostgreSQL endpoint shape.`);
  }
  if (!SECURE_SSL_MODES.has(url.searchParams.get("sslmode"))) {
    throw new Error(`${name} must require TLS with sslmode=require, verify-ca, or verify-full.`);
  }

  return url;
}
