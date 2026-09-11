import { afterEach, describe, expect, it, vi } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/auth";
import { config, isExempt, proxy } from "./proxy";

const SECRET = "proxy-test-secret";

/** Turn the password on; without one the dashboard is deliberately open (§5.3). */
function withAuth() {
  vi.stubEnv("DASHBOARD_PASSWORD", "hunter2");
  vi.stubEnv("AUTH_COOKIE_SECRET", SECRET);
}

function request(path: string, cookie?: string) {
  const req = new NextRequest(new URL(path, "https://ai.example.com"));
  if (cookie !== undefined) req.cookies.set("ai_session", cookie);
  return req;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * `unstable_doesMiddlewareMatch` is the runtime name in Next 16.3.3; the docs
 * call it `unstable_doesProxyMatch`. Same helper, and it reads the same
 * `config.matcher` the build does.
 */
describe("matcher", () => {
  it("runs on app routes, including the api routes it then exempts in code", () => {
    for (const url of ["/", "/items/12", "/login", "/api/telegram/webhook", "/api/cron/reprocess"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    }
  });

  it("skips build output and the favicon", () => {
    for (const url of ["/_next/static/chunks/main.js", "/_next/image", "/favicon.ico"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
    }
  });
});

describe("isExempt", () => {
  it("exempts exactly the paths plan §5.3 lists", () => {
    for (const path of [
      "/login",
      "/login/",
      "/api/telegram/webhook",
      "/api/cron/reprocess",
      "/_next/data/build/index.json",
      "/favicon.ico",
    ]) {
      expect(isExempt(path)).toBe(true);
    }
  });

  it("protects everything else, including look-alike prefixes", () => {
    for (const path of [
      "/",
      "/items/12",
      "/loginsomething",
      "/api/telegram-secrets",
      "/api/items",
      "/_nextdoor",
      "/favicon.ico.txt",
    ]) {
      expect(isExempt(path)).toBe(false);
    }
  });
});

describe("proxy", () => {
  it("redirects an unauthenticated request to /login with a next param", async () => {
    withAuth();
    const response = await proxy(request("/items/12?tab=notes"));
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/items/12?tab=notes");
  });

  it("lets a valid cookie through", async () => {
    withAuth();
    const cookie = await signSession(Date.now() + 60_000, SECRET);
    const response = await proxy(request("/", cookie));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("redirects an expired or tampered cookie", async () => {
    withAuth();
    const expired = await signSession(Date.now() - 1, SECRET);
    expect((await proxy(request("/", expired))).status).toBe(302);
    expect((await proxy(request("/", "1800000000000.deadbeef"))).status).toBe(302);
  });

  it("leaves the telegram webhook and the cron route reachable without a cookie", async () => {
    withAuth();
    for (const path of ["/api/telegram/webhook", "/api/cron/reprocess"]) {
      const response = await proxy(request(path));
      expect(response.headers.get("location")).toBeNull();
      expect(response.status).toBe(200);
    }
  });

  it("does not redirect /login onto itself", async () => {
    withAuth();
    expect((await proxy(request("/login?next=%2F"))).headers.get("location")).toBeNull();
  });

  it("lets everything through when no password is configured outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await proxy(request("/"))).headers.get("location")).toBeNull();
    warn.mockRestore();
  });
});
