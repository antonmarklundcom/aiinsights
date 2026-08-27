import { describe, expect, it } from "vitest";
import {
  detectPlatform,
  detectRepoUrl,
  extractUrls,
  extractYoutubeVideoId,
  isRepoUrl,
  pickPrimaryContentUrl,
  stripTrackingParams,
} from "./urls";

describe("extractUrls", () => {
  it("pulls links out of surrounding text", () => {
    expect(extractUrls("check this out https://example.com/x cool right?")).toEqual([
      "https://example.com/x",
    ]);
  });

  it("strips trailing punctuation Telegram leaves attached", () => {
    expect(extractUrls("see https://example.com/x.")).toEqual(["https://example.com/x"]);
    expect(extractUrls("(https://example.com/x)")).toEqual(["https://example.com/x"]);
  });

  it("returns every url in a multi-link message", () => {
    expect(
      extractUrls("https://instagram.com/reel/abc and https://github.com/foo/bar")
    ).toEqual(["https://instagram.com/reel/abc", "https://github.com/foo/bar"]);
  });

  it("returns an empty array when there's no link", () => {
    expect(extractUrls("just a note, no link here")).toEqual([]);
  });
});

describe("detectPlatform", () => {
  it("recognizes instagram and youtube, including subdomains and youtu.be", () => {
    expect(detectPlatform("https://www.instagram.com/reel/DcWMIBythN6/")).toBe("instagram");
    expect(detectPlatform("https://instagram.com/reel/abc")).toBe("instagram");
    expect(detectPlatform("https://youtube.com/watch?v=abc")).toBe("youtube");
    expect(detectPlatform("https://youtu.be/abc")).toBe("youtube");
    expect(detectPlatform("https://m.youtube.com/watch?v=abc")).toBe("youtube");
  });

  it("treats everything else as other, including github/notion/articles", () => {
    expect(detectPlatform("https://github.com/foo/bar")).toBe("other");
    expect(detectPlatform("https://app.notion.com/p/some-page")).toBe("other");
    expect(detectPlatform("https://example.com/article")).toBe("other");
  });

  it("does not match a spoofed host containing the domain as a substring", () => {
    // regression: host checks used to be `.includes()`, so a domain merely
    // containing "instagram.com" anywhere would be mistaken for the real thing
    expect(detectPlatform("https://notinstagram.com.evil.tld/reel/abc")).toBe("other");
    expect(detectPlatform("https://instagram.com.evil.tld/reel/abc")).toBe("other");
    expect(detectPlatform("https://evilinstagram.com/reel/abc")).toBe("other");
  });

  it("returns other for an unparseable url", () => {
    expect(detectPlatform("not a url")).toBe("other");
  });
});

describe("isRepoUrl / detectRepoUrl", () => {
  it("recognizes known repo hosts", () => {
    expect(isRepoUrl("https://github.com/foo/bar")).toBe(true);
    expect(isRepoUrl("https://gitlab.com/foo/bar")).toBe(true);
    expect(isRepoUrl("https://gist.github.com/foo/bar")).toBe(true);
  });

  it("does not match a spoofed host", () => {
    expect(isRepoUrl("https://github.com.evil.tld/foo/bar")).toBe(false);
    expect(isRepoUrl("https://notgithub.com/foo/bar")).toBe(false);
  });

  it("finds a repo link inside a longer message", () => {
    expect(
      detectRepoUrl("cool reel about this repo https://github.com/foo/bar check it out")
    ).toBe("https://github.com/foo/bar");
  });

  it("returns null when there's no repo link", () => {
    expect(detectRepoUrl("https://instagram.com/reel/abc")).toBeNull();
  });
});

describe("pickPrimaryContentUrl", () => {
  it("prefers instagram/youtube over other links", () => {
    expect(
      pickPrimaryContentUrl(["https://github.com/foo/bar", "https://instagram.com/reel/abc"])
    ).toBe("https://instagram.com/reel/abc");
  });

  it("falls back to the first link when there's no instagram/youtube link", () => {
    // regression: a message with only a Notion doc / article / bare repo
    // link used to be dropped entirely because only IG/YT links were
    // considered "content" before being passed in here
    expect(pickPrimaryContentUrl(["https://app.notion.com/p/some-page"])).toBe(
      "https://app.notion.com/p/some-page"
    );
    expect(pickPrimaryContentUrl(["https://github.com/foo/bar"])).toBe(
      "https://github.com/foo/bar"
    );
  });

  it("returns null for an empty list", () => {
    expect(pickPrimaryContentUrl([])).toBeNull();
  });
});

describe("stripTrackingParams", () => {
  it("removes common tracking params but keeps real ones", () => {
    const dirty =
      "https://www.instagram.com/reel/DcWMIBythN6/?igsi=dXV5NWVoOHE4bHFr&utm_source=sp_auto_dm&fbclid=PAT01abc&keep=me";
    const clean = stripTrackingParams(dirty);
    const parsed = new URL(clean);
    expect(parsed.searchParams.has("igsi")).toBe(false);
    expect(parsed.searchParams.has("utm_source")).toBe(false);
    expect(parsed.searchParams.has("fbclid")).toBe(false);
    expect(parsed.searchParams.get("keep")).toBe("me");
  });

  it("leaves a url with no tracking params unchanged in substance", () => {
    const url = "https://youtube.com/watch?v=abc123";
    expect(new URL(stripTrackingParams(url)).searchParams.get("v")).toBe("abc123");
  });

  it("returns the input untouched if it doesn't parse as a url", () => {
    expect(stripTrackingParams("not a url")).toBe("not a url");
  });
});

describe("extractYoutubeVideoId", () => {
  it("handles watch urls, youtu.be, shorts and embed", () => {
    expect(extractYoutubeVideoId("https://youtube.com/watch?v=abc123")).toBe("abc123");
    expect(extractYoutubeVideoId("https://youtu.be/abc123")).toBe("abc123");
    expect(extractYoutubeVideoId("https://youtube.com/shorts/abc123")).toBe("abc123");
    expect(extractYoutubeVideoId("https://www.youtube.com/embed/abc123")).toBe("abc123");
  });

  it("does not match a spoofed host", () => {
    expect(extractYoutubeVideoId("https://youtube.com.evil.tld/watch?v=abc123")).toBeNull();
  });

  it("returns null for a non-youtube url", () => {
    expect(extractYoutubeVideoId("https://example.com/watch?v=abc123")).toBeNull();
  });
});
