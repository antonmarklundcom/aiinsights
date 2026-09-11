import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Item } from "@/db/schema";
import { escapeHtml, formatDuplicateReply, formatReply } from "./telegram-format";

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    title: "A Tool",
    category: "ai-coding-tool",
    summary: "Does a thing.",
    tags: ["cli", "dev tools"],
    howToStart: ["npm i", "run it"],
    url: "https://example.com/x",
    ...overrides,
  } as Item;
}

describe("escapeHtml", () => {
  it("escapes &, < and > but leaves quotes alone", () => {
    expect(escapeHtml(`<b>Tom & "Jerry" 'io'</b>`)).toBe(
      `&lt;b&gt;Tom &amp; "Jerry" 'io'&lt;/b&gt;`
    );
  });

  it("is idempotent-safe on already-plain text", () => {
    expect(escapeHtml("plain text")).toBe("plain text");
  });
});

describe("formatReply", () => {
  it("asks for a note instead of a summary when needsNote is true", () => {
    const out = formatReply(item({ url: "https://example.com/reel" }), true);
    expect(out).toContain("Saved: https://example.com/reel");
    expect(out).toMatch(/reply with a quick note/i);
    expect(out).not.toContain("<b>");
  });

  it("renders title, category, summary, tags and steps as HTML", () => {
    const out = formatReply(item(), false);

    expect(out).toContain("<b>A Tool</b>");
    expect(out).toContain("<i>ai-coding-tool</i>");
    expect(out).toContain("Does a thing.");
    // Spaces in a tag become underscores so it reads as one Telegram hashtag.
    expect(out).toContain("#cli");
    expect(out).toContain("#dev_tools");
    expect(out).toContain("1. npm i");
    expect(out).toContain("2. run it");
  });

  it("escapes HTML-significant characters coming from item content", () => {
    const out = formatReply(
      item({
        title: `<script>alert(1)</script>`,
        summary: `5 > 3 & 2 < 4`,
        tags: ["<b>bold</b>"],
        howToStart: [`rm -rf / && echo "gone"`],
      }),
      false
    );

    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(out).toContain("5 &gt; 3 &amp; 2 &lt; 4");
    expect(out).toContain("#&lt;b&gt;bold&lt;/b&gt;");
    // Quotes are left alone — only &, < and > are HTML-significant in Telegram's parser.
    expect(out).toContain('rm -rf / &amp;&amp; echo "gone"');
  });

  it("falls back to a generic title when the item has none", () => {
    expect(formatReply(item({ title: null }), false)).toContain("<b>Saved item</b>");
  });

  it("omits sections the item doesn't have", () => {
    const out = formatReply(
      item({ category: null, summary: null, tags: [], howToStart: [] }),
      false
    );
    expect(out).not.toContain("<i>");
    expect(out).not.toContain("Get started");
  });
});

describe("formatDuplicateReply", () => {
  const originalEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("names the existing item and confirms it was already saved", () => {
    const out = formatDuplicateReply({ id: 7, title: "Already Here", url: "https://a.test/1" });
    expect(out).toMatch(/already saved/i);
    expect(out).toContain("<b>Already Here</b>");
  });

  it("falls back to the url when the item has no title", () => {
    const out = formatDuplicateReply({ id: 7, title: null, url: "https://a.test/1" });
    expect(out).toContain("<b>https://a.test/1</b>");
  });

  it("drops the dashboard link when no public base url is configured", () => {
    const out = formatDuplicateReply({ id: 7, title: "Item", url: "https://a.test/1" });
    expect(out).not.toContain("dashboard");
    expect(out).not.toContain("<a href");
  });

  it("includes an escaped dashboard link when APP_URL is set", () => {
    process.env.APP_URL = "https://app.test";
    const out = formatDuplicateReply({ id: 7, title: "Item", url: "https://a.test/1" });
    expect(out).toContain('<a href="https://app.test/items/7">Open in your dashboard</a>');
  });
});
