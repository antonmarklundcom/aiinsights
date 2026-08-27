/** Fetch a repo's README (best-effort, works unauthenticated at low rate limits;
 * set GITHUB_TOKEN to raise the limit). Returns a trimmed excerpt for grounding
 * the AI summary — not the full file. */
export async function fetchRepoReadme(repoUrl: string): Promise<string | null> {
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
  if (!match) return null;
  const [, owner, repo] = match;
  const cleanRepo = repo.replace(/\.git$/, "");

  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.raw+json",
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${cleanRepo}/readme`,
      { headers }
    );
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 6000);
  } catch {
    return null;
  }
}
