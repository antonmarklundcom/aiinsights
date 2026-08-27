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

export function detectRepoUrl(text: string): string | null {
  const urls = extractUrls(text);
  const repoHosts = ["github.com", "gitlab.com", "sourceforge.net", "bitbucket.org"];
  for (const u of urls) {
    const host = safeHost(u);
    if (host && repoHosts.some((h) => isHostOrSubdomain(host, h))) return u;
  }
  return null;
}

/** True if `host` is exactly `domain` or a proper subdomain of it (not merely
 * a substring — avoids e.g. "notinstagram.com.evil.tld" matching "instagram.com"). */
function isHostOrSubdomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function extractYoutubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1) || null;
    }
    if (u.hostname.includes("youtube.com")) {
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

/** Pull the primary content URL (IG/YouTube link) out of a forwarded Telegram message,
 * separate from any other links (e.g. a repo link) mentioned alongside it. */
export function pickPrimaryContentUrl(urls: string[]): string | null {
  const priority: Platform[] = ["instagram", "youtube"];
  for (const p of priority) {
    const found = urls.find((u) => detectPlatform(u) === p);
    if (found) return found;
  }
  return urls[0] ?? null;
}
