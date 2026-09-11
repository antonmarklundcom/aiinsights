import type { Item, NewItem } from "../db/schema";

/**
 * A tiny in-memory stand-in for the `@/db` module. No Neon credentials exist
 * in build sessions (plan §4.15), so anything that touches the database is
 * tested against this.
 *
 * It deliberately does NOT interpret Drizzle's `eq(...)` / `and(...)` condition
 * objects — reaching into their query chunks would be brittle. Every call is
 * recorded instead, and a test that needs a specific row set narrows it with
 * `selectWhere` / `updateWhere` / `deleteWhere`. S2 extends this as it writes
 * the webhook tests.
 *
 * Usage, at the top of a test file:
 *
 *   vi.mock("@/db", async () => (await import("@/test/db-mock")).dbModule());
 *   import { dbMock } from "@/test/db-mock";
 *
 *   beforeEach(() => dbMock.reset());
 *
 * The `@/*` alias resolves because O2 added `vitest.config.ts` (O1 had noted
 * its absence as the blocker here). This file's own imports stay relative so
 * it does not depend on that.
 */

export type MockRow = Partial<Item> & { id: number };

/** Stands in for the Drizzle condition we don't parse; `null` means "all rows". */
type RowFilter = ((row: MockRow) => boolean) | null;

export type SelectCall = { op: "select"; where?: unknown; orderBy?: unknown[]; limit?: number };
export type InsertCall = { op: "insert"; values: Partial<NewItem>; returned: MockRow };
export type UpdateCall = {
  op: "update";
  set: Record<string, unknown>;
  where?: unknown;
  affected: number[];
};
export type DeleteCall = { op: "delete"; where?: unknown; affected: number[] };
export type DbCall = SelectCall | InsertCall | UpdateCall | DeleteCall;

/**
 * Drizzle's builders only hit the database when awaited. These mirror that:
 * the side effect runs on `then`, not when the chain is built.
 */
type Awaitable<T> = { then: Promise<T>["then"] };

function awaitable<T>(run: () => T): Awaitable<T> {
  return { then: (onFulfilled, onRejected) => Promise.resolve(run()).then(onFulfilled, onRejected) };
}

export class DbMock {
  rows: MockRow[] = [];
  calls: DbCall[] = [];

  selectWhere: RowFilter = null;
  updateWhere: RowFilter = null;
  deleteWhere: RowFilter = null;

  /** Next id handed out by `insert`. */
  nextId = 1;
  /** When set, `insert` throws it — e.g. a simulated unique violation. */
  insertError: unknown = null;

  reset(): void {
    this.rows = [];
    this.calls = [];
    this.selectWhere = null;
    this.updateWhere = null;
    this.deleteWhere = null;
    this.nextId = 1;
    this.insertError = null;
  }

  seed(rows: MockRow[]): void {
    this.rows = rows.map((row) => ({ ...row }));
    for (const row of rows) this.nextId = Math.max(this.nextId, row.id + 1);
  }

  /** A seeded row by id, asserted to exist. */
  row(id: number): MockRow {
    const found = this.rows.find((r) => r.id === id);
    if (!found) throw new Error(`db-mock: no row with id ${id}`);
    return found;
  }

  /** Recorded calls of one kind, for assertions. */
  callsOf<K extends DbCall["op"]>(op: K): Extract<DbCall, { op: K }>[] {
    return this.calls.filter((call): call is Extract<DbCall, { op: K }> => call.op === op);
  }

  private matching(filter: RowFilter): MockRow[] {
    return filter ? this.rows.filter(filter) : [...this.rows];
  }

  /** The object substituted for the real `db`. */
  get db() {
    return {
      select: () => this.selectChain(),
      insert: () => ({ values: (values: Partial<NewItem>) => this.insertChain(values) }),
      update: () => ({ set: (values: Record<string, unknown>) => this.updateChain(values) }),
      delete: () => this.deleteChain(),
    };
  }

  private selectChain() {
    const call: SelectCall = { op: "select" };
    const chain = {
      from: () => chain,
      where: (where: unknown) => {
        call.where = where;
        return chain;
      },
      orderBy: (...orderBy: unknown[]) => {
        call.orderBy = orderBy;
        return chain;
      },
      limit: (limit: number) => {
        call.limit = limit;
        return chain;
      },
      then: awaitable(() => {
        this.calls.push(call);
        const rows = this.matching(this.selectWhere);
        return call.limit === undefined ? rows : rows.slice(0, call.limit);
      }).then,
    };
    return chain;
  }

  private insertChain(values: Partial<NewItem>) {
    const run = (): MockRow => {
      if (this.insertError) throw this.insertError;
      const row: MockRow = {
        status: "pending",
        attempts: 0,
        implemented: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...values,
        id: this.nextId++,
      } as MockRow;
      this.rows.push(row);
      this.calls.push({ op: "insert", values, returned: row });
      return row;
    };
    return {
      returning: async () => [run()],
      then: awaitable<void>(() => {
        run();
      }).then,
    };
  }

  private updateChain(values: Record<string, unknown>) {
    const run = (where?: unknown): MockRow[] => {
      const affected = this.matching(this.updateWhere);
      for (const row of affected) Object.assign(row, values);
      this.calls.push({ op: "update", set: values, where, affected: affected.map((r) => r.id) });
      return affected;
    };
    return {
      // `.where(...)` is awaitable on its own and also chains into
      // `.returning()`, mirroring Drizzle — `process-item.ts` needs the
      // updated row back (added by O2).
      where: (where: unknown) => ({
        ...awaitable<void>(() => {
          run(where);
        }),
        returning: async () => run(where),
      }),
      then: awaitable<void>(() => run()).then,
    };
  }

  private deleteChain() {
    const run = (where?: unknown) => {
      const affected = this.matching(this.deleteWhere);
      const ids = new Set(affected.map((r) => r.id));
      this.rows = this.rows.filter((row) => !ids.has(row.id));
      this.calls.push({ op: "delete", where, affected: [...ids] });
    };
    return {
      where: (where: unknown) => awaitable<void>(() => run(where)),
      then: awaitable<void>(() => run()).then,
    };
  }
}

/** Shared instance the mocked `@/db` module hands out. */
export const dbMock = new DbMock();

/** Factory to pass to `vi.mock`; see the usage note above. */
export function dbModule(): { db: DbMock["db"] } {
  return {
    get db() {
      return dbMock.db;
    },
  };
}
