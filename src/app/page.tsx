import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { buildSearchCondition } from "@/lib/search";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  processing: "Processing…",
  done: "Ready",
  needs_note: "Needs your note",
  failed: "Failed",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const platform = typeof params.platform === "string" ? params.platform : "";
  const status = typeof params.status === "string" ? params.status : "";
  const implemented = typeof params.implemented === "string" ? params.implemented : "";

  const conditions = [];
  if (q) {
    const searchCondition = buildSearchCondition(q);
    if (searchCondition) conditions.push(searchCondition);
  }
  if (platform) conditions.push(eq(items.platform, platform));
  if (status) conditions.push(eq(items.status, status));
  if (implemented === "yes") conditions.push(eq(items.implemented, true));
  if (implemented === "no") conditions.push(eq(items.implemented, false));

  const rows = await db
    .select()
    .from(items)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(items.createdAt))
    .limit(100);

  return (
    <main className="mx-auto max-w-4xl w-full px-6 py-10 flex-1">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">AI Insights</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Everything you&apos;ve forwarded from Instagram/YouTube — searchable, summarized,
          ready to implement.
        </p>
      </header>

      <form className="flex flex-wrap gap-2 mb-6" action="/">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search title, summary, url…"
          className="flex-1 min-w-[200px] rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        />
        <select
          name="platform"
          defaultValue={platform}
          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        >
          <option value="">All platforms</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="other">Other</option>
        </select>
        <select
          name="status"
          defaultValue={status}
          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        >
          <option value="">Any status</option>
          <option value="done">Ready</option>
          <option value="needs_note">Needs note</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
        </select>
        <select
          name="implemented"
          defaultValue={implemented}
          className="rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
        >
          <option value="">Implemented + not</option>
          <option value="no">Not implemented</option>
          <option value="yes">Implemented</option>
        </select>
        <button
          type="submit"
          className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium"
        >
          Filter
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing saved yet. Share an Instagram/YouTube post to your Telegram bot to get
          started.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((item) => (
            <li key={item.id}>
              <Link
                href={`/items/${item.id}`}
                className="block rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {item.title ?? "(untitled — still processing)"}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-neutral-500 shrink-0">
                    {item.platform}
                  </span>
                </div>
                {item.summary && (
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1 line-clamp-2">
                    {item.summary}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs rounded-full px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800">
                    {STATUS_LABEL[item.status] ?? item.status}
                  </span>
                  {item.category && (
                    <span className="text-xs rounded-full px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800">
                      {item.category}
                    </span>
                  )}
                  {item.implemented && (
                    <span className="text-xs rounded-full px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                      Implemented
                    </span>
                  )}
                  {item.tags?.slice(0, 4).map((tag) => (
                    <span key={tag} className="text-xs text-neutral-400">
                      #{tag}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
