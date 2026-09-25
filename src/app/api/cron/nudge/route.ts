import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { env } from "@/lib/env";
import { sendTelegramMessage } from "@/lib/telegram";
import { formatFriday, formatMonday, pickFridayFollowups, pickMondayCandidates } from "@/lib/nudge";

export const dynamic = "force-dynamic";

/**
 * The weekly "implement one thing" nudge (N1). `?kind=monday` offers a few
 * unimplemented items; `?kind=friday` asks about the ones chosen. Scheduled
 * from `vercel.json`, same bearer-token rule as the reprocess cron.
 */
export async function GET(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const chatId = Number(env.TELEGRAM_ALLOWED_CHAT_ID);
  if (!chatId) return NextResponse.json({ ok: false, error: "no chat id" }, { status: 500 });

  const kind = new URL(req.url).searchParams.get("kind");
  const now = new Date();
  // Unimplemented items only; a personal knowledge base is small enough that
  // filtering the rest in memory keeps the rules in one tested place.
  const rows = await db.select().from(items).where(eq(items.implemented, false));

  if (kind === "monday") {
    const picked = pickMondayCandidates(rows, now);
    if (picked.length === 0) return NextResponse.json({ ok: true, sent: 0 });
    const { text, buttons } = formatMonday(picked);
    await sendTelegramMessage(chatId, text, { buttons });
    await db
      .update(items)
      .set({ lastNudgedAt: now })
      .where(inArray(items.id, picked.map((r) => r.id)));
    return NextResponse.json({ ok: true, sent: picked.length });
  }

  if (kind === "friday") {
    const followups = pickFridayFollowups(rows, now);
    for (const row of followups) {
      const { text, buttons } = formatFriday(row);
      await sendTelegramMessage(chatId, text, { buttons });
    }
    return NextResponse.json({ ok: true, sent: followups.length });
  }

  return NextResponse.json({ ok: false, error: "kind must be monday or friday" }, { status: 400 });
}
