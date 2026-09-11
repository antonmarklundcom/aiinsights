# Phase S1 — Dashboard filters, pagination, components. SONNET session. Lane 2, parallel with S2–S4.

Read ONLY: this file, `plan.md` §1, §2, §4, §6.1, the phase table and §9 index,
`docs/log/O1.md`, `docs/log/O3.md`. Do not read the rest.
Execute under the autonomy protocol §4. Build nothing outside §6.1.

Owns: `src/app/page.tsx`, `src/app/items/**`, `src/components/**`, `src/app/globals.css`,
`public/**`, `docs/log/S1.md`.

Hard limits: no schema changes, no auth changes, no edits to `src/lib/process-item.ts`,
`src/lib/summarize.ts`, `src/lib/env.ts`, `src/proxy.ts`. The `q` search param stays; S4
replaces its implementation. Workaround + plan §10 note instead of touching foundation.

Budget: one session, ≤ 90 min. When the exit criteria pass, open the PR that turn.

Phase rules:
- Branch `phase/S1` off latest `main`. WIP commit every 30 min.
- `npm ci`. Read `node_modules/next/dist/docs/01-app/01-getting-started/` (server/client
  components, linking) before writing components. Server components by default; the only
  client component is the copy-as-Markdown button.
- Category list is imported from `src/db/schema.ts`; never a second copy.
- Cursor pagination on `(created_at, id)`; no offset.
- Keep Tailwind utility styling; no new dependencies.
- ONE screenshot pass at the end (Playwright is preinstalled; `/` empty, `/` filtered,
  `/items/[id]` at 390 and 1280 px, with the DB mocked or a seeded local run). Attach to the
  PR; do not commit PNGs.
- Re-runnable; minor issues → `docs/log/S1.md`; stop only per §4.4.

Exit (all): category + tag filters work via URL params; tags clickable; "Load more" cursor
works; detail page shows model/tokens and copy-as-Markdown; Geist font applied; unused SVGs
removed; lint/typecheck/test/build green; CI green; PR merged; `docs/log/S1.md` written.

## After this phase
Follow `prompts/_handoff.md`. Spawn nothing.
