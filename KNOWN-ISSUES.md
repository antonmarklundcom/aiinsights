# Known issues

Cross-phase items still open after the build (see `docs/log/*.md` for full detail on
each). Resolved items are not listed here.

## Data / migrations

- **Duplicate rows could block the O1 migration.** The unique index on
  `(telegram_chat_id, telegram_message_id)` added in `drizzle/0001` will fail to
  create if the production database already holds two rows with the same pair.
  Nothing in the pre-migration code path could have written one, but this was
  never checked against the real Neon database (no credentials were available in
  any build session) — worth a one-off duplicate check before running
  `db:migrate` against production for the first time.
- **Token/cost figures read low once prompt caching kicks in.** `summarize.ts`
  records `input_tokens`/`output_tokens` from the API response but not
  `cache_read_input_tokens`. The system prompt is cached (`cache_control`), so
  once a cache hit occurs the dashboard's per-item token counts undercount the
  actual usage. No column exists for it yet (plan §2).
- **`attempts` is claimed with a non-atomic read-then-write.** Two concurrent
  processing runs on the same item (e.g. the retry cron racing a manual re-run)
  could both observe the same `attempts` count. Acceptable for a single-user app;
  would need a transaction or a conditional update to close.

## Dashboard

- **Tag filtering is exact and case-sensitive.** `?tag=` matches via jsonb
  containment with no normalization layer. Fine while tags are Claude-generated
  and lowercase by convention; would need a normalize-on-write step (or a
  case-insensitive match) if that ever stops holding.
- **No `loading.tsx` for `/` or `/items/[id]`.** Both routes are already
  `force-dynamic` (the root layout reads the session cookie), which was true
  before this build and is unchanged by it.

## Auth / API

- **A future non-exempt `/api/*` route gets a 302 to `/login` instead of a 401.**
  The proxy's contract (plan §5.3) is "redirect for every path except the listed
  exemptions," which is what it does. Any new API route should call
  `requireSession()` itself and decide its own status code rather than relying on
  the proxy.
- **`requireSession()` throws a plain `Error`** on the server-action path, which
  React surfaces as a generic action failure rather than a friendly message.
  Acceptable for a single-user app.

## Operational

- **The retry cron needs a Vercel plan with sub-daily crons.** `vercel.json`
  schedules `/api/cron/reprocess` every 15 minutes; the Hobby plan only runs
  crons once a day. Documented in the README's deploy steps — confirm the plan,
  or widen the schedule.
- **Screenshot capture (`downloadTelegramPhoto`) is untested against the real
  Telegram Bot API** — no `TELEGRAM_BOT_TOKEN` was available in any build
  session. Worth a manual round-trip after the first production deploy.
