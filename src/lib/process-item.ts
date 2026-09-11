import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items, type Item } from "@/db/schema";
import { fetchYoutubeMeta } from "./youtube";
import { fetchPageMeta } from "./page-meta";
import { fetchRepoReadme } from "./github";
import { summarizeItem } from "./summarize";

/**
 * How many times an item is processed before it is left alone. The cron route
 * only picks up items below this, and `processItem` refuses to run past it
 * unless the caller explicitly forces a re-run (plan §5.2).
 */
export const MAX_ATTEMPTS = 3;

/** Thrown instead of burning a fourth attempt. Distinct so callers can tell it apart. */
export class MaxAttemptsError extends Error {
  constructor(itemId: number, attempts: number) {
    super(
      `Item ${itemId} has already been processed ${attempts} times (max ${MAX_ATTEMPTS}). ` +
        `Pass { force: true } to run it anyway.`
    );
    this.name = "MaxAttemptsError";
  }
}

export interface ProcessResult {
  item: Item;
  needsNote: boolean;
}

export interface ProcessOptions {
  /** Ignore the `MAX_ATTEMPTS` ceiling — the dashboard's manual re-run passes this. */
  force?: boolean;
}

/**
 * The processing contract the rest of the app builds on (plan §5.2): gathers
 * whatever public data is available for an item, then either asks the user for
 * a note (nothing to go on) or summarizes it. Every run counts as an attempt
 * and stamps `last_attempt_at`, which is what makes the cron retry safe.
 */
export async function processItem(
  itemId: number,
  opts: ProcessOptions = {}
): Promise<ProcessResult> {
  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item) throw new Error(`Item ${itemId} not found`);

  if (!opts.force && item.attempts >= MAX_ATTEMPTS) {
    throw new MaxAttemptsError(itemId, item.attempts);
  }

  // Claimed before any slow work, so a crash leaves a countable attempt behind
  // rather than an item that looks untouched and gets retried forever.
  await db
    .update(items)
    .set({
      status: "processing",
      attempts: item.attempts + 1,
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(items.id, itemId));

  try {
    let caption = item.sourceCaption;
    let transcript = item.transcript;
    let title = item.title;

    if (item.platform === "youtube") {
      const meta = await fetchYoutubeMeta(item.url);
      title = title ?? meta.title;
      transcript = transcript ?? meta.transcript;
    } else {
      // Instagram (blocked more often than not) and anything else — a bare
      // GitHub repo link, a Notion doc, an article — get the same best-effort
      // og:title/og:description scrape.
      const meta = await fetchPageMeta(item.url);
      title = title ?? meta.title;
      caption = caption ?? meta.description;
    }

    let repoReadme = item.repoReadme;
    if (item.repoUrl && !repoReadme) {
      repoReadme = await fetchRepoReadme(item.repoUrl);
    }

    const hasContent = Boolean(caption || transcript || item.userNote || repoReadme);

    if (!hasContent) {
      const [updated] = await db
        .update(items)
        .set({
          status: "needs_note",
          sourceCaption: caption,
          transcript,
          title,
          updatedAt: new Date(),
        })
        .where(eq(items.id, itemId))
        .returning();
      return { item: updated, needsNote: true };
    }

    const { output, usage } = await summarizeItem({
      url: item.url,
      platform: item.platform,
      caption,
      transcript,
      userNote: item.userNote,
      repoUrl: item.repoUrl,
      repoReadme,
    });

    const [updated] = await db
      .update(items)
      .set({
        status: "done",
        sourceCaption: caption,
        transcript,
        repoReadme,
        title: output.title,
        summary: output.summary,
        category: output.category,
        tags: output.tags,
        howToStart: output.howToStart,
        aiModel: usage.model,
        aiInputTokens: usage.inputTokens,
        aiOutputTokens: usage.outputTokens,
        processingError: null,
        updatedAt: new Date(),
      })
      .where(eq(items.id, itemId))
      .returning();

    return { item: updated, needsNote: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(items)
      .set({ status: "failed", processingError: message, updatedAt: new Date() })
      .where(eq(items.id, itemId));
    throw err;
  }
}
