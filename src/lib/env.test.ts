import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EnvError, loadEnv } from "./env";

const ALWAYS = {
  DATABASE_URL: "postgres://localhost/db",
  ANTHROPIC_API_KEY: "sk-ant-test",
  TELEGRAM_BOT_TOKEN: "123:abc",
};

const PRODUCTION_ONLY = {
  TELEGRAM_WEBHOOK_SECRET: "hook",
  TELEGRAM_ALLOWED_CHAT_ID: "42",
  DASHBOARD_PASSWORD: "pw",
  CRON_SECRET: "cron",
  AUTH_COOKIE_SECRET: "cookie",
};

describe("loadEnv", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns every key when everything is set", () => {
    const env = loadEnv({ ...ALWAYS, ...PRODUCTION_ONLY, GITHUB_TOKEN: "ghp", NODE_ENV: "production" });
    expect(env.DATABASE_URL).toBe(ALWAYS.DATABASE_URL);
    expect(env.DASHBOARD_PASSWORD).toBe("pw");
    expect(env.GITHUB_TOKEN).toBe("ghp");
    expect(env.isProduction).toBe(true);
  });

  it("throws when an always-required key is missing, in any environment", () => {
    expect(() => loadEnv({ ...ALWAYS, DATABASE_URL: undefined, NODE_ENV: "development" })).toThrow(
      EnvError
    );
  });

  it("lists every missing key in one error", () => {
    let message = "";
    try {
      loadEnv({ NODE_ENV: "production" });
    } catch (error) {
      message = (error as Error).message;
    }
    for (const key of [...Object.keys(ALWAYS), ...Object.keys(PRODUCTION_ONLY)]) {
      expect(message).toContain(key);
    }
  });

  it("requires the production-only keys when NODE_ENV is production", () => {
    expect(() => loadEnv({ ...ALWAYS, NODE_ENV: "production" })).toThrow(
      /TELEGRAM_WEBHOOK_SECRET.*DASHBOARD_PASSWORD/s
    );
  });

  it("only warns about the production-only keys outside production", () => {
    const env = loadEnv({ ...ALWAYS, NODE_ENV: "development" });
    expect(env.DASHBOARD_PASSWORD).toBeUndefined();
    expect(env.isProduction).toBe(false);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("treats blank and whitespace-only values as missing", () => {
    expect(() => loadEnv({ ...ALWAYS, TELEGRAM_BOT_TOKEN: "   " })).toThrow(/TELEGRAM_BOT_TOKEN/);
    const env = loadEnv({ ...ALWAYS, GITHUB_TOKEN: "", NODE_ENV: "development" });
    expect(env.GITHUB_TOKEN).toBeUndefined();
  });

  it("never requires GITHUB_TOKEN", () => {
    expect(() =>
      loadEnv({ ...ALWAYS, ...PRODUCTION_ONLY, NODE_ENV: "production" })
    ).not.toThrow();
  });
});
