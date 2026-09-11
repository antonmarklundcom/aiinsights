import Link from "next/link";
import { ITEM_CATEGORIES } from "@/db/schema";
import { categoryLabel } from "./category-label";
import { buildQueryString } from "./query-string";

const inputClass =
  "rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm";

export function FilterBar({
  q,
  platform,
  status,
  implemented,
  category,
  tag,
}: {
  q: string;
  platform: string;
  status: string;
  implemented: string;
  category: string;
  tag: string;
}) {
  return (
    <div className="mb-6">
      <form className="flex flex-wrap gap-2" action="/">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Search title, summary, url…"
          className={`flex-1 min-w-[200px] ${inputClass}`}
        />
        <select name="platform" defaultValue={platform} className={inputClass}>
          <option value="">All platforms</option>
          <option value="instagram">Instagram</option>
          <option value="youtube">YouTube</option>
          <option value="other">Other</option>
        </select>
        <select name="status" defaultValue={status} className={inputClass}>
          <option value="">Any status</option>
          <option value="done">Ready</option>
          <option value="needs_note">Needs note</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
        </select>
        <select name="implemented" defaultValue={implemented} className={inputClass}>
          <option value="">Implemented + not</option>
          <option value="no">Not implemented</option>
          <option value="yes">Implemented</option>
        </select>
        <select name="category" defaultValue={category} className={inputClass}>
          <option value="">All categories</option>
          {ITEM_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
        {tag && <input type="hidden" name="tag" value={tag} />}
        <button
          type="submit"
          className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium"
        >
          Filter
        </button>
      </form>
      {tag && (
        <div className="mt-2 flex items-center gap-2 text-sm text-neutral-500">
          <span>Tag: #{tag}</span>
          <Link
            href={`/?${buildQueryString({ q, platform, status, implemented, category })}`}
            className="underline underline-offset-2"
          >
            Clear
          </Link>
        </div>
      )}
    </div>
  );
}
