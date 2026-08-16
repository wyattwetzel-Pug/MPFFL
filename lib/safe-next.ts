/*
 * Where to send someone after they sign in.
 *
 * A "return to where you were" parameter is an open redirect unless it is
 * checked, and an open redirect on a sign-in flow is the useful kind for an
 * attacker: send someone a link to REPLACE-WITH-YOUR-DOMAIN.example that signs them in and then lands
 * them on a copy of the site asking for something.
 *
 * So the rule is narrow on purpose — a single-slash relative path, nothing
 * else. Everything that isn't obviously safe becomes null and the caller falls
 * back to the home page.
 */

export const DEFAULT_AFTER_SIGN_IN = "/";

export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;

  // Reject before decoding *and* after: "%2f%2fevil.com" decodes into a
  // protocol-relative URL, which browsers treat as another origin.
  let path = value;
  try {
    path = decodeURIComponent(value);
  } catch {
    return null;
  }

  if (!path.startsWith("/")) return null;
  // "//host" and "/\host" are both read as another origin.
  if (path.startsWith("//") || path.startsWith("/\\")) return null;
  // A backslash anywhere is a normalisation trick, never a real path here.
  if (path.includes("\\")) return null;
  // Control characters can truncate a header or a URL parse.
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  // Sending someone back to the sign-in flow is a loop, not a destination.
  if (path === "/sign-in" || path.startsWith("/sign-in/")) return null;

  return path;
}

/** The same check, but always giving a usable destination. */
export function nextOrHome(value: string | null | undefined): string {
  return safeNext(value) ?? DEFAULT_AFTER_SIGN_IN;
}
