import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_TTL_MS,
  authDisabled,
  constantTimeEqual,
  newSessionExpiry,
  passwordMatches,
  sessionSecret,
  signSession,
  verifySession,
} from "./auth";

const SECRET = "test-secret-0123456789";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signSession / verifySession", () => {
  it("accepts a cookie it just signed", async () => {
    const cookie = await signSession(Date.now() + 60_000, SECRET);
    expect(await verifySession(cookie, { secret: SECRET })).toBe(true);
  });

  it("formats the cookie as <expiresAt>.<hmac>", async () => {
    const expiresAt = 1_800_000_000_000;
    const cookie = await signSession(expiresAt, SECRET);
    const [payload, signature] = cookie.split(".");
    expect(payload).toBe(String(expiresAt));
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects a tampered expiry", async () => {
    const expiresAt = Date.now() + 60_000;
    const cookie = await signSession(expiresAt, SECRET);
    const forged = `${expiresAt + 60_000}.${cookie.split(".")[1]}`;
    expect(await verifySession(forged, { secret: SECRET })).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const cookie = await signSession(Date.now() + 60_000, SECRET);
    const [payload, signature] = cookie.split(".");
    const flipped = (signature[0] === "a" ? "b" : "a") + signature.slice(1);
    expect(await verifySession(`${payload}.${flipped}`, { secret: SECRET })).toBe(false);
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await signSession(Date.now() + 60_000, "some-other-secret");
    expect(await verifySession(cookie, { secret: SECRET })).toBe(false);
  });

  it("rejects an expired cookie", async () => {
    const expiresAt = Date.now() - 1;
    const cookie = await signSession(expiresAt, SECRET);
    expect(await verifySession(cookie, { secret: SECRET })).toBe(false);
  });

  it("treats the expiry as exclusive at the boundary", async () => {
    const expiresAt = Date.now() + 60_000;
    const cookie = await signSession(expiresAt, SECRET);
    expect(await verifySession(cookie, { secret: SECRET, now: expiresAt - 1 })).toBe(true);
    expect(await verifySession(cookie, { secret: SECRET, now: expiresAt })).toBe(false);
  });

  it("rejects missing and malformed values without throwing", async () => {
    for (const value of [
      undefined,
      null,
      "",
      "no-separator",
      ".abcdef",
      "notanumber.abcdef",
      "1800000000000.",
      "1800000000000.zzzz",
      "1800000000000.abc",
    ]) {
      expect(await verifySession(value, { secret: SECRET })).toBe(false);
    }
  });

  it("issues 30-day sessions", () => {
    const now = 1_800_000_000_000;
    expect(newSessionExpiry(now) - now).toBe(SESSION_TTL_MS);
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("constantTimeEqual", () => {
  it("compares equal and unequal secrets", async () => {
    expect(await constantTimeEqual("hunter2", "hunter2")).toBe(true);
    expect(await constantTimeEqual("hunter2", "hunter3")).toBe(false);
    expect(await constantTimeEqual("hunter2", "hunter2 ")).toBe(false);
    expect(await constantTimeEqual("", "")).toBe(true);
  });

  it("does not short-circuit on length: unequal lengths still compare 32 bytes", async () => {
    // Both sides are hashed first, so the work done is independent of the input.
    const digest = vi.spyOn(crypto.subtle, "digest");
    expect(await constantTimeEqual("a", "a-very-much-longer-candidate")).toBe(false);
    expect(digest).toHaveBeenCalledTimes(2);
    digest.mockRestore();
  });
});

describe("passwordMatches", () => {
  it("accepts the configured password and nothing else", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "correct horse");
    expect(await passwordMatches("correct horse")).toBe(true);
    expect(await passwordMatches("correct hors")).toBe(false);
    expect(await passwordMatches("")).toBe(false);
  });

  it("matches nothing when no password is configured", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    expect(await passwordMatches("")).toBe(false);
    expect(await passwordMatches("anything")).toBe(false);
  });
});

describe("environment rules", () => {
  it("opens the dashboard outside production when no password is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    expect(authDisabled()).toBe(true);

    vi.stubEnv("DASHBOARD_PASSWORD", "set");
    expect(authDisabled()).toBe(false);
  });

  it("never opens the dashboard in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    expect(authDisabled()).toBe(false);
  });

  it("refuses to sign without a secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_COOKIE_SECRET", "");
    expect(() => sessionSecret()).toThrow(/AUTH_COOKIE_SECRET/);
  });

  it("falls back to a development key outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_COOKIE_SECRET", "");
    expect(sessionSecret()).toEqual(expect.any(String));
  });

  it("verifySession returns false instead of throwing when production has no secret", async () => {
    const cookie = await signSession(Date.now() + 60_000, SECRET);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_COOKIE_SECRET", "");
    expect(await verifySession(cookie)).toBe(false);
  });
});
