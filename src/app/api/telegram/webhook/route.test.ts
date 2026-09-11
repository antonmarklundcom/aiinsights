import { beforeEach, describe, expect, it, vi } from "vitest";

const WEBHOOK_SECRET = "s3cret";
const CHAT_ID = 4242;

vi.mock("@/lib/env", () => ({
  env: { TELEGRAM_WEBHOOK_SECRET: WEBHOOK_SECRET, TELEGRAM_ALLOWED_CHAT_ID: String(CHAT_ID) },
}));

vi.mock("@/db", async () => (await import("@/test/db-mock")).dbModule());

const sendTelegramMessage = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/telegram", () => ({ sendTelegramMessage }));

const processItem = vi.fn().mockResolvedValue({ item: { url: "u" }, needsNote: false });
vi.mock("@/lib/process-item", () => ({ processItem }));

/** Captures the `after()` callbacks without running them. */
const afterCallbacks: Array<() => unknown> = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    afterCallbacks.push(cb);
  },
}));

const { POST } = await import("./route");
const { dbMock } = await import("@/test/db-mock");

function request(body: unknown, secret: string | null = WEBHOOK_SECRET): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-telegram-bot-api-secret-token"] = secret;
  return new Request("https://example.com/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function update(text: string, chatId = CHAT_ID, messageId = 1) {
  return { message: { message_id: messageId, chat: { id: chatId }, text } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const post = (req: Request) => POST(req as any);

beforeEach(() => {
  dbMock.reset();
  afterCallbacks.length = 0;
  sendTelegramMessage.mockClear();
  processItem.mockClear();
});

describe("auth", () => {
  it("rejects a wrong secret", async () => {
    expect((await post(request(update("https://a.test/1"), "nope"))).status).toBe(401);
  });

  it("fails closed when no secret is configured", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({ env: { TELEGRAM_WEBHOOK_SECRET: undefined } }));
    const { POST: freshPost } = await import("./route");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await freshPost(request(update("https://a.test/1"), null) as any);
    expect(res.status).toBe(401);
    vi.doUnmock("@/lib/env");
    vi.resetModules();
  });

  it("ignores a chat that is not the allowed one, without replying", async () => {
    const res = await post(request(update("https://a.test/1", 999)));
    expect(res.status).toBe(200);
    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(dbMock.callsOf("insert")).toHaveLength(0);
  });
});

describe("a new link", () => {
  it("returns 200 and defers processing to after()", async () => {
    const res = await post(request(update("https://a.test/1")));

    // The response resolves with the item saved and nothing processed yet.
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(dbMock.callsOf("insert")).toHaveLength(1);
    expect(processItem).not.toHaveBeenCalled();

    // ...and the work is queued behind the response.
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(processItem).toHaveBeenCalledWith(dbMock.callsOf("insert")[0].returned.id, {});
  });

  it("strips tracking params from the content link and the repo link", async () => {
    await post(
      request(
        update(
          "https://instagram.com/p/abc?igshid=1 https://github.com/o/r?utm_source=ig cool tool"
        )
      )
    );

    const [insert] = dbMock.callsOf("insert");
    expect(insert.values.url).toBe("https://instagram.com/p/abc");
    expect(insert.values.repoUrl).toBe("https://github.com/o/r");
    expect(insert.values.userNote).toBe("cool tool");
  });
});

describe("dedupe by url", () => {
  it("replies with the existing item and inserts nothing", async () => {
    dbMock.seed([{ id: 7, url: "https://a.test/1", title: "Already here" }]);

    const res = await post(request(update("https://a.test/1?utm_source=x")));

    expect(res.status).toBe(200);
    expect(dbMock.callsOf("insert")).toHaveLength(0);
    expect(afterCallbacks).toHaveLength(0);
    expect(sendTelegramMessage.mock.calls[0][1]).toMatch(/already saved/i);
    expect(sendTelegramMessage.mock.calls[0][1]).toContain("Already here");
  });

  it("looks the item up by the cleaned url", async () => {
    await post(request(update("https://a.test/1?utm_source=x")));
    // The select ran before the insert, and the insert used the same cleaned url.
    expect(dbMock.calls[0].op).toBe("select");
    expect(dbMock.callsOf("insert")[0].values.url).toBe("https://a.test/1");
  });
});

describe("unique violation on (chat_id, message_id)", () => {
  /** What Drizzle throws: its own error wrapping the Neon one that carries the code. */
  function drizzleUniqueViolation() {
    const neon = Object.assign(new Error("duplicate key value violates unique constraint"), {
      name: "NeonDbError",
      code: "23505",
      constraint: "items_telegram_message_idx",
    });
    return Object.assign(new Error("Failed query: insert into items"), { cause: neon });
  }

  it("acknowledges a Telegram retry silently", async () => {
    dbMock.insertError = drizzleUniqueViolation();

    const res = await post(request(update("https://a.test/1")));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    // No second "Saved, digging in…", no second processing run.
    expect(sendTelegramMessage).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0);
  });

  it("does not swallow an unrelated database error", async () => {
    dbMock.insertError = Object.assign(new Error("connection reset"), { code: "08006" });
    await expect(post(request(update("https://a.test/1")))).rejects.toThrow(/connection reset/);
  });
});

describe("a bare note", () => {
  it("attaches it to the newest item waiting for one and forces a re-run", async () => {
    dbMock.seed([{ id: 9, url: "https://a.test/9", status: "needs_note" }]);

    const res = await post(request(update("it's a screen recorder")));

    expect(res.status).toBe(200);
    expect(dbMock.callsOf("update")[0].set.userNote).toBe("it's a screen recorder");
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(processItem).toHaveBeenCalledWith(9, { force: true });
  });

  it("falls back to help text when nothing is waiting", async () => {
    const res = await post(request(update("hello")));
    expect(res.status).toBe(200);
    expect(sendTelegramMessage.mock.calls[0][1]).toMatch(/send me any link/i);
    expect(sendTelegramMessage.mock.calls[0][1]).not.toMatch(/instagram or youtube/i);
  });
});
