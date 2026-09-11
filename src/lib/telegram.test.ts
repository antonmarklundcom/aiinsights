import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { TELEGRAM_BOT_TOKEN: "t" } }));

const { truncateForTelegram, MAX_MESSAGE_CHARS } = await import("@/lib/telegram");

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
