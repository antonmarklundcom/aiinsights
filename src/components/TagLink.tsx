import Link from "next/link";

/** A tag rendered as a link that sets `?tag=` on the dashboard (plan §6.1). */
export function TagLink({ tag, className }: { tag: string; className?: string }) {
  return (
    <Link href={`/?tag=${encodeURIComponent(tag)}`} className={className}>
      #{tag}
    </Link>
  );
}
