import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPageMeta } from "./page-meta";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function htmlResponse(html: string, ok = true): Response {
  return { ok, text: async () => html } as Response;
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("fetchPageMeta", () => {
  it("reads og:title and og:description", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse(
        `<html><head><meta property="og:title" content="A Tool"><meta property="og:description" content="It does things."></head></html>`
      )
    );

    expect(await fetchPageMeta("https://example.com")).toEqual({
      title: "A Tool",
      description: "It does things.",
    });
  });

  it("accepts single-quoted attribute values", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse(`<meta property='og:title' content='Single Quoted'>`)
    );

    expect((await fetchPageMeta("https://example.com")).title).toBe("Single Quoted");
  });

  it("matches property= regardless of what other attributes sit around it", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse(
        `<meta name="twitter:title" property="og:title" data-x="1" content="Surrounded">`
      )
    );

    expect((await fetchPageMeta("https://example.com")).title).toBe("Surrounded");
  });

  it("falls back to the <title> tag when og:title is absent", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse(`<html><head><title>Plain Title</title></head></html>`)
    );

    const meta = await fetchPageMeta("https://example.com");
    expect(meta.title).toBe("Plain Title");
    expect(meta.description).toBeNull();
  });

  it("prefers og:title over <title> when both are present", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse(
        `<html><head><title>Fallback Title</title><meta property="og:title" content="OG Title"></head></html>`
      )
    );

    expect((await fetchPageMeta("https://example.com")).title).toBe("OG Title");
  });

  it("trims whitespace around a <title> fallback", async () => {
    fetchMock.mockResolvedValue(htmlResponse(`<title>\n  Padded Title  \n</title>`));
    expect((await fetchPageMeta("https://example.com")).title).toBe("Padded Title");
  });

  it("decodes HTML entities in both og: tags and the <title> fallback", async () => {
    fetchMock.mockResolvedValue(
      htmlResponse(
        `<meta property="og:title" content="Fish &amp; Chips &quot;best&quot; &#039;ever&#039;">` +
          `<meta property="og:description" content="a &lt;tag&gt; example">`
      )
    );

    expect(await fetchPageMeta("https://example.com")).toEqual({
      title: `Fish & Chips "best" 'ever'`,
      description: "a <tag> example",
    });
  });

  it("does not match when content= appears before property= in the same tag", async () => {
    // Documents a real limitation of the ordered regex rather than a full
    // HTML attribute parse: content-then-property tags fall through to null,
    // same as no og:title at all.
    fetchMock.mockResolvedValue(
      htmlResponse(`<meta content="Reversed" property="og:title"><title>Fallback</title>`)
    );

    expect((await fetchPageMeta("https://example.com")).title).toBe("Fallback");
  });

  it("returns nulls for a non-2xx response", async () => {
    fetchMock.mockResolvedValue(htmlResponse("<title>Should be ignored</title>", false));

    expect(await fetchPageMeta("https://example.com")).toEqual({ title: null, description: null });
  });

  it("returns nulls when the fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    expect(await fetchPageMeta("https://example.com")).toEqual({ title: null, description: null });
  });

  it("returns nulls when there is no og: meta and no <title>", async () => {
    fetchMock.mockResolvedValue(htmlResponse("<html><body>no head here</body></html>"));

    expect(await fetchPageMeta("https://example.com")).toEqual({ title: null, description: null });
  });

  it("sends a scraper-friendly user agent so og: tags render server-side", async () => {
    fetchMock.mockResolvedValue(htmlResponse("<title>t</title>"));

    await fetchPageMeta("https://example.com");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers["User-Agent"]).toMatch(/facebookexternalhit/i);
  });
});
