import { NextRequest, NextResponse } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { items, type Item } from "@/db/schema";
import { detectPlatform, detectRepoUrl, extractUrls, pickPrimaryContentUrl } from "@/lib/urls";
import { sendTelegramMessage, type TelegramUpdate } from "@/lib/telegram";
import { processItem } from "@/lib/process-item";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update: TelegramUpdate = await req.json();
  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });

  const chatId = message.chat.id;

  const allowedChatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
  if (allowedChatId && String(chatId) !== allowedChatId) {
    // Not your chat — stay silent rather than letting a stranger use the bot.
    return NextResponse.json({ ok: true });
  }

  const text = (message.text ?? message.caption ?? "").trim();

  if (!text) {
    await sendTelegramMessage(
      chatId,
      "Forward me an Instagram or YouTube link (share → Telegram → this bot) and I'll save it.",
      { replyToMessageId: message.message_id }
    );
    return NextResponse.json({ ok: true });
  }

  const allUrls = extractUrls(text);
  const contentUrl = pickPrimaryContentUrl(
    allUrls.filter((u) => detectPlatform(u) !== "other")
  );

  if (contentUrl) {
    const repoUrl = detectRepoUrl(text.replace(contentUrl, ""));
    const noteText = allUrls
      .reduce((t, u) => t.replace(u, ""), text)
      .trim();

    const [created] = await db
      .insert(items)
      .values({
        url: contentUrl,
        platform: detectPlatform(contentUrl),
        userNote: noteText || null,
        repoUrl: repoUrl,
        telegramChatId: chatId,
        telegramMessageId: message.message_id,
      })
      .returning();

    await sendTelegramMessage(chatId, "Saved. Digging in…", {
      replyToMessageId: message.message_id,
    });

    await runAndReply(created.id, chatId, message.message_id);
    return NextResponse.json({ ok: true });
  }

  // No link in this message — treat it as a note for the most recent item
  // in this chat that's still waiting on one.
  const [pending] = await db
    .select()
    .from(items)
    .where(and(eq(items.telegramChatId, chatId), eq(items.status, "needs_note")))
    .orderBy(desc(items.createdAt))
    .limit(1);

  if (pending) {
    await db
      .update(items)
      .set({ userNote: text, updatedAt: new Date() })
      .where(eq(items.id, pending.id));

    await runAndReply(pending.id, chatId, message.message_id);
    return NextResponse.json({ ok: true });
  }

  await sendTelegramMessage(
    chatId,
    "Forward me an Instagram or YouTube link to save it. If I already asked for a note on something, just reply with it.",
    { replyToMessageId: message.message_id }
  );
  return NextResponse.json({ ok: true });
}

async function runAndReply(itemId: number, chatId: number, replyToMessageId: number) {
  try {
    const { item, needsNote } = await processItem(itemId);
    await sendTelegramMessage(chatId, formatReply(item, needsNote), { replyToMessageId });
  } catch {
    await sendTelegramMessage(
      chatId,
      "Saved the link, but summarizing it failed. It's still in your dashboard — you can retry it there.",
      { replyToMessageId }
    );
  }
}

function formatReply(item: Item, needsNote: boolean): string {
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
  if (item.tags?.length) lines.push("", item.tags.map((t) => `#${t.replace(/\s+/g, "_")}`).join(" "));
  if (item.howToStart?.length) {
    lines.push("", "<b>Get started:</b>");
    item.howToStart.forEach((step, i) => lines.push(`${i + 1}. ${escapeHtml(step)}`));
  }
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
