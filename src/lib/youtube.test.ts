import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchYoutubeMeta } from "./youtube";

const WATCH_PAGE_WITH_CAPTIONS = readFileSync(
  fileURLToPath(new URL("../test/fixtures/youtube-watch-with-captions.html", import.meta.url)),
  "utf-8"
);

/** A minimal `Response`-shaped object for the parts `youtube.ts` reads. */
function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}
function textResponse(body: string, ok = true): Response {
  return { ok, text: async () => body } as Response;
}

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

/** Routes the mock by URL: oEmbed, the watch page, or the caption track itself. */
function stubFetch({
  oembed = jsonResponse({ title: "A Video", author_name: "Someone" }),
  watchPage = textResponse(WATCH_PAGE_WITH_CAPTIONS),
  captionTrack = jsonResponse({ events: [{ segs: [{ utf8: "hello" }] }] }),
}: {
  oembed?: Response;
  watchPage?: Response;
  captionTrack?: Response;
} = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/oembed")) return oembed;
    if (url.includes("fmt=json3")) return captionTrack;
    if (url.includes("/watch?v=")) return watchPage;
    throw new Error(`unexpected fetch: ${url}`);
  });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("fetchYoutubeMeta", () => {
  it("extracts the english caption track and flattens its json3 events", async () => {
    stubFetch({
      captionTrack: jsonResponse({
        events: [
          { segs: [{ utf8: "Hello " }, { utf8: "world." }] },
          { segs: [{ utf8: "\nSecond line." }] },
        ],
      }),
    });

    const meta = await fetchYoutubeMeta("https://youtube.com/watch?v=abc123");

    expect(meta.title).toBe("A Video");
    expect(meta.authorName).toBe("Someone");
    // Newlines inside the joined transcript collapse to a single space.
    expect(meta.transcript).toBe("Hello world. Second line.");
  });

  it("prefers the english track over other languages in the same fixture", async () => {
    const capturedUrls: string[] = [];
    fetchMock.mockImplementation(async (url: string) => {
      capturedUrls.push(url);
      if (url.includes("/oembed")) return jsonResponse({ title: "t" });
      if (url.includes("fmt=json3")) return jsonResponse({ events: [] });
      return textResponse(WATCH_PAGE_WITH_CAPTIONS);
    });

    await fetchYoutubeMeta("https://youtube.com/watch?v=abc123");

    const trackUrl = capturedUrls.find((u) => u.includes("fmt=json3"));
    expect(trackUrl).toContain("lang=en");
  });

  it("returns null transcript when the watch page has no caption tracks", async () => {
    stubFetch({ watchPage: textResponse("<html><head><title>No captions</title></head></html>") });

    const meta = await fetchYoutubeMeta("https://youtube.com/watch?v=abc123");

    expect(meta.transcript).toBeNull();
    expect(meta.title).toBe("A Video");
  });

  it("returns null transcript when the watch page fetch fails", async () => {
    stubFetch({ watchPage: textResponse("", false) });

    const meta = await fetchYoutubeMeta("https://youtube.com/watch?v=abc123");

    expect(meta.transcript).toBeNull();
  });

  it("returns null transcript when the caption track request fails", async () => {
    stubFetch({ captionTrack: jsonResponse({}, false) });

    const meta = await fetchYoutubeMeta("https://youtube.com/watch?v=abc123");

    expect(meta.transcript).toBeNull();
  });

  it("returns nulls for everything when the url has no video id", async () => {
    stubFetch({ oembed: jsonResponse({}, false) });

    const meta = await fetchYoutubeMeta("https://example.com/not-a-video");

    expect(meta.title).toBeNull();
    expect(meta.authorName).toBeNull();
    expect(meta.transcript).toBeNull();
  });

  it("falls back to nulls when the oEmbed request throws", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/oembed")) throw new Error("network down");
      if (url.includes("fmt=json3")) return jsonResponse({ events: [] });
      return textResponse(WATCH_PAGE_WITH_CAPTIONS);
    });

    const meta = await fetchYoutubeMeta("https://youtube.com/watch?v=abc123");

    expect(meta.title).toBeNull();
    expect(meta.authorName).toBeNull();
  });
});
