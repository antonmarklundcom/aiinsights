import { ilike, or, sql, type SQL } from "drizzle-orm";
import { items } from "@/db/schema";

/** Below this length a `tsquery` has too little to work with, so the dashboard
 * falls back to substring matching (plan §6.4). */
const MIN_TSQUERY_LENGTH = 3;

/** Escapes ILIKE wildcards (`%`, `_`) so a literal search string can't be
 * turned into a wildcard pattern by whoever types it. */
export function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Search condition for the dashboard's `q` param. Postgres full-text search
 * (`websearch_to_tsquery` against the generated `search` column) for queries
 * of `MIN_TSQUERY_LENGTH`+ characters; below that, an escaped `ILIKE` across
 * title/summary/url — the pre-S4 behavior, kept for short/typo-prone queries
 * a tsquery would rank poorly or reject outright.
 */
export function buildSearchCondition(q: string): SQL | undefined {
  const trimmed = q.trim();
  if (!trimmed) return undefined;

  if (trimmed.length < MIN_TSQUERY_LENGTH) {
    const pattern = `%${escapeIlike(trimmed)}%`;
    return or(ilike(items.title, pattern), ilike(items.summary, pattern), ilike(items.url, pattern));
  }

  return sql`${items.search} @@ websearch_to_tsquery('simple', ${trimmed})`;
}

/** Relevance rank for the current query, for callers that want to order by
 * it instead of (or alongside) recency. `0` outside the tsquery branch, so it
 * sorts consistently when mixed with rows matched by the ILIKE fallback. */
export function searchRank(q: string): SQL<number> {
  const trimmed = q.trim();
  if (trimmed.length < MIN_TSQUERY_LENGTH) return sql<number>`0`;
  return sql<number>`ts_rank(${items.search}, websearch_to_tsquery('simple', ${trimmed}))`;
}
