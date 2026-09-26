import { beforeEach, describe, expect, it, vi } from "vitest";

const CRON_SECRET = "cron-s3cret";
vi.mock("@/lib/env", () => ({ env: { CRON_SECRET, TELEGRAM_ALLOWED_CHAT_ID: "4242" } }));
vi.mock("@/db", async () => (await import("@/test/db-mock")).dbModule());
const sendTelegramMessage = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/telegram", () => ({ sendTelegramMessage }));

const { GET } = await import("./route");
const { dbMock } = await import("@/test/db-mock");

const get = (kind: string, auth = `Bearer ${CRON_SECRET}`) =>
  GET(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Request(`https://x/api/cron/nudge?kind=${kind}`, { headers: { authorization: auth } }) as any
  );

const base = {
  status: "done",
  implemented: false,
  committedAt: null,
  lastNudgedAt: null,
  dismissedAt: null,
  createdAt: new Date(),
};

beforeEach(() => {
  dbMock.reset();
  sendTelegramMessage.mockClear();
});

describe("GET /api/cron/nudge", () => {
  it("requires the bearer token", async () => {
    expect((await get("monday", "Bearer nope")).status).toBe(401);
  });

  it("rejects an unknown kind", async () => {
    expect((await get("sunday")).status).toBe(400);
  });

  it("monday sends one message with buttons and stamps lastNudgedAt", async () => {
    dbMock.seed([{ id: 1, title: "A", url: "u1", ...base }, { id: 2, title: "B", url: "u2", ...base }]);
    const res = await get("monday");
    expect(await res.json()).toEqual({ ok: true, sent: 2 });
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage.mock.calls[0][2].buttons[0]).toHaveLength(2);
    expect(dbMock.callsOf("update")[0].set).toHaveProperty("lastNudgedAt");
  });

  it("friday asks once per open commitment", async () => {
    dbMock.seed([{ id: 1, title: "A", url: "u1", ...base, committedAt: new Date() }, { id: 2, title: "B", url: "u2", ...base }]);
    const res = await get("friday");
    expect(await res.json()).toEqual({ ok: true, sent: 1 });
  });
});
