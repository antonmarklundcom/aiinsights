import { env } from "@/lib/env";

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Telegram rejects messages over 4,096 characters outright. Cut well short of
 * that so the HTML we wrap the text in can never push it over the real limit.
 */
export const MAX_MESSAGE_CHARS = 4000;

/** Truncates to `MAX_MESSAGE_CHARS`, marking the cut with an ellipsis. */
export function truncateForTelegram(text: string): string {
  if (text.length <= MAX_MESSAGE_CHARS) return text;
  return `${text.slice(0, MAX_MESSAGE_CHARS - 1)}…`;
}

/**
 * Sends a message, and — unlike the original — actually looks at the answer.
 * A failure here is never fatal (the item is saved either way), so this logs
 * Telegram's own `description` rather than throwing.
 */
export async function sendTelegramMessage(
  chatId: number,
  text: string,
  opts: { replyToMessageId?: number } = {}
): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(`${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: truncateForTelegram(text),
        reply_to_message_id: opts.replyToMessageId,
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }),
    });
  } catch (err) {
    console.error("[telegram] sendMessage request failed:", err);
    return false;
  }

  // Telegram signals failure both by status code and by `ok: false` on a 200.
  const body = await res.text().catch(() => "");
  let description: string | undefined;
  let ok = res.ok;
  try {
    const parsed = JSON.parse(body) as { ok?: boolean; description?: string };
    description = parsed.description;
    if (parsed.ok === false) ok = false;
  } catch {
    description = body.slice(0, 200) || undefined;
  }

  if (!ok) {
    console.error(
      `[telegram] sendMessage failed (HTTP ${res.status}): ${description ?? "no description"}`
    );
  }
  return ok;
}

export interface TelegramPhotoSize {
  file_id: string;
  width: number;
  height: number;
}

export interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    caption?: string;
    /** Available sizes of an attached screenshot, smallest first (S3 reads it). */
    photo?: TelegramPhotoSize[];
  };
}
