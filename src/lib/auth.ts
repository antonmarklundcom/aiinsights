/**
 * Session auth for the single shared dashboard password (plan §1.2, §5.3).
 *
 * There is no user table: one password, one signed cookie. The cookie value is
 * `<expiresAt>.<hmac>`, where the HMAC-SHA256 is taken over the `expiresAt`
 * string with `AUTH_COOKIE_SECRET`. Nothing else is stored client-side, so a
 * valid signature plus an unexpired timestamp *is* the session.
 *
 * Web Crypto only. `src/proxy.ts` imports this module and runs in a restricted
 * runtime where Node's `crypto` module is not importable, so everything here
 * goes through `globalThis.crypto`.
 *
 * Env is read from `process.env` directly rather than through `src/lib/env.ts`:
 * that module validates the whole set on first touch and throws when e.g.
 * `DATABASE_URL` is missing, which must never take the proxy down (plan §4.5).
 * `env.ts` still lists both keys as production-required, so production fails
 * closed at startup.
 */

/** Name of the session cookie. */
export const SESSION_COOKIE = "ai_session";

/** How long a fresh session lasts (plan §5.3). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Signing key used when `AUTH_COOKIE_SECRET` is unset outside production.
 * Constant on purpose — it is never reachable in production, where `env.ts`
 * requires the real key and `sessionSecret()` throws without it.
 */
const DEV_SECRET = "aiinsights-development-session-secret";

const encoder = new TextEncoder();

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function readEnv(key: string): string | undefined {
  const raw = process.env[key];
  return raw === undefined || raw.trim() === "" ? undefined : raw;
}

/** The configured dashboard password, or `undefined` when unset. */
export function dashboardPassword(): string | undefined {
  return readEnv("DASHBOARD_PASSWORD");
}

/**
 * Development convenience (plan §5.3): with no `DASHBOARD_PASSWORD` there is
 * nothing to log in with, so the dashboard stays open locally. Never in
 * production — there the password is required and a missing one locks the app.
 */
export function authDisabled(): boolean {
  return !isProduction() && dashboardPassword() === undefined;
}

/** The cookie signing key. Throws in production when unset (fails closed). */
export function sessionSecret(): string {
  const secret = readEnv("AUTH_COOKIE_SECRET");
  if (secret) return secret;
  if (isProduction()) {
    throw new Error("AUTH_COOKIE_SECRET is not set; cannot sign or verify the session cookie.");
  }
  return DEV_SECRET;
}

async function hmacKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    [usage]
  );
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Parses lowercase hex. Returns `undefined` for anything that is not hex. */
function fromHex(hex: string): Uint8Array | undefined {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) return undefined;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/** Expiry timestamp for a session created now. */
export function newSessionExpiry(now: number = Date.now()): number {
  return now + SESSION_TTL_MS;
}

/** Builds the cookie value `<expiresAt>.<hmac>`. */
export async function signSession(
  expiresAt: number = newSessionExpiry(),
  secret: string = sessionSecret()
): Promise<string> {
  const payload = String(expiresAt);
  const key = await hmacKey(secret, "sign");
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toHex(signature)}`;
}

/**
 * True when `value` carries our signature and has not expired. Signature is
 * checked before the clock so a tampered timestamp can never shortcut to a
 * different answer; `crypto.subtle.verify` does the comparison in constant time.
 */
export async function verifySession(
  value: string | undefined | null,
  { now = Date.now(), secret }: { now?: number; secret?: string } = {}
): Promise<boolean> {
  if (!value) return false;

  const separator = value.indexOf(".");
  if (separator <= 0) return false;

  const payload = value.slice(0, separator);
  if (!/^\d+$/.test(payload)) return false;

  const signature = fromHex(value.slice(separator + 1));
  if (!signature) return false;

  let key: CryptoKey;
  try {
    key = await hmacKey(secret ?? sessionSecret(), "verify");
  } catch {
    // No signing key in production: no cookie can be trusted.
    return false;
  }

  const signed = await crypto.subtle.verify(
    "HMAC",
    key,
    signature as unknown as BufferSource,
    encoder.encode(payload)
  );
  if (!signed) return false;

  return Number(payload) > now;
}

/**
 * Compares two secrets without leaking their contents through timing. Both
 * sides are hashed first, so the comparison always walks 32 bytes and the
 * length of the candidate tells an attacker nothing either.
 */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** True when `candidate` is the configured dashboard password. */
export async function passwordMatches(
  candidate: string,
  expected: string | undefined = dashboardPassword()
): Promise<boolean> {
  // Still hash both sides when unset, so "no password configured" and "wrong
  // password" take the same time. Unset also means: nothing can match.
  const matches = await constantTimeEqual(candidate, expected ?? "");
  return expected === undefined ? false : matches;
}

/** Reads the session cookie and validates it. Server-side callers only. */
export async function hasSession(): Promise<boolean> {
  if (authDisabled()) return true;
  const { cookies } = await import("next/headers");
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(value);
}

/**
 * The real gate (plan §5.3). The proxy is optimistic and a matcher change can
 * silently stop covering a route, so every server action re-checks here.
 */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) {
    throw new Error("Not authenticated");
  }
}

/** Cookie attributes shared by the login and logout actions. */
export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(expiresAt),
  };
}
