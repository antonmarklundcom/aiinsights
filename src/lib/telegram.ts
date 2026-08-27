const TELEGRAM_API = "https://api.telegram.org";

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return token;
}

export async function sendTelegramMessage(
  chatId: number,
  text: string,
  opts: { replyToMessageId?: number } = {}
): Promise<void> {
  await fetch(`${TELEGRAM_API}/bot${botToken()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_to_message_id: opts.replyToMessageId,
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }),
  });
}

export interface TelegramUpdate {
  message?: {
    message_id: number;
    chat: { id: number };
    text?: string;
    caption?: string;
  };
}
