import { beforeEach, describe, expect, it, vi } from "vitest";
import { ITEM_CATEGORIES } from "@/db/schema";

const create = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

vi.mock("@/lib/env", () => ({ env: { ANTHROPIC_API_KEY: "test-key" } }));

/* == S3 == */
const buildScreenshotImageBlock = vi.fn().mockResolvedValue({
  type: "image",
  source: { type: "base64", media_type: "image/jpeg", data: "abc123" },
});
vi.mock("@/lib/vision", () => ({
  buildScreenshotImageBlock,
  SCREENSHOT_INSTRUCTION: "SCREENSHOT_INSTRUCTION_TEXT",
}));
/* == S3 == */

const { summarizeItem, SUMMARY_MODEL, TRANSCRIPT_MAX_CHARS } = await import("@/lib/summarize");

/** A well-formed response from the SDK. */
function reply(overrides: Record<string, unknown> = {}) {
  return {
    model: "claude-opus-5",
    stop_reason: "tool_use",
    usage: { input_tokens: 1234, output_tokens: 56 },
    content: [
      {
        type: "tool_use",
        name: "save_summary",
        input: {
          title: "A tool",
          summary: "It does a thing.",
          category: "ai-coding-tool",
          tags: ["cli"],
          howToStart: ["npm i"],
        },
      },
    ],
    ...overrides,
  };
}

const input = { url: "https://example.com/x", platform: "other" };

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue(reply());
  /* == S3 == */
  buildScreenshotImageBlock.mockClear();
  /* == S3 == */
});

describe("summarizeItem request shape", () => {
  it("asks for the current model at low effort with no thinking param", async () => {
    await summarizeItem(input);

    const req = create.mock.calls[0][0];
    expect(req.model).toBe("claude-opus-5");
    expect(SUMMARY_MODEL).toBe("claude-opus-5");
    expect(req.output_config).toEqual({ effort: "low" });
    // Adaptive thinking is the Opus 5 default; passing `thinking` at all is
    // what plan §1.5 forbids.
    expect(req).not.toHaveProperty("thinking");
  });

  it("enables server-side refusal fallbacks", async () => {
    await summarizeItem(input);

    const req = create.mock.calls[0][0];
    expect(req.betas).toContain("server-side-fallback-2026-07-01");
    expect(req.fallbacks).toBe("default");
  });

  it("sends a strict tool whose category is the schema's enum", async () => {
    await summarizeItem(input);

    const [tool] = create.mock.calls[0][0].tools;
    expect(tool.name).toBe("save_summary");
    expect(tool.strict).toBe(true);
    expect(tool.input_schema.additionalProperties).toBe(false);
    expect(tool.input_schema.properties.category.enum).toEqual([...ITEM_CATEGORIES]);
    expect(tool.input_schema.required).toEqual([
      "title",
      "summary",
      "category",
      "tags",
      "howToStart",
    ]);
    expect(create.mock.calls[0][0].tool_choice).toEqual({ type: "tool", name: "save_summary" });
  });

  it("puts the cached instructions in system and the item in the user turn", async () => {
    await summarizeItem({ ...input, caption: "a caption about widgets" });

    const req = create.mock.calls[0][0];
    expect(req.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(req.system[0].text).toMatch(/still write every field in English/i);
    expect(req.system[0].text).not.toContain("a caption about widgets");

    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe("user");
    expect(req.messages[0].content).toContain("a caption about widgets");
  });

  it("caps the transcript and says so in the user turn", async () => {
    const transcript = "x".repeat(TRANSCRIPT_MAX_CHARS + 500);
    await summarizeItem({ ...input, transcript });

    const content: string = create.mock.calls[0][0].messages[0].content;
    expect(content).toContain("(truncated)");
    // `x{100,}` rather than `x+` — the source URL ends in a lone "x".
    expect(content.match(/x{100,}/)![0]).toHaveLength(TRANSCRIPT_MAX_CHARS);
  });

  it("leaves a short transcript unmarked", async () => {
    await summarizeItem({ ...input, transcript: "short one" });
    expect(create.mock.calls[0][0].messages[0].content).not.toContain("(truncated)");
  });
});

describe("summarizeItem response handling", () => {
  it("returns the tool output plus the usage that produced it", async () => {
    const result = await summarizeItem(input);

    expect(result.output).toEqual({
      title: "A tool",
      summary: "It does a thing.",
      category: "ai-coding-tool",
      tags: ["cli"],
      howToStart: ["npm i"],
    });
    expect(result.usage).toEqual({
      model: "claude-opus-5",
      inputTokens: 1234,
      outputTokens: 56,
    });
  });

  it("reports the model that actually answered, not the one requested", async () => {
    create.mockResolvedValue(reply({ model: "claude-opus-4-8" }));
    const result = await summarizeItem(input);
    expect(result.usage.model).toBe("claude-opus-4-8");
  });

  it("throws a readable error when the whole fallback chain refuses", async () => {
    create.mockResolvedValue(
      reply({ stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, content: [] })
    );
    await expect(summarizeItem(input)).rejects.toThrow(/declined to summarize.*cyber/i);
  });

  it("throws when no tool call comes back", async () => {
    create.mockResolvedValue(reply({ content: [{ type: "text", text: "hi" }] }));
    await expect(summarizeItem(input)).rejects.toThrow(/structured summary/i);
  });

  it("falls back to 'other' for a category outside the enum", async () => {
    const bad = reply();
    bad.content[0].input.category = "made-up";
    create.mockResolvedValue(bad);

    const result = await summarizeItem(input);
    expect(result.output.category).toBe("other");
  });
});

/* == S3 == */
describe("screenshot content block", () => {
  it("builds an image block before the text block when image_file_id is set", async () => {
    await summarizeItem({ ...input, imageFileId: "file123" });

    expect(buildScreenshotImageBlock).toHaveBeenCalledWith("file123");

    const content = create.mock.calls[0][0].messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "abc123" },
    });
    expect(content[1].type).toBe("text");
    expect(content[1].text).toContain("SCREENSHOT_INSTRUCTION_TEXT");
  });

  it("leaves the plain-string content alone when there is no image", async () => {
    await summarizeItem(input);

    expect(buildScreenshotImageBlock).not.toHaveBeenCalled();
    expect(typeof create.mock.calls[0][0].messages[0].content).toBe("string");
  });
});
/* == S3 == */
