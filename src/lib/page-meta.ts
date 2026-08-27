export interface PageMeta {
  title: string | null;
  description: string | null;
}

/**
 * Best-effort scrape of a page's public og:title/og:description meta tags.
 * Used for Instagram (which has no public caption/transcript API and often
 * blocks unauthenticated fetches — nulls are expected there) as well as any
 * other link that isn't Instagram/YouTube/a repo (Notion docs, articles,
 * etc). The processing pipeline falls back to asking the user for a quick
 * note when this comes back empty.
 */
export async function fetchPageMeta(url: string): Promise<PageMeta> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)",
      },
    });
    if (!res.ok) return { title: null, description: null };
    const html = await res.text();

    const title = matchMeta(html, "og:title") ?? matchTitleTag(html);
    const description = matchMeta(html, "og:description");

    return { title, description };
  } catch {
    return { title: null, description: null };
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

function matchTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? decodeHtmlEntities(match[1]).trim() : null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
