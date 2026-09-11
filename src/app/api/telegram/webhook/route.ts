import { NextRequest, NextResponse, after } from "next/server";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { env } from "@/lib/env";
import {
  detectPlatform,
  detectRepoUrl,
  extractUrls,
  isRepoUrl,
  pickPrimaryContentUrl,
  stripTrackingParams,
} from "@/lib/urls";
import { sendTelegramMessage, type TelegramUpdate } from "@/lib/telegram";
import { formatDuplicateReply, formatReply } from "@/lib/telegram-format";
import { processItem } from "@/lib/process-item";
import { isUniqueViolation } from "./pg-error";
/* == S3 == */
import { selectPhotoSize } from "@/lib/telegram-files";
/* == S3 == */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const HELP_TEXT =
  "Send me any link (Instagram, YouTube, GitHub, an article…) and I'll save it. You can also send a screenshot.";
const HELP_TEXT_WITH_NOTE_HINT =
  "Send me any link (Instagram, YouTube, GitHub, an article…) to save it, or a screenshot. If I already asked for a note on something, just reply with it.";

const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  // Fail closed: an unconfigured secret rejects everything rather than leaving
  // the bot open to anyone who finds the URL (plan §5.2, report §2).
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update: TelegramUpdate = await req.json();
  const message = update.message;
  if (!message) return ok();

  const chatId = message.chat.id;

  // Same rule for the chat allow-list, but silently — a stranger who guessed
  // the secret learns nothing from the response either way.
  const allowedChatId = env.TELEGRAM_ALLOWED_CHAT_ID;
  if (!allowedChatId || String(chatId) !== allowedChatId) return ok();

  const text = (message.text ?? message.caption ?? "").trim();
  /* == S3 == */
  const photo = message.photo?.length ? selectPhotoSize(message.photo) : undefined;
  /* == S3 == */

  /* == S3 == a screenshot with no caption is still a valid capture */
  if (!text && !photo) {
    await sendTelegramMessage(chatId, HELP_TEXT, { replyToMessageId: message.message_id });
    return ok();
  }

  const allUrls = extractUrls(text);
  // Prefer an Instagram/YouTube link, but fall back to whatever link IS
  // there — a bare GitHub repo, a Notion doc, an article — so a message
  // with no video-platform link doesn't just get silently dropped.
  const contentUrl = pickPrimaryContentUrl(allUrls);

  if (contentUrl) {
    const cleanContentUrl = stripTrackingParams(contentUrl);

    // Re-forwarding something already saved gets the existing item back
    // instead of a second row (plan §1.4).
    const [existing] = await db
      .select()
      .from(items)
      .where(eq(items.url, cleanContentUrl))
      .limit(1);

    if (existing) {
      await sendTelegramMessage(chatId, formatDuplicateReply(existing), {
        replyToMessageId: message.message_id,
      });
      return ok();
    }

    // Tracking params are stripped from the repo link too, not just the
    // content link (report §7).
    const repoUrl = isRepoUrl(contentUrl)
      ? cleanContentUrl
      : stripTrackingParamsOrNull(detectRepoUrl(text.replace(contentUrl, "")));
    const noteText = allUrls.reduce((t, u) => t.replace(u, ""), text).trim();

    let createdId: number;
    try {
      const [created] = await db
        .insert(items)
        .values({
          url: cleanContentUrl,
          platform: detectPlatform(contentUrl),
          userNote: noteText || null,
          repoUrl,
          telegramChatId: chatId,
          telegramMessageId: message.message_id,
          /* == S3 == */
          imageFileId: photo?.file_id ?? null,
          /* == S3 == */
        })
        .returning();
      createdId = created.id;
    } catch (err) {
      // Telegram retries any delivery it doesn't get a 2xx for. The unique
      // index on (chat_id, message_id) turns that retry into this, which means
      // the first delivery already succeeded: acknowledge and say nothing.
      if (isUniqueViolation(err)) return ok();
      throw err;
    }

    await sendTelegramMessage(chatId, "Saved. Digging in…", {
      replyToMessageId: message.message_id,
    });

    // The 200 goes out first; the scrape and the Claude call run after it.
    after(() => runAndReply(createdId, chatId, message.message_id));
    return ok();
  }

  /* == S3 == */
  // A screenshot with no link is still a valid capture (plan §6.3): save it
  // as its own item, with any caption text becoming the note.
  if (photo) {
    const photoUrl = `tg://photo/${photo.file_id}`;

    // Re-sending the same screenshot as a new message (not a Telegram retry —
    // that's caught by the unique index below) gets the existing item back
    // instead of a duplicate, same as the link path.
    const [existingPhoto] = await db.select().from(items).where(eq(items.url, photoUrl)).limit(1);
    if (existingPhoto) {
      await sendTelegramMessage(chatId, formatDuplicateReply(existingPhoto), {
        replyToMessageId: message.message_id,
      });
      return ok();
    }

    let photoItemId: number;
    try {
      const [created] = await db
        .insert(items)
        .values({
          url: photoUrl,
          platform: "other",
          userNote: text || null,
          telegramChatId: chatId,
          telegramMessageId: message.message_id,
          imageFileId: photo.file_id,
        })
        .returning();
      photoItemId = created.id;
    } catch (err) {
      if (isUniqueViolation(err)) return ok();
      throw err;
    }

    await sendTelegramMessage(chatId, "Saved. Digging in…", {
      replyToMessageId: message.message_id,
    });

    after(() => runAndReply(photoItemId, chatId, message.message_id));
    return ok();
  }
  /* == S3 == */

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

    // A note means the user is asking for another try, so the attempt ceiling
    // shouldn't stand in the way.
    after(() => runAndReply(pending.id, chatId, message.message_id, { force: true }));
    return ok();
  }

  await sendTelegramMessage(chatId, HELP_TEXT_WITH_NOTE_HINT, {
    replyToMessageId: message.message_id,
  });
  return ok();
}

function stripTrackingParamsOrNull(url: string | null): string | null {
  return url === null ? null : stripTrackingParams(url);
}

async function runAndReply(
  itemId: number,
  chatId: number,
  replyToMessageId: number,
  opts: { force?: boolean } = {}
): Promise<void> {
  try {
    const { item, needsNote } = await processItem(itemId, opts);
    await sendTelegramMessage(chatId, formatReply(item, needsNote), { replyToMessageId });
  } catch {
    await sendTelegramMessage(
      chatId,
      "Saved the link, but summarizing it failed. It's still in your dashboard — you can retry it there.",
      { replyToMessageId }
    );
  }
}
