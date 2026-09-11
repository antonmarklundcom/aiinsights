# Phase O2 — Pipeline: webhook, processing contract, Claude call, cron. OPUS session. Lane 1.

Read ONLY: this file, `plan.md` §1, §2, §4, §5.2, the phase table and §9 index,
`docs/log/O1.md`, and `docs/improvement-report.md` §1, §3, §7. Do not read the rest.
Execute under the autonomy protocol §4. Build nothing outside §5.2.

Owns: `src/app/api/telegram/webhook/**`, `src/app/api/cron/**`, `src/lib/process-item.ts`,
`src/lib/summarize.ts`, `src/lib/telegram.ts`, `src/lib/telegram-format.ts`, `src/lib/urls.ts`,
`src/lib/actions.ts` (the `force` flag only), `vercel.json`, one hand-written data migration
in `drizzle/`, `docs/log/O2.md`.

Budget: one session, ≤ 90 min. When the exit criteria pass, open the PR that turn.

Phase rules:
- Branch `phase/O2` off latest `main`. WIP commit every 30 min.
- `npm ci`. Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md`
  and `.../03-file-conventions/route.md` before editing the route.
- Load the `claude-api` skill BEFORE editing `summarize.ts`. Model `claude-opus-5`, effort
  low, no `thinking` param, `strict: true`, enum `category`, fallbacks per the skill. Do not
  write the API call from memory.
- Move `formatReply`/`escapeHtml` out of the route into `src/lib/telegram-format.ts`.
- The unique-violation catch must match Postgres code `23505` via the Neon error shape; test
  it with the mock throwing that shape.
- Legacy category mapping is one idempotent SQL migration; read plan §2 for the rules.
- Re-runnable; minor issues → `docs/log/O2.md`; stop only per §4.4.

Exit (all): webhook returns 200 before processing (test asserts `after` was called and the
response resolved); dedupe-by-url and unique-violation branches tested; `summarize` request
shape tested with the SDK mocked; cron route selection rule tested; `MAX_ATTEMPTS` enforced
and `force` bypasses it; `vercel.json` cron present; lint/typecheck/test/build green; CI
green; PR merged; `docs/log/O2.md` written (note whether the Vercel plan allows a 15-min cron).

## After this phase
Follow `prompts/_handoff.md`. Next: `prompts/opus-3-auth.md`, model **Opus**.
