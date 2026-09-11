/**
 * Hand-rolled environment validation (no zod — plan §5.1).
 *
 * Reading any key validates the whole set once and throws a single error
 * listing every missing key. Validation is lazy so that tooling which does
 * not need a database (e.g. `drizzle-kit generate`) can import this module.
 */

/** Required in every environment — the app cannot function without these. */
const ALWAYS_REQUIRED = ["DATABASE_URL", "ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN"] as const;

/**
 * Required in production only. Missing in development is a warning, not a
 * crash (plan §4.5) — you can run the dashboard locally without a bot secret.
 */
const PRODUCTION_REQUIRED = [
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_ALLOWED_CHAT_ID",
  "DASHBOARD_PASSWORD",
  "CRON_SECRET",
  "AUTH_COOKIE_SECRET",
] as const;

/** Nice to have, never required. */
const OPTIONAL = ["GITHUB_TOKEN"] as const;

type AlwaysKey = (typeof ALWAYS_REQUIRED)[number];
type ProdKey = (typeof PRODUCTION_REQUIRED)[number];
type OptionalKey = (typeof OPTIONAL)[number];

export type Env = { [K in AlwaysKey]: string } & {
  [K in ProdKey | OptionalKey]: string | undefined;
} & { isProduction: boolean };

type Source = Record<string, string | undefined>;

export class EnvError extends Error {
  constructor(missing: readonly string[]) {
    super(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Add them to .env (see .env.example) or to your deployment's environment.`
    );
    this.name = "EnvError";
  }
}

/** Pure, testable core. Throws `EnvError` listing every missing key at once. */
export function loadEnv(source: Source = process.env): Env {
  const isProduction = source.NODE_ENV === "production";
  const value = (key: string) => {
    const raw = source[key];
    return raw === undefined || raw.trim() === "" ? undefined : raw;
  };

  const missing = ALWAYS_REQUIRED.filter((key) => value(key) === undefined) as string[];
  const missingInProd = PRODUCTION_REQUIRED.filter((key) => value(key) === undefined);
  if (isProduction) missing.push(...missingInProd);
  if (missing.length > 0) throw new EnvError(missing);

  if (missingInProd.length > 0) {
    console.warn(
      `[env] Not set (required in production, ignored here): ${missingInProd.join(", ")}`
    );
  }

  const resolved = { isProduction } as Record<string, unknown>;
  for (const key of [...ALWAYS_REQUIRED, ...PRODUCTION_REQUIRED, ...OPTIONAL]) {
    resolved[key] = value(key);
  }
  return resolved as Env;
}

let cached: Env | undefined;

/** Validated env, computed on first access and memoised. */
export function getEnv(): Env {
  return (cached ??= loadEnv());
}

/** Resets the memoised value. Tests only. */
export function resetEnvCache(): void {
  cached = undefined;
}

/**
 * The single `env` object the app reads. A proxy so that importing this
 * module never throws — only touching a key does.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_target, key: string) => getEnv()[key as keyof Env],
  has: (_target, key: string) => key in getEnv(),
  ownKeys: () => Reflect.ownKeys(getEnv()),
  getOwnPropertyDescriptor: (_target, key: string) => ({
    value: getEnv()[key as keyof Env],
    enumerable: true,
    configurable: true,
  }),
});
