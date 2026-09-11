import Link from "next/link";
import type { Item } from "@/db/schema";
import { MAX_ATTEMPTS } from "@/lib/process-item";
import { categoryLabel } from "./category-label";
import { relativeTime } from "./relative-time";
import { TagLink } from "./TagLink";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  processing: "Processing…",
  done: "Ready",
};

/**
 * The whole card is a "stretched link" to the item page: an absolutely
 * positioned `<Link>` fills the card, and interactive children (tags) sit
 * above it with `relative z-10` so they still get their own clicks instead of
 * the invalid HTML of an `<a>` nested inside an `<a>`.
 */
export function ItemCard({ item }: { item: Item }) {
  return (
    <li className="relative rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors">
      <Link
        href={`/items/${item.id}`}
        className="absolute inset-0"
        aria-label={item.title ?? "Open item"}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{item.title ?? "(untitled — still processing)"}</span>
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
        {item.status === "failed" ? (
          <span className="text-xs rounded-full px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
            attempt {item.attempts}/{MAX_ATTEMPTS} · failed
          </span>
        ) : item.status === "needs_note" ? (
          <span className="text-xs rounded-full px-2 py-0.5 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
            needs note
          </span>
        ) : (
          <span className="text-xs rounded-full px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800">
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        )}
        {item.category && (
          <span className="text-xs rounded-full px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800">
            {categoryLabel(item.category)}
          </span>
        )}
        {item.implemented && (
          <span className="text-xs rounded-full px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
            Implemented
          </span>
        )}
        <span className="text-xs text-neutral-400">{relativeTime(item.createdAt)}</span>
        {item.tags?.slice(0, 4).map((tag) => (
          <TagLink
            key={tag}
            tag={tag}
            className="relative z-10 text-xs text-neutral-400 hover:underline"
          />
        ))}
      </div>
    </li>
  );
}
