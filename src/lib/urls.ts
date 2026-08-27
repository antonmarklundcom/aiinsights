export type Platform = "instagram" | "youtube" | "other";

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE) ?? [];
  // strip trailing punctuation Telegram sometimes leaves attached
  return matches.map((u) => u.replace(/[.,!?;:]+$/, ""));
}

export function detectPlatform(url: string): Platform {
  const host = safeHost(url);
  if (!host) return "other";
  if (isHostOrSubdomain(host, "instagram.com")) return "instagram";
  if (isHostOrSubdomain(host, "youtube.com") || isHostOrSubdomain(host, "youtu.be")) return "youtube";
  return "other";
}

const REPO_HOSTS = ["github.com", "gitlab.com", "sourceforge.net", "bitbucket.org"];

export function detectRepoUrl(text: string): string | null {
  const urls = extractUrls(text);
  return urls.find(isRepoUrl) ?? null;
}

export function isRepoUrl(url: string): boolean {
  const host = safeHost(url);
  return Boolean(host && REPO_HOSTS.some((h) => isHostOrSubdomain(host, h)));
}

/** True if `host` is exactly `domain` or a proper subdomain of it (not merely
 * a substring — avoids e.g. "notinstagram.com.evil.tld" matching "instagram.com"). */
function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (isHostOrSubdomain(host, "youtu.be")) {
      return u.pathname.slice(1) || null;
    }
    if (isHostOrSubdomain(host, "youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const shortsMatch = u.pathname.match(/\/(shorts|embed)\/([^/?]+)/);
      if (shortsMatch) return shortsMatch[2];
    }
    return null;
  } catch {
    return null;
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Pull the primary content URL out of a forwarded Telegram message. Prefers an
 * Instagram/YouTube link if present, but falls back to whatever link IS there
 * (a bare GitHub repo, a Notion doc, an article, ...) so nothing gets silently
 * dropped just because it isn't a video platform link. */
export function pickPrimaryContentUrl(urls: string[]): string | null {
  const priority: Platform[] = ["instagram", "youtube"];
  for (const p of priority) {
    const found = urls.find((u) => detectPlatform(u) === p);
    if (found) return found;
  }
  return urls[0] ?? null;
}

const TRACKING_PARAMS = [
  /^utm_/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^igsh$/i,
  /^igshid$/i,
  /^igsi$/i,
  /^mc_[a-z]+$/i,
  /^ref_?src$/i,
  /^ref$/i,
];

/** Strips common tracking query params (fbclid, utm_*, igsi/igshid, ...) so
 * saved URLs stay clean and dedupe-friendly. Leaves the URL untouched (rather
 * than throwing) if it doesn't parse. */
export function stripTrackingParams(url: string): string {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.some((re) => re.test(key))) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}
