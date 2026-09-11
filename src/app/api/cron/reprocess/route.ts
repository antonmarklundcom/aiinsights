import { NextRequest, NextResponse } from "next/server";
import { and, asc, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { env } from "@/lib/env";
import { MAX_ATTEMPTS, processItem } from "@/lib/process-item";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** An item still `pending`/`processing` after this long was dropped mid-flight. */
export const STUCK_AFTER_MS = 10 * 60 * 1000;

/** Ceiling on one run, so a backlog is drained over several ticks. */
export const BATCH_SIZE = 10;

/**
 * Re-runs items the webhook never finished — the function was killed, the
 * Claude call timed out, Vercel recycled the instance (report §1). Scheduled
 * from `vercel.json`; Vercel sends the `CRON_SECRET` as a bearer token.
 */
export async function GET(req: NextRequest) {
  const expected = env.CRON_SECRET;
  if (!expected || req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - STUCK_AFTER_MS);

  const stuck = await db
    .select()
    .from(items)
    .where(
      and(
        inArray(items.status, ["pending", "processing"]),
        lt(items.attempts, MAX_ATTEMPTS),
        // Never attempted, or last attempted long enough ago to be dead.
        or(isNull(items.lastAttemptAt), lt(items.lastAttemptAt, cutoff))
      )
    )
    .orderBy(asc(items.lastAttemptAt))
    .limit(BATCH_SIZE);

  let processed = 0;
  let failed = 0;

  for (const item of stuck) {
    try {
      // No `force`: processItem records the failure and the attempt, and once
      // attempts hits MAX_ATTEMPTS this query stops selecting the item at all.
      await processItem(item.id);
      processed++;
    } catch {
      // Already written to the row as status/processing_error.
      failed++;
    }
  }

  return NextResponse.json({ ok: true, selected: stuck.length, processed, failed });
}
