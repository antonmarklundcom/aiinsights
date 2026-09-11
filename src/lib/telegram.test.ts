import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { TELEGRAM_BOT_TOKEN: "t" } }));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const { truncateForTelegram, sendTelegramMessage, MAX_MESSAGE_CHARS } = await import(
  "@/lib/telegram"
);

describe("truncateForTelegram", () => {
  it("leaves a short message alone", () => {
    expect(truncateForTelegram("hi")).toBe("hi");
  });

  it("cuts at a line boundary so HTML tags stay whole", () => {
    const body = `<b>Title</b>\n\n${"word ".repeat(1200)}\n<i>trailing</i>`;
    const out = truncateForTelegram(body);

    expect(out.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    expect(out.endsWith("…")).toBe(true);
    // Whatever survived is balanced: no half-written tag at the end.
    expect(out).not.toMatch(/<[^>]*$/);
    expect((out.match(/<b>/g) ?? []).length).toBe((out.match(/<\/b>/g) ?? []).length);
  });

  it("drops a partial tag when there is no usable line boundary", () => {
    const out = truncateForTelegram(`${"x".repeat(MAX_MESSAGE_CHARS - 2)}<b>bold</b>`);
    expect(out).not.toMatch(/<[^>]*$/);
    expect(out.endsWith("…")).toBe(true);
  });

  it("never exceeds the limit", () => {
    expect(truncateForTelegram("y".repeat(50_000)).length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
  });
});

describe("sendTelegramMessage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function jsonRes(body: unknown, status = 200): Response {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    } as Response;
  }

  it("returns true and sends the truncated, HTML-mode payload on success", async () => {
    fetchMock.mockResolvedValue(jsonRes({ ok: true }));

    const ok = await sendTelegramMessage(42, "hi there", { replyToMessageId: 7 });

    expect(ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/sendMessage");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      chat_id: 42,
      text: "hi there",
      reply_to_message_id: 7,
      parse_mode: "HTML",
    });
  });

  it("logs and returns false on a non-2xx status", async () => {
    fetchMock.mockResolvedValue(jsonRes({ ok: false, description: "chat not found" }, 400));

    const ok = await sendTelegramMessage(42, "hi");

    expect(ok).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/sendMessage failed.*chat not found/)
    );
  });

  it("treats ok: false on an HTTP 200 as a failure too", async () => {
    fetchMock.mockResolvedValue(jsonRes({ ok: false, description: "bot was blocked" }, 200));

    expect(await sendTelegramMessage(42, "hi")).toBe(false);
  });

  it("returns false without throwing when the request itself fails", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    expect(await sendTelegramMessage(42, "hi")).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it("returns false when the response body isn't json, using the raw text as the description", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, text: async () => "Bad Gateway" } as Response);

    expect(await sendTelegramMessage(42, "hi")).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringMatching(/sendMessage failed.*Bad Gateway/)
    );
  });
});
