import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { items, ITEM_CATEGORIES, type ItemCategory } from "@/db/schema";
import { buildSearchCondition } from "@/lib/search";
import { FilterBar } from "@/components/FilterBar";
import { ItemCard } from "@/components/ItemCard";
import { buildQueryString } from "@/components/query-string";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/** `before` is `<createdAt ISO>_<id>` — opaque to the URL, decoded only here. */
function parseCursor(raw: string): { createdAt: Date; id: number } | null {
  const sep = raw.lastIndexOf("_");
  if (sep === -1) return null;
  const createdAt = new Date(raw.slice(0, sep));
  const id = Number(raw.slice(sep + 1));
  if (Number.isNaN(createdAt.getTime()) || !Number.isFinite(id)) return null;
  return { createdAt, id };
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const get = (key: string) => (typeof params[key] === "string" ? params[key] : "");
  const q = get("q");
  const platform = get("platform");
  const status = get("status");
  const implemented = get("implemented");
  const category = ITEM_CATEGORIES.includes(get("category") as ItemCategory)
    ? (get("category") as ItemCategory)
    : "";
  const tag = get("tag");
  const before = get("before");

  const conditions = [];
  if (q) {
    const searchCondition = buildSearchCondition(q);
    if (searchCondition) conditions.push(searchCondition);
  }
  if (platform) conditions.push(eq(items.platform, platform));
  if (status) conditions.push(eq(items.status, status));
  if (implemented === "yes") conditions.push(eq(items.implemented, true));
  if (implemented === "no") conditions.push(eq(items.implemented, false));
  if (category) conditions.push(eq(items.category, category));
  if (tag) conditions.push(sql`${items.tags} @> ${JSON.stringify([tag])}::jsonb`);

  const cursor = before ? parseCursor(before) : null;
  if (cursor) {
    conditions.push(sql`(${items.createdAt}, ${items.id}) < (${cursor.createdAt}, ${cursor.id})`);
  }

  const rows = await db
    .select()
    .from(items)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(items.createdAt), desc(items.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const pageItems = rows.slice(0, PAGE_SIZE);
  const last = pageItems[pageItems.length - 1];
  const currentFilters = { q, platform, status, implemented, category, tag };
  const loadMoreHref = last
    ? `/?${buildQueryString({ ...currentFilters, before: `${last.createdAt.toISOString()}_${last.id}` })}`
    : "";

  return (
    <main className="mx-auto max-w-4xl w-full px-6 py-10 flex-1">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">AI Insights</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Everything you&apos;ve forwarded from Instagram/YouTube — searchable, summarized,
          ready to implement.
        </p>
      </header>

      <FilterBar
        q={q}
        platform={platform}
        status={status}
        implemented={implemented}
        category={category}
        tag={tag}
      />

      {pageItems.length === 0 ? (
        <p className="text-sm text-neutral-500">
          {before || q || platform || status || implemented || category || tag
            ? "Nothing matches these filters."
            : "Nothing saved yet. Share an Instagram/YouTube post to your Telegram bot to get started."}
        </p>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {pageItems.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </ul>
          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Link
                href={loadMoreHref}
                className="rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium"
              >
                Load more
              </Link>
            </div>
          )}
        </>
      )}
    </main>
  );
}
