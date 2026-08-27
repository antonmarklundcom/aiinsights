export interface InstagramMeta {
  title: string | null;
  caption: string | null;
}

/**
 * Best-effort scrape of Instagram's public og:title/og:description meta tags.
 * Instagram frequently blocks/rate-limits unauthenticated fetches and does not
 * offer a public transcript API, so this often returns nulls — that's expected.
 * The processing pipeline falls back to asking the user for a quick note.
 */
export async function fetchInstagramMeta(url: string): Promise<InstagramMeta> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)",
      },
    });
    if (!res.ok) return { title: null, caption: null };
    const html = await res.text();

    const title = matchMeta(html, "og:title");
    const description = matchMeta(html, "og:description");

    return { title, caption: description };
  } catch {
    return { title: null, caption: null };
  }
}

function matchMeta(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const match = html.match(re);
  return match ? decodeHtmlEntities(match[1]) : null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
