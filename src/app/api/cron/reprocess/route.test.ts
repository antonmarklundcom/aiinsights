import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const CRON_SECRET = "cron-s3cret";

vi.mock("@/lib/env", () => ({ env: { CRON_SECRET } }));
vi.mock("@/db", async () => (await import("@/test/db-mock")).dbModule());

const processItem = vi.fn().mockResolvedValue({ item: {}, needsNote: false });
vi.mock("@/lib/process-item", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/process-item")>()),
  processItem,
}));

const { GET, BATCH_SIZE, STUCK_AFTER_MS } = await import("./route");
const { dbMock } = await import("@/test/db-mock");
const { MAX_ATTEMPTS } = await import("@/lib/process-item");

function request(auth: string | null = `Bearer ${CRON_SECRET}`): Request {
  return new Request("https://example.com/api/cron/reprocess", {
    headers: auth === null ? {} : { authorization: auth },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = (req: Request) => GET(req as any);

/** Renders the recorded Drizzle condition as SQL so the rule can be asserted. */
function whereSql(): { sql: string; params: unknown[] } {
  const where = dbMock.callsOf("select")[0].where as SQL;
  const query = new PgDialect().sqlToQuery(where);
  return { sql: query.sql, params: query.params };
}

beforeEach(() => {
  dbMock.reset();
  processItem.mockClear();
});

describe("auth", () => {
  it("requires the bearer token", async () => {
    expect((await get(request(null))).status).toBe(401);
    expect((await get(request("Bearer wrong"))).status).toBe(401);
    expect((await get(request(CRON_SECRET))).status).toBe(401);
  });

  it("fails closed when CRON_SECRET is unset", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({ env: { CRON_SECRET: undefined } }));
    const { GET: freshGet } = await import("./route");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((await freshGet(request(null) as any)).status).toBe(401);
    vi.doUnmock("@/lib/env");
    vi.resetModules();
  });

  it("accepts the right token", async () => {
    expect((await get(request())).status).toBe(200);
  });
});

describe("selection rule", () => {
  it("takes only pending/processing items", async () => {
    await get(request());
    const { sql, params } = whereSql();
    expect(sql).toMatch(/"status" in \(/);
    expect(params).toContain("pending");
    expect(params).toContain("processing");
    expect(params).not.toContain("done");
    expect(params).not.toContain("failed");
  });

  it("takes only items below the attempt ceiling", async () => {
    await get(request());
    const { sql, params } = whereSql();
    expect(sql).toMatch(/"attempts" < \$\d/);
    expect(params).toContain(MAX_ATTEMPTS);
  });

  it("takes items never attempted, or last attempted over 10 minutes ago", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-11T12:00:00.000Z"));
    await get(request());
    vi.useRealTimers();

    const { sql, params } = whereSql();
    expect(STUCK_AFTER_MS).toBe(10 * 60 * 1000);
    expect(sql).toMatch(/"last_attempt_at" is null or .*"last_attempt_at" < \$\d/);

    // The only string parameter that parses as a timestamp is the cutoff.
    const cutoff = params
      .filter((p): p is string => typeof p === "string")
      .map((p) => new Date(p))
      .find((d) => !Number.isNaN(d.getTime()));
    expect(cutoff?.toISOString()).toBe("2026-09-11T11:50:00.000Z");
  });

  it("takes the oldest first, at most one batch", async () => {
    await get(request());
    const [select] = dbMock.callsOf("select");
    expect(select.limit).toBe(BATCH_SIZE);
    expect(BATCH_SIZE).toBe(10);
    expect(new PgDialect().sqlToQuery(select.orderBy![0] as SQL).sql).toMatch(
      /"last_attempt_at" asc/
    );
  });
});

describe("processing", () => {
  it("re-runs each selected item without forcing past the ceiling", async () => {
    dbMock.seed([{ id: 1 }, { id: 2 }]);

    const res = await get(request());

    expect(processItem).toHaveBeenCalledTimes(2);
    expect(processItem).toHaveBeenNthCalledWith(1, 1);
    await expect(res.json()).resolves.toEqual({ ok: true, selected: 2, processed: 2, failed: 0 });
  });

  it("counts a failure and keeps going", async () => {
    dbMock.seed([{ id: 1 }, { id: 2 }]);
    processItem.mockRejectedValueOnce(new Error("Claude is down"));

    const res = await get(request());

    expect(processItem).toHaveBeenCalledTimes(2);
    await expect(res.json()).resolves.toEqual({ ok: true, selected: 2, processed: 1, failed: 1 });
  });

  it("reports zero when nothing is stuck", async () => {
    const res = await get(request());
    await expect(res.json()).resolves.toEqual({ ok: true, selected: 0, processed: 0, failed: 0 });
  });
});
