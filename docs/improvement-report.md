# AI Insights — improvement report

Written 2026-09-11 after a full read of the codebase at commit `e4210fb` (about 1,300 lines:
Telegram webhook, processing pipeline, Claude summarization, two-page dashboard).
The decisions below are final and are carried into `plan.md`. This file is the *why*;
`plan.md` is the *what and who*.

## What is good and stays

- The shape is right: capture → gather → summarize → dashboard, all in one Next.js app on
  Vercel with Neon. No queue, no workers. Keep it that way; the fixes below stay inside it.
- `src/lib/urls.ts` is clean, host-matched correctly, and tested. It is the model for the
  rest of `src/lib`.
- Best-effort fetchers (`youtube.ts`, `page-meta.ts`, `github.ts`) fail to `null` instead of
  throwing. Keep that contract.
- Claude is called with a tool schema, so output is structured. Keep tool use; just tighten it.

## Findings, ranked by impact

### 1. The webhook does all the work inside the request (reliability — highest)

`src/app/api/telegram/webhook/route.ts` inserts the row, replies "Saved. Digging in…", then
**awaits** `processItem()` (YouTube scrape + GitHub README + Claude call) before returning 200.
Consequences:

- Telegram retries a webhook it does not get a 2xx from. A slow YouTube page or a slow Claude
  call past the function limit means a retry, which inserts a **duplicate row** (nothing is
  unique on `telegram_message_id`).
- If the function is killed mid-flight the item is stuck at `status = "processing"` forever.
  Nothing ever retries it.
- `maxDuration = 60` only masks this; it does not solve it.

**Decision:** return 200 as soon as the row exists and run processing with Next's `after()`
(post-response work that Vercel keeps alive). Add a unique index on
`(telegram_chat_id, telegram_message_id)` and treat a duplicate as "already saved". Add a
Vercel cron route that re-runs items stuck in `pending`/`processing` for more than 10 minutes
and marks them `failed` after 3 attempts (new `attempts` column).

### 2. Secrets are optional, and the dashboard is public (security)

- The webhook only checks `x-telegram-bot-api-secret-token` **if** `TELEGRAM_WEBHOOK_SECRET`
  is set. Unset in production means anyone can POST fake updates.
- `TELEGRAM_ALLOWED_CHAT_ID` is likewise optional.
- The dashboard (`/`, `/items/[id]`) has no auth at all. On a Vercel URL it is discoverable,
  and the delete/re-run actions are unauthenticated server actions.

**Decision:** one `src/lib/env.ts` that validates env at startup and **fails closed** in
production (secret and chat id required). Dashboard protected by a single shared password
(`DASHBOARD_PASSWORD`) checked in `proxy.ts` (Next 16's name for middleware — confirm in
`node_modules/next/dist/docs/`), issuing a signed httpOnly cookie. Single user, so no user
table, no OAuth. Server actions re-check the cookie.

### 3. Claude call is on a retired model and under-specified (quality + cost)

`src/lib/summarize.ts` uses `claude-sonnet-4-5`, `max_tokens: 1500`, a free-text `category`,
no `strict` schema, no usage logging, and the prompt is a single user message.

**Decision:**
- Model `claude-opus-5` (current generation; see the `claude-api` skill). It is the default
  for new Anthropic code and the per-item cost is cents. `output_config: { effort: "low" }`
  because this is extraction, not reasoning. Adaptive thinking is the model default; do not
  pass `thinking` at all.
- Enable server-side refusal fallbacks (`betas: ["server-side-fallback-2026-07-01"]`,
  `fallbacks: "default"`) so a rare policy decline still yields a summary.
- Tool schema gets `strict: true`, `additionalProperties: false`, and `category` becomes an
  **enum** (see plan §2) so the dashboard can filter on it. Migrate existing free-text
  categories with a one-off mapping in the same phase.
- Move the instructions into `system`, keep the per-item content in the user turn. Put
  `cache_control` on the system block (it is identical across calls).
