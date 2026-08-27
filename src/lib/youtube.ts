import { extractYoutubeVideoId } from "./urls";

export interface YoutubeMeta {
  title: string | null;
  authorName: string | null;
  transcript: string | null;
}

/** Best-effort YouTube metadata + transcript, using only public endpoints (no API key). */
export async function fetchYoutubeMeta(url: string): Promise<YoutubeMeta> {
  const videoId = extractYoutubeVideoId(url);
  const [oembed, transcript] = await Promise.all([
    fetchOEmbed(url),
    videoId ? fetchTranscript(videoId) : Promise.resolve(null),
  ]);
  return {
    title: oembed?.title ?? null,
    authorName: oembed?.author_name ?? null,
    transcript,
  };
}

async function fetchOEmbed(
  url: string
): Promise<{ title?: string; author_name?: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    // Pull the watch page to locate the caption track URL (works for public videos
    // with auto-generated or uploaded captions; no API key required).
    const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!watchRes.ok) return null;
    const html = await watchRes.text();

    const match = html.match(/"captionTracks":(\[.*?\])/);
    if (!match) return null;

    const tracks: Array<{ baseUrl: string; languageCode: string; kind?: string }> =
      JSON.parse(match[1].replace(/\\u0026/g, "&"));
    if (!tracks.length) return null;

    const track =
      tracks.find((t) => t.languageCode?.startsWith("en")) ?? tracks[0];

    const capRes = await fetch(`${track.baseUrl}&fmt=json3`);
    if (!capRes.ok) return null;
    const capJson = await capRes.json();

    const text = (capJson.events ?? [])
      .flatMap((e: { segs?: Array<{ utf8?: string }> }) =>
        (e.segs ?? []).map((s) => s.utf8 ?? "")
      )
      .join("")
      .replace(/\n+/g, " ")
      .trim();

    return text || null;
  } catch {
    return null;
  }
}
