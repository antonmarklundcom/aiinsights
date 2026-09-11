/** Turns a kebab-case category id ("ai-coding-tool") into a readable label ("AI coding tool"). */
export function categoryLabel(category: string): string {
  return category
    .split("-")
    .map((word, i) =>
      word === "ai" ? "AI" : i === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word
    )
    .join(" ");
}
