"use client";

import { useState } from "react";

/** The only client component in the dashboard (plan §6.1) — everything else stays server-rendered. */
export function CopyMarkdownButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (insecure context, denied permission); nothing to recover to.
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium"
    >
      {copied ? "Copied!" : "Copy as Markdown"}
    </button>
  );
}
