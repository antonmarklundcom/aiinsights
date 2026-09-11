import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { items } from "@/db/schema";
import { setImplemented, retryProcessing, saveNote, deleteItem } from "@/lib/actions";
import { CopyMarkdownButton } from "@/components/CopyMarkdownButton";
import { TagLink } from "@/components/TagLink";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isFinite(itemId)) notFound();

  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item) notFound();

  async function toggleImplemented() {
    "use server";
    await setImplemented(itemId, !item.implemented);
  }

  async function retry() {
    "use server";
    await retryProcessing(itemId);
  }

  async function addNote(formData: FormData) {
    "use server";
    const note = String(formData.get("note") ?? "").trim();
    if (note) await saveNote(itemId, note);
  }

  async function remove() {
    "use server";
    await deleteItem(itemId);
    redirect("/");
  }

  const markdownLines = [`# ${item.title ?? "Untitled"}`, "", item.url];
  if (item.summary) markdownLines.push("", "## Summary", "", item.summary);
  if (item.howToStart && item.howToStart.length > 0) {
    markdownLines.push("", "## Get started", "");
    item.howToStart.forEach((step, i) => markdownLines.push(`${i + 1}. ${step}`));
  }
  const markdown = markdownLines.join("\n");

  return (
    <main className="mx-auto max-w-2xl w-full px-6 py-10 flex-1">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← All items
      </Link>

      <h1 className="text-2xl font-semibold mt-3">{item.title ?? "Untitled"}</h1>

      <div className="flex items-center gap-2 mt-2 flex-wrap text-sm">
        <span className="rounded-full px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800">
          {item.platform}
        </span>
        <span className="rounded-full px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800">
          {item.status}
        </span>
        {item.category && (
          <span className="rounded-full px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800">
            {item.category}
          </span>
        )}
      </div>

      {item.aiModel && (
        <p className="text-xs text-neutral-400 mt-2">
          {item.aiModel} · {item.aiInputTokens ?? 0} in / {item.aiOutputTokens ?? 0} out tokens
        </p>
      )}

      {/* == L1 == */}
      {/* tg://photo/<file_id> (S3 screenshot captures) isn't a browsable URL. */}
      {item.url.startsWith("http://") || item.url.startsWith("https://") ? (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-blue-600 dark:text-blue-400 mt-3 break-all hover:underline"
        >
          {item.url}
        </a>
      ) : (
        <p className="text-sm text-neutral-400 mt-3 break-all">Screenshot capture (no link)</p>
      )}

      {item.repoUrl && (
        <a
          href={item.repoUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-blue-600 dark:text-blue-400 mt-1 break-all hover:underline"
        >
          Repo: {item.repoUrl}
        </a>
      )}

      {item.summary && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
            Summary
          </h2>
          <p className="mt-2">{item.summary}</p>
        </section>
      )}

      {item.tags && item.tags.length > 0 && (
        <div className="flex gap-2 flex-wrap mt-3">
          {item.tags.map((tag) => (
            <TagLink
              key={tag}
              tag={tag}
              className="text-xs rounded-full px-2 py-0.5 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            />
          ))}
        </div>
      )}

      {item.howToStart && item.howToStart.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
            Get started
          </h2>
          <ol className="mt-2 flex flex-col gap-2 list-decimal list-inside">
            {item.howToStart.map((step, i) => (
              <li key={i} className="text-sm">
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}

      {item.status === "needs_note" && (
        <section className="mt-6 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4">
          <p className="text-sm">
            No caption or transcript could be pulled for this one. Add a quick note about
            what it covered and I&apos;ll summarize it.
          </p>
          <form action={addNote} className="flex gap-2 mt-3">
            <input
              name="note"
              placeholder="e.g. repo for turning screenshots into React components"
              className="flex-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 px-4 py-2 text-sm font-medium"
            >
              Save
            </button>
          </form>
        </section>
      )}

      {item.status === "failed" && item.processingError && (
        <section className="mt-6 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
          <p className="text-sm text-red-800 dark:text-red-200">{item.processingError}</p>
        </section>
      )}

      {item.userNote && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-500 uppercase tracking-wide">
            Your note
          </h2>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{item.userNote}</p>
        </section>
      )}

      <div className="flex gap-2 mt-8 pt-6 border-t border-neutral-200 dark:border-neutral-800">
        <form action={toggleImplemented}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium"
          >
            {item.implemented ? "Mark as not implemented" : "Mark as implemented"}
          </button>
        </form>
        <form action={retry}>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium"
          >
            Re-run summary (forces past 3 attempts)
          </button>
        </form>
        <CopyMarkdownButton markdown={markdown} />
        <form action={remove}>
          <button
            type="submit"
            className="rounded-md border border-red-300 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-2 text-sm font-medium"
          >
            Delete
          </button>
        </form>
      </div>
    </main>
  );
}
