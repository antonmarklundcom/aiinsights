import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildSearchCondition, escapeIlike, searchRank } from "./search";

const dialect = new PgDialect();

describe("escapeIlike", () => {
  it("escapes ILIKE wildcards", () => {
    expect(escapeIlike("100%_off")).toBe("100\\%\\_off");
  });

  it("escapes an existing backslash before the wildcard escapes are added", () => {
    expect(escapeIlike("a\\b")).toBe("a\\\\b");
  });

  it("leaves plain text untouched", () => {
    expect(escapeIlike("agent")).toBe("agent");
  });
});

describe("buildSearchCondition", () => {
  it("returns undefined for a blank query", () => {
    expect(buildSearchCondition("   ")).toBeUndefined();
  });

  it("falls back to an escaped ILIKE across title/summary/url under 3 characters", () => {
    const { sql, params } = dialect.sqlToQuery(buildSearchCondition("a%")!);
    expect(sql).toBe('("items"."title" ilike $1 or "items"."summary" ilike $2 or "items"."url" ilike $3)');
    expect(params).toEqual(["%a\\%%", "%a\\%%", "%a\\%%"]);
  });

  it("uses websearch_to_tsquery against the generated search column at 3+ characters", () => {
    const { sql, params } = dialect.sqlToQuery(buildSearchCondition("agent tools")!);
    expect(sql).toBe(`"items"."search" @@ websearch_to_tsquery('simple', $1)`);
    expect(params).toEqual(["agent tools"]);
  });

  it("trims before deciding which branch to take", () => {
    const { sql, params } = dialect.sqlToQuery(buildSearchCondition("  ai  ")!);
    expect(sql).toContain("ilike");
    expect(params).toEqual(["%ai%", "%ai%", "%ai%"]);
  });
});

describe("searchRank", () => {
  it("is a constant 0 under the tsquery threshold", () => {
    expect(dialect.sqlToQuery(searchRank("ai")).sql).toBe("0");
  });

  it("ranks with ts_rank at 3+ characters", () => {
    const { sql, params } = dialect.sqlToQuery(searchRank("agent tools"));
    expect(sql).toBe(`ts_rank("items"."search", websearch_to_tsquery('simple', $1))`);
    expect(params).toEqual(["agent tools"]);
  });
});
