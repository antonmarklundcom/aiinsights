import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => (await import("@/test/db-mock")).dbModule());

const summarizeItem = vi.fn();
vi.mock("@/lib/summarize", () => ({ summarizeItem }));

vi.mock("@/lib/youtube", () => ({ fetchYoutubeMeta: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/page-meta", () => ({ fetchPageMeta: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/github", () => ({ fetchRepoReadme: vi.fn().mockResolvedValue(null) }));

const { processItem, MAX_ATTEMPTS, MaxAttemptsError } = await import("@/lib/process-item");
const { dbMock } = await import("@/test/db-mock");

const SUMMARY = {
  output: {
    title: "A tool",
    summary: "Does a thing.",
    category: "ai-coding-tool" as const,
    tags: ["cli"],
    howToStart: ["npm i"],
  },
  usage: { model: "claude-opus-5", inputTokens: 100, outputTokens: 20 },
};

/** An item with enough content that it goes to the summarizer. */
function seedItem(overrides: Record<string, unknown> = {}) {
  dbMock.seed([
    {
      id: 1,
      url: "https://a.test/1",
      platform: "other",
      userNote: "a note",
      attempts: 0,
      ...overrides,
    },
  ]);
}

beforeEach(() => {
  dbMock.reset();
  summarizeItem.mockReset();
  summarizeItem.mockResolvedValue(SUMMARY);
});

describe("the attempt ceiling", () => {
  it(`refuses once attempts have reached ${MAX_ATTEMPTS}`, async () => {
    seedItem({ attempts: MAX_ATTEMPTS });

    await expect(processItem(1)).rejects.toBeInstanceOf(MaxAttemptsError);

    // It refuses before touching the row — no wasted attempt, no status churn.
    expect(dbMock.callsOf("update")).toHaveLength(0);
    expect(summarizeItem).not.toHaveBeenCalled();
  });

  it("still runs on the last allowed attempt", async () => {
    seedItem({ attempts: MAX_ATTEMPTS - 1 });
    await expect(processItem(1)).resolves.toMatchObject({ needsNote: false });
    expect(summarizeItem).toHaveBeenCalled();
  });

  it("force bypasses the ceiling", async () => {
    seedItem({ attempts: MAX_ATTEMPTS + 5 });

    await expect(processItem(1, { force: true })).resolves.toMatchObject({ needsNote: false });

    expect(summarizeItem).toHaveBeenCalled();
    expect(dbMock.row(1).attempts).toBe(MAX_ATTEMPTS + 6);
  });
});

describe("attempt bookkeeping", () => {
  it("claims the item before doing any slow work", async () => {
    seedItem();
    const before = Date.now();

    await processItem(1);

    const claim = dbMock.callsOf("update")[0];
    expect(claim.set.status).toBe("processing");
    expect(claim.set.attempts).toBe(1);
    expect((claim.set.lastAttemptAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("records the model and token usage on success", async () => {
    seedItem();

    const { item } = await processItem(1);

    expect(item.status).toBe("done");
    expect(item.aiModel).toBe("claude-opus-5");
    expect(item.aiInputTokens).toBe(100);
    expect(item.aiOutputTokens).toBe(20);
    expect(item.category).toBe("ai-coding-tool");
    expect(item.processingError).toBeNull();
  });

  it("keeps the attempt and records the error on failure", async () => {
    seedItem();
    summarizeItem.mockRejectedValue(new Error("Claude is down"));

    await expect(processItem(1)).rejects.toThrow("Claude is down");

    expect(dbMock.row(1).status).toBe("failed");
    expect(dbMock.row(1).processingError).toBe("Claude is down");
    // The attempt still counted, which is what eventually stops the retries.
    expect(dbMock.row(1).attempts).toBe(1);
  });

  it("keeps the needs_note path", async () => {
    seedItem({ userNote: null });

    const { item, needsNote } = await processItem(1);

    expect(needsNote).toBe(true);
    expect(item.status).toBe("needs_note");
    expect(summarizeItem).not.toHaveBeenCalled();
    // It still counts as an attempt.
    expect(dbMock.row(1).attempts).toBe(1);
  });

  it("throws for an unknown item", async () => {
    await expect(processItem(404)).rejects.toThrow(/not found/i);
  });
});

/* == S3 == */
describe("the image_file_id rule", () => {
  it("counts a screenshot alone as content and skips needs_note", async () => {
    seedItem({ userNote: null, imageFileId: "file123" });

    const { item, needsNote } = await processItem(1);

    expect(needsNote).toBe(false);
    expect(item.status).toBe("done");
    expect(summarizeItem).toHaveBeenCalled();
  });

  it("passes the image_file_id through to the summarizer", async () => {
    seedItem({ userNote: null, imageFileId: "file123" });

    await processItem(1);

    expect(summarizeItem.mock.calls[0][0]).toMatchObject({ imageFileId: "file123" });
  });
});
/* == S3 == */