- Record `usage.input_tokens` / `output_tokens` and the model id on the row (`ai_model`,
  `ai_input_tokens`, `ai_output_tokens`) so cost is visible on the dashboard.
- Transcript is sliced at 8,000 chars silently. Raise to 30,000 (Opus 5 has a 1M window; the
  cost is still cents) and say in the prompt that it may be truncated.
- Add a **Swedish/Spanish** note: if the transcript or caption is not in English, still write
  the summary in English (Anton reads all three; the dashboard is English).

### 4. No migrations, no CI, thin tests (maintainability)

- `drizzle/` does not exist; the README says `db:push`. Schema changes are unreviewable and
  unrepeatable.
- No GitHub Actions. `npm run lint`, `tsc`, `vitest`, `next build` are never run on a PR.
- Only `urls.ts` is tested. The webhook branching, HTML-entity decoding, caption-track
  parsing and the Telegram reply formatter are untested and are exactly where regressions
  will land.

**Decision:** commit generated Drizzle migrations (`npm run db:generate`, apply with
`db:migrate`); CI workflow running lint + typecheck + test + build on every PR; tests for
`page-meta`, `youtube` (fixture HTML), `telegram` reply formatting, and the webhook route
with the DB mocked.

### 5. Search and browsing are minimal (product)

- Search is `ILIKE '%q%'` on title/summary/url only. `%` and `_` in the query are not
  escaped. Tags, category, note, transcript are not searched. Hard limit of 100 rows, no
  pagination.
- No filter by category or tag; tags are not clickable.
- The dashboard cannot show cost, attempts, or when something was last processed.

**Decision:** Postgres full-text search via a generated `tsvector` column
(`title || summary || tags || user_note || source_caption`) with a GIN index and
`websearch_to_tsquery`; category filter driven by the enum; clickable tags; cursor pagination
(50 per page, "Load more" via search param).

### 6. Instagram is the weak capture path (product)

Instagram blocks the `og:` scrape most of the time, so most Reels go through the manual-note
flow. That is honest but slow.

**Decision:** accept **screenshots**. If the Telegram message carries a photo (Anton
screenshots the Reel caption or the repo name on screen), download it via the Bot API
(`getFile`), pass it to Claude as an image alongside whatever else was found, and skip the
note prompt. This is the single biggest UX win for the Instagram path and needs no scraping.
Text-only note fallback stays as-is.

### 7. Smaller items (fix in passing, listed so nobody re-discovers them)

- `globals.css` sets `font-family: Arial` on `body`, overriding the Geist fonts loaded in
  `layout.tsx`. Use `var(--font-sans)`.
- `public/*.svg` are create-next-app leftovers. Delete.
- Telegram messages over 4,096 chars fail silently (`sendTelegramMessage` ignores the
  response). Truncate the reply and log non-2xx.
- Bot help text still says "Instagram or YouTube" although any link is accepted.
- `drizzle.config.ts` throws without `DATABASE_URL`, which also breaks `db:generate`
  (generate needs no DB). Only require it for push/migrate.
- `README.md` describes `db:push`; update to the migration flow and the new env vars.
- Tracking-param stripping runs only on the content URL, not on `repoUrl`. Apply to both.

## Explicitly not doing (backlog, plan §10)

- Multi-user / OAuth. Single user is the design.
- A queue (Inngest, QStash). `after()` plus a stuck-item cron is enough at this volume.
- Whisper/ASR for videos without captions. Costly; screenshots cover the Instagram gap.
- Semantic (embedding) search. Full-text is enough at hundreds of items; revisit at thousands.
- Weekly digest ("3 things you saved and never tried") via Telegram. Nice, not now; noted.
- Export to Markdown/Obsidian.

## Who builds what

Foundation work that other steps build on (schema, env, auth, the processing contract, the
Claude call) is **Opus**, sequential, first. Everything that fills that shape (dashboard
features, tests, screenshots path, cleanup) is **Sonnet**, in parallel, after. Fable is not
used for any build step (see plan §4.8). Full table in `plan.md`.
