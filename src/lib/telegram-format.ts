import type { Item } from "@/db/schema";
import { dashboardItemUrl } from "@/lib/urls";

/** Escapes the three characters Telegram's HTML parse mode cares about. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The bot's answer once an item has been processed (or has given up on content). */
export function formatReply(item: Item, needsNote: boolean): string {
  if (needsNote) {
    return [
      `Saved: ${item.url}`,
      "",
      "Couldn't pull a caption or transcript for this one (common for Instagram). Reply with a quick note on what it's about — even a few words — and I'll fill in the rest.",
    ].join("\n");
  }

  const lines = [`<b>${escapeHtml(item.title ?? "Saved item")}</b>`];
  if (item.category) lines.push(`<i>${escapeHtml(item.category)}</i>`);
  if (item.summary) lines.push("", escapeHtml(item.summary));
  if (item.tags?.length)
    lines.push("", item.tags.map((t) => `#${escapeHtml(t.replace(/\s+/g, "_"))}`).join(" "));
  if (item.howToStart?.length) {
    lines.push("", "<b>Get started:</b>");
    item.howToStart.forEach((step, i) => lines.push(`${i + 1}. ${escapeHtml(step)}`));
  }
  return lines.join("\n");
}

/**
 * Answer to a link that is already in the database (plan §5.2): confirm it,
 * name it, and link to it. The link is dropped rather than faked when no
 * public base URL is configured.
 */
export function formatDuplicateReply(item: Pick<Item, "id" | "title" | "url">): string {
  const lines = [
    "Already saved — no need to send it twice.",
    "",
    `<b>${escapeHtml(item.title ?? item.url)}</b>`,
  ];
  const link = dashboardItemUrl(item.id);
  if (link) lines.push("", `<a href="${escapeHtml(link)}">Open in your dashboard</a>`);
  return lines.join("\n");
}
