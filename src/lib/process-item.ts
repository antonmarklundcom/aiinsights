import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items, type Item } from "@/db/schema";
import { fetchYoutubeMeta } from "./youtube";
import { fetchPageMeta } from "./page-meta";
import { fetchRepoReadme } from "./github";
import { summarizeItem } from "./summarize";

export interface ProcessResult {
  item: Item;
  needsNote: boolean;
}

/** Gathers whatever public data is available for an item, then either asks
 * the user for a note (if there's nothing to go on) or summarizes it. */
export async function processItem(itemId: number): Promise<ProcessResult> {
  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item) throw new Error(`Item ${itemId} not found`);

  await db.update(items).set({ status: "processing" }).where(eq(items.id, itemId));

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

    const result = await summarizeItem({
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
        title: result.title,
        summary: result.summary,
        category: result.category,
        tags: result.tags,
        howToStart: result.howToStart,
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
