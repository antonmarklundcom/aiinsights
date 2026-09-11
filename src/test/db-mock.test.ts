import { beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq } from "drizzle-orm";

vi.mock("../db", async () => (await import("./db-mock")).dbModule());

import { db } from "../db";
import { items } from "../db/schema";
import { dbMock } from "./db-mock";

/**
 * The mock is the substrate every later DB-touching test sits on (plan §4.15),
 * so its chain contract is pinned here. S2 extends both.
 */
describe("db-mock", () => {
  beforeEach(() => dbMock.reset());

  it("stands in for the real @/db module", async () => {
    const [created] = await db
      .insert(items)
      .values({ url: "https://example.com/a", platform: "other" })
      .returning();

    expect(created.id).toBe(1);
    expect(created.status).toBe("pending");
    expect(created.attempts).toBe(0);
    expect(dbMock.rows).toHaveLength(1);
  });

  it("records the select chain and honours limit", async () => {
    dbMock.seed([
      { id: 1, url: "https://a", status: "needs_note" },
      { id: 2, url: "https://b", status: "done" },
    ]);

    const rows = await db
      .select()
      .from(items)
      .where(eq(items.status, "needs_note"))
      .orderBy(desc(items.createdAt))
      .limit(1);

    expect(rows).toHaveLength(1);
    const [call] = dbMock.callsOf("select");
    expect(call.limit).toBe(1);
    expect(call.where).toBeDefined();
    expect(call.orderBy).toHaveLength(1);
  });

  it("narrows rows through selectWhere, since Drizzle conditions are not parsed", async () => {
    dbMock.seed([
      { id: 1, status: "needs_note" },
      { id: 2, status: "done" },
    ]);
    dbMock.selectWhere = (row) => row.status === "done";

    const rows = await db.select().from(items).where(eq(items.status, "done"));
    expect(rows.map((r) => r.id)).toEqual([2]);
  });

  it("applies updates and reports which rows were touched", async () => {
    dbMock.seed([{ id: 7, userNote: null }]);
    dbMock.updateWhere = (row) => row.id === 7;

    await db.update(items).set({ userNote: "a repo that does X" }).where(eq(items.id, 7));

    expect(dbMock.row(7).userNote).toBe("a repo that does X");
    expect(dbMock.callsOf("update")[0].affected).toEqual([7]);
  });

  it("deletes rows", async () => {
    dbMock.seed([{ id: 1 }, { id: 2 }]);
    dbMock.deleteWhere = (row) => row.id === 1;

    await db.delete(items).where(eq(items.id, 1));

    expect(dbMock.rows.map((r) => r.id)).toEqual([2]);
  });

  it("can simulate a unique violation on insert", async () => {
    dbMock.insertError = Object.assign(new Error("duplicate key value"), { code: "23505" });

    await expect(
      db.insert(items).values({ url: "https://a", platform: "other" }).returning()
    ).rejects.toThrow(/duplicate key/);
    expect(dbMock.rows).toHaveLength(0);
  });

  it("seeds ids without colliding on the next insert", async () => {
    dbMock.seed([{ id: 9 }]);
    const [created] = await db.insert(items).values({ url: "https://z", platform: "other" }).returning();
    expect(created.id).toBe(10);
  });
});
