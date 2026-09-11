/** Postgres `unique_violation`. */
export const UNIQUE_VIOLATION = "23505";

/**
 * Drizzle wraps driver failures in a `DrizzleQueryError` and hangs the real
 * `NeonDbError` (which carries Postgres' `code`) off `cause`, so the code has
 * to be looked for down the chain rather than on the thrown error itself.
 */
export function isUniqueViolation(err: unknown): boolean {
  for (let current = err, depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && "code" in current) {
      if ((current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    }
    current = (current as { cause?: unknown })?.cause;
  }
  return false;
}
