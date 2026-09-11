# AI Insights — improvement plan

Companion to `docs/improvement-report.md` (the reasoning). This file is the contract every
build session works from. Phases are PRs. Opus phases run first, sequentially; Sonnet phases
run after, in parallel; one final Sonnet link pass.

## Phase table

| Phase | Lane | Model | Prompt file | Plan §§ | Owns | Depends on |
|---|---|---|---|---|---|---|
| O1 Foundation | 1 | **Opus** | `prompts/opus-1-foundation.md` | §5.1 | `src/db/**`, `drizzle/**`, `drizzle.config.ts`, `src/lib/env.ts`, `package.json`, `.env.example`, `.github/workflows/ci.yml`, `README.md` (setup sections only) | — |
| O2 Pipeline | 1 | **Opus** | `prompts/opus-2-pipeline.md` | §5.2 | `src/app/api/telegram/webhook/**`, `src/app/api/cron/**`, `src/lib/process-item.ts`, `src/lib/summarize.ts`, `src/lib/telegram.ts`, `src/lib/urls.ts`, `vercel.json` | O1 |
| O3 Auth | 1 | **Opus** | `prompts/opus-3-auth.md` | §5.3 | `src/proxy.ts`, `src/lib/auth.ts`, `src/app/login/**`, `src/lib/actions.ts`, `src/app/layout.tsx` | O1 |
| S1 Dashboard | 2 | **Sonnet** | `prompts/sonnet-1-dashboard.md` | §6.1 | `src/app/page.tsx`, `src/app/items/**`, `src/components/**`, `src/app/globals.css`, `public/**` | O1, O3 |
| S2 Tests | 2 | **Sonnet** | `prompts/sonnet-2-tests.md` | §6.2 | `src/**/*.test.ts`, `src/test/**`, `vitest.config.ts` | O1, O2 |
| S3 Screenshots | 2 | **Sonnet** | `prompts/sonnet-3-screenshots.md` | §6.3 | `src/lib/telegram-files.ts`, `src/lib/vision.ts`, a new block in `src/lib/summarize.ts` marked `/* == S3 == */`, a new branch in the webhook marked `/* == S3 == */` | O1, O2 |
| S4 Search | 2 | **Sonnet** | `prompts/sonnet-4-search.md` | §6.4 | `src/lib/search.ts`, one new migration in `drizzle/`, `src/db/schema.ts` (additive columns/indexes only) | O1, S1 |
| L1 Link pass | — | **Sonnet** | `prompts/sonnet-5-link-pass.md` | §6.5 | everything, edits only | all |

Fable is never a build model (§4.8).

## 1. Decisions already made — do not re-litigate

1. Stack stays: Next.js 16 App Router on Vercel, Neon Postgres, Drizzle, Anthropic SDK,
   Telegram Bot API. No queue service, no ORM change, no UI library.
2. Single user. Auth is one shared password, one signed cookie. No user table.
3. Webhook returns 200 immediately; processing runs in `after()` from `next/server`.
   Stuck items are retried by a Vercel cron route, max 3 attempts.
4. Duplicates are prevented by a unique index on `(telegram_chat_id, telegram_message_id)`.
   A re-forwarded URL that already exists gets a "already saved, here's the link" reply and
   no new row.
5. Summarization model: `claude-opus-5`, `output_config.effort = "low"`, no `thinking`
   param, `strict: true` tool schema, server-side refusal fallbacks enabled. Prompt in
   `system` with `cache_control`, item content in the user turn.
6. `category` is an enum (§2). Existing free-text values are mapped once in O2.
7. Schema changes go through committed Drizzle migrations. `db:push` is removed from the
   README; `db:migrate` replaces it.
8. Env is validated in `src/lib/env.ts`; in production the webhook secret, allowed chat id,
   dashboard password and cron secret are required. Missing in dev = warning, not crash.
9. Search is Postgres full-text (generated `tsvector` + GIN), not embeddings.
10. Instagram gap is closed by accepting screenshots (photo in the Telegram message → Claude
    vision), not by scraping harder.
11. Summaries are always written in English regardless of source language.
12. CI = GitHub Actions running `lint`, `typecheck`, `test`, `build` on every PR.

## 2. Content model

Table `items` (existing) gains:

| Column | Type | Notes |
|---|---|---|
| `attempts` | integer not null default 0 | incremented per processing run |
| `last_attempt_at` | timestamptz | set at the start of each run |
| `ai_model` | varchar(60) | model id that produced the summary |
| `ai_input_tokens`, `ai_output_tokens` | integer | from `usage` |
| `image_file_id` | text | Telegram `file_id` of an attached screenshot (S3) |
| `search` | tsvector, generated always, stored | S4 |

Constraints: unique `(telegram_chat_id, telegram_message_id)`; index on `url`; GIN on `search`.

`status` stays a varchar with values `pending | processing | done | needs_note | failed`.

`category` enum (Postgres enum `item_category`, also exported as a TS const array in
`src/db/schema.ts` so the tool schema and the dashboard filter import the same list):

```
ai-coding-tool | ai-model-or-api | agent-or-automation | self-hosting | dev-workflow |
productivity | browser-extension | design-or-ui | data-or-scraping | learning-resource | other
```

Mapping of legacy free-text values (O2 does this once in a data migration): anything
containing "coding" → `ai-coding-tool`; "model"/"api" → `ai-model-or-api`; "automation"/
"agent" → `agent-or-automation`; "self-host" → `self-hosting`; "workflow" → `dev-workflow`;
"productivity" → `productivity`; "extension" → `browser-extension`; else `other`.

## 3. Feature scope

Core (this plan): reliability of capture (§5.2), security (§5.3, §5.1 env), migrations + CI
(§5.1), better summaries (§5.2), dashboard filters/search/pagination (§6.1, §6.4),
screenshot capture (§6.3), tests (§6.2). Backlog in §10.

## 4. Autonomy protocol

1. Work until the phase's exit criteria all pass; never ask permission for in-plan work.
2. One PR per phase: branch `phase/<id>` off latest `main`; create, watch, and merge the PR
   when CI is green; a red build is the session's own work. Lane 2 phases never wait for
   each other, only for their `Depends on` list.
3. Minor non-blocking issues → the phase's `docs/log/<id>.md` "Known issues". Only open
   cross-phase items get promoted to root `KNOWN-ISSUES.md` by the link pass.
4. Stop and ask ONLY for a missing credential with no graceful fallback, or a bad-foundation
   decision (schema, auth, processing contract) where guessing wrong forces a rewrite.
   "Ask" means: append to `docs/decisions-needed.md`, commit, push, end the session.
5. Missing env values never block: document in `.env.example`, degrade gracefully.
6. Every prompt is re-runnable: check what exists on the branch first, continue from the
   first unmet exit criterion. WIP commit at least every 30 minutes.
7. Lane 2 hard limits: no schema changes except the additive ones the phase table names, no
   auth changes, no changes to the processing contract in §5.2. Workaround + §10 note instead.
8. **Model cost guardrail** — Fable (`claude-fable-5*`, Mythos-class) is never used for
   build phases, subagents, spawned sessions, watchers or Routines. Phase tables only name
   Opus and Sonnet. If a session believes Fable is needed, it writes why to
   `docs/decisions-needed.md` and ends.
9. **File ownership** — a phase writes only to its `Owns` paths, plus its own
   `docs/log/<id>.md`, its own new test files, and appended `/* == <id> == */` blocks where
   the table says so. On `git merge main` conflicts: main wins, re-apply your change, re-run
   checks. Cannot resolve inside your files → `docs/decisions-needed.md`, push, end.
10. **Handoff** — a phase is done when: PR merged green; exit checklist passed; one
    adversarial re-read of the merged diff with findings fixed in one follow-up commit; phase
    log committed. Then lane 1 phases spawn the next lane 1 phase (`create_session`, inherit
    environment and permission mode, never `plan`, `model` explicitly per the phase table,
    prompt exactly `Read prompts/<next>.md in this repo and execute it.`). O3 (last lane 1)
    creates the watcher Routine (`prompts/_watcher.md`), then spawns S1–S4 at once. Lane 2
    phases spawn nothing. The link pass is spawned by the watcher once S1–S4 are merged; it
    deletes the watcher before its closing report. Fallback when `create_session` is
    unavailable: continue in the same window if the next phase uses the same model; stop and
    report at a model switch.
11. **Phase log** `docs/log/<id>.md`: ≤ 12 lines "Built", ≤ 8 "Decisions", ≤ 8 "Known
    issues", one line "Verification: CI green on <sha>". Add the index line to §9.
12. **Orientation read** — a fresh session reads: its prompt file, plan §1 and §4, its own
    plan section, the phase table, §9, and `docs/log/<dep>.md` for its dependencies. Not the
    whole plan, not every log. Then `npm ci` and the relevant guide in
    `node_modules/next/dist/docs/` before writing any Next.js code (AGENTS.md rule).
13. **Polish cap** — the PR body is written once (≤ 25 lines). When every exit criterion
    passes, open the PR that turn. Ideas found afterwards go to §10, not to commits.
14. **Decisions travel by files** — to change what a running phase does, edit its prompt file
    on `main`. Never message a running session.
15. **Verification is local first** — `npm run lint && npm run typecheck && npm test &&
    npm run build` must pass before every push. No Neon credentials are available in build
    sessions: anything touching the DB is tested with the mocked `db` module (S2 sets the
    pattern; O1 ships the first mock) and migrations are verified by `drizzle-kit generate`
    producing a clean diff, not by applying them.

## 5. Lane 1 phases (Opus, sequential)

### 5.1 O1 Foundation — schema, migrations, env, CI

- Create `drizzle/` from the **current** schema first (`npm run db:generate`) so migration
  0000 is the baseline. Then add the §2 columns, enum, unique index and `url` index as
  migration 0001. Do NOT add the `search` tsvector (S4 owns it).
- `drizzle.config.ts`: only require `DATABASE_URL` for commands that need it (read it lazily;
  `generate` must work without it).
- `package.json`: add `typecheck` (`tsc --noEmit`), `db:migrate` (`drizzle-kit migrate`),
  remove `db:push` from README (keep the script). Pin nothing new.
- `src/lib/env.ts`: single exported `env` object. Required always: `DATABASE_URL`,
  `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`. Required when `NODE_ENV === "production"`:
  `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID`, `DASHBOARD_PASSWORD`,
  `CRON_SECRET`, `AUTH_COOKIE_SECRET`. Optional: `GITHUB_TOKEN`. Throw a single readable
  error listing every missing key. Do not use zod; a 40-line hand-rolled check is enough.
  `src/db/index.ts` and `drizzle.config.ts` read through `env`.
- `.env.example`: every key above with a one-line comment.
- `.github/workflows/ci.yml`: Node 22, `npm ci`, `lint`, `typecheck`, `test`, `build`.
  `build` needs placeholder env values: set dummy `DATABASE_URL` etc. in the workflow env.
- `src/test/db-mock.ts`: a `vi.mock("@/db")` helper exposing an in-memory `items` array with
  `select/insert/update/delete` chains sufficient for the webhook tests S2 will write. Keep
  it small; S2 extends it.
- README: replace the `db:push` step with `db:migrate`, list the new env vars, mention CI.

Exit: `drizzle/0000_*.sql` and `0001_*.sql` committed and `drizzle-kit generate` produces no
further diff; `npm run typecheck && npm run lint && npm test && npm run build` green locally
and in CI on the PR; `env.ts` unit-tested for the production-required rule; PR merged.

### 5.2 O2 Pipeline — webhook, processing contract, Claude call

- Webhook (`route.ts`): validate secret and chat id via `env` (fail closed). Insert the row,
  reply "Saved, digging in…", return 200, and run `processAndReply(id)` inside `after()`.
  Catch the unique-violation on `(chat_id, message_id)` and return 200 silently (Telegram
  retry). Before inserting, look up an existing row with the same cleaned `url`; if found,
  reply with its title + dashboard link and do not insert.
- Apply `stripTrackingParams` to `repoUrl` as well.
- Help texts: "Send me any link (Instagram, YouTube, GitHub, an article…)" — drop the
  Instagram-or-YouTube wording.
- `telegram.ts`: check the response, log non-2xx with the Telegram error description,
  truncate text to 4,000 chars with an ellipsis before sending. Export a `TelegramUpdate`
  type that includes `photo?: Array<{ file_id: string; width: number; height: number }>`
  (S3 uses it; you just declare it).
- `process-item.ts` becomes the **processing contract** other phases build on:
  `processItem(id, opts?: { force?: boolean })`. It increments `attempts`, sets
  `last_attempt_at`, refuses to run if `attempts >= 3` unless `force` (dashboard re-run passes
  `force: true`), and records `ai_model` + tokens on success. Keep the `needs_note` path.
  Export `MAX_ATTEMPTS`.
- `summarize.ts`: per §1.5. Return `{ output, usage: { model, inputTokens, outputTokens } }`.
  `category` enum from `src/db/schema.ts`. Transcript cap 30,000 chars, with the truncation
  stated in the prompt. Instruct: English output; if source is Swedish/Spanish, still English.
  Enable fallbacks per the `claude-api` skill (`betas: ["server-side-fallback-2026-07-01"]`,
  `fallbacks: "default"`, on `client.beta.messages.create`). Handle `stop_reason ===
  "refusal"` by throwing a clear error (the item goes to `failed` with that message).
  Load the `claude-api` skill before touching this file; do not write the call from memory.
- One-off data migration (`drizzle/0002_*.sql`, hand-written, idempotent) mapping legacy
  free-text `category` values per §2 before the column becomes the enum type.
- `src/app/api/cron/reprocess/route.ts`: GET, requires `Authorization: Bearer ${CRON_SECRET}`.
  Selects items in `pending`/`processing` with `last_attempt_at` older than 10 min (or null)
  and `attempts < 3`, runs `processItem` on up to 10 of them, returns counts. `vercel.json`
  schedules it every 15 minutes.
- Dashboard actions (`actions.ts`) keep their signatures; `retryProcessing` passes `force`.

Exit: unit tests for `summarize` request shape (mocked SDK: model id, effort, strict, enum,
fallbacks present), for the dedupe branch and the unique-violation branch of the webhook (DB
mocked), and for the cron selection rule; `npm run build` green; CI green; PR merged.

### 5.3 O3 Auth — shared password, signed cookie, proxy

- `src/lib/auth.ts`: `signSession()` / `verifySession(cookie)` using HMAC-SHA256 over
  `expiresAt` with `AUTH_COOKIE_SECRET` (Web Crypto, works in the proxy runtime). 30-day
  expiry. `constantTimeEqual` for the password check.
- `src/app/login/page.tsx` + server action: password form, sets httpOnly, secure, sameSite=lax
  cookie `ai_session`, redirects to `/`. Wrong password: re-render with an error, 500 ms
  delay. Logout action clears it.
- `src/proxy.ts`: redirect to `/login?next=…` when the cookie is missing/invalid for every
  path except `/login`, `/api/telegram/*`, `/api/cron/*`, `/_next/*`, `/favicon.ico`. Read
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md` first.
- Server actions in `actions.ts`: each calls `requireSession()` (reads the cookie via
  `cookies()`) and throws if absent. Proxy is optimistic; the action check is the real gate.
- `layout.tsx`: a small header with a "Log out" form when a session exists.
- Dev convenience: if `DASHBOARD_PASSWORD` is unset in development, the proxy lets requests
  through and logs one warning.

Exit: tests for `signSession`/`verifySession` (tamper, expiry) and the password comparison;
manual check documented in the phase log: unauthenticated `/` → 302 to `/login`, webhook and
cron still reachable without a cookie; CI green; PR merged. Then: create the watcher
Routine, spawn S1–S4.

## 6. Lane 2 phases (Sonnet, parallel)

Hard limits for every lane 2 phase: no changes to `src/lib/env.ts`, `src/lib/auth.ts`,
`src/proxy.ts`, `src/lib/process-item.ts` (except S3's marked block), or existing migrations.

### 6.1 S1 Dashboard

- Filters: add category (enum from schema) and tag (`?tag=`) filters; tags on cards and on
  the detail page are links that set `?tag=`. Keep platform/status/implemented filters.
- Pagination: 50 per page, cursor on `(created_at, id)`, "Load more" as a link that appends
  `?before=<cursor>`. Remove the hard 100 limit.
- Cards show: category pill, up to 4 tags, relative saved time, a small "attempt N/3 · failed"
  or "needs note" badge where relevant.
- Detail page: show `ai_model` and token counts as a muted line; a "Copy as Markdown" button
  (client component) producing title, url, summary, steps; the re-run button says
  "Re-run summary (forces past 3 attempts)".
- `globals.css`: `body { font-family: var(--font-sans) }`; delete unused `public/*.svg`.
- Extract `ItemCard`, `FilterBar`, `TagLink` into `src/components/`.
- Search input stays as-is in S1 (S4 replaces the query implementation; keep the `q` param).

Exit: lint/typecheck/build green; screenshots of `/` (empty + filtered) and `/items/[id]`
at 390 px and 1280 px attached to the PR; PR merged.

### 6.2 S2 Tests

- `page-meta.test.ts`: entity decoding, `og:` vs `<title>` fallback, attribute order variants,
  non-2xx → nulls (mock `fetch`).
- `youtube.test.ts`: caption-track extraction from a fixture watch-page snippet in
  `src/test/fixtures/`, `json3` event flattening, no-tracks → null, `en` preference.
- `telegram.test.ts`: truncation at 4,000 chars, non-2xx logged, HTML escaping of the reply
  formatter (move `formatReply`/`escapeHtml` from the route into `src/lib/telegram-format.ts`
  if O2 did not already; that file is yours).
- `webhook.test.ts` (extend O2's): no text → help reply; link → insert + `after` scheduled;
  note reply → attaches to latest `needs_note`; wrong chat id → silent 200; wrong secret → 401.
- Extend `src/test/db-mock.ts` as needed; keep it under 150 lines.
- `vitest.config.ts` with `environment: "node"`, coverage reporter text; add
  `test:coverage` script. Target: `src/lib/**` ≥ 80 % lines. Do not chase 100 %.

Exit: `npm test` green with the new files, coverage line printed in the phase log; PR merged.

### 6.3 S3 Screenshots (Instagram gap)

- `src/lib/telegram-files.ts`: `downloadTelegramPhoto(fileId)` → `getFile` → download bytes
  → `{ base64, mediaType }`. Pick the largest `photo` size ≤ 1,600 px.
- Webhook branch `/* == S3 == */`: if `message.photo` exists, store `image_file_id` on the row
  (link or no link; a photo alone with a caption is a valid capture: `url` becomes the
  Telegram `file_id` pseudo-URL `tg://photo/<file_id>`, platform `other`). Caption text is
  the note.
- `summarize.ts` block `/* == S3 == */`: when the item has `image_file_id`, download and pass
  the image as an `image` content block before the text in the user turn, with the
  instruction "This screenshot was taken by the user of the content; read any visible text
  (repo names, captions, commands) and use it." The image is fetched at summarize time, not
  stored.
- `process-item.ts` marked block: `hasContent` is also true when `image_file_id` is set.
- Bot help text gains one line: "You can also send a screenshot."

Exit: tests for photo-size selection and the `hasContent` rule; a manual run against the
real bot documented in the log if `TELEGRAM_BOT_TOKEN` is available, otherwise stated as
untested-live; CI green; PR merged.

### 6.4 S4 Search

- Migration `drizzle/000N_search.sql` (via `db:generate` after editing schema): generated
  stored column `search tsvector` =
  `setweight(to_tsvector('simple', coalesce(title,'')), 'A') || setweight(to_tsvector('simple',
  array_to_string(tags, ' ')), 'A') || setweight(to_tsvector('simple', coalesce(summary,'')),
  'B') || setweight(to_tsvector('simple', coalesce(user_note,'') || ' ' ||
  coalesce(source_caption,'')), 'C')`. Use Drizzle's `generatedAlwaysAs` with the `sql`
  helper; `tags` is jsonb so use `jsonb_array_elements_text` inside a subselect or cast —
  pick what generates cleanly and test the SQL in the migration file by reading it.
  Config `simple`, not `english`, because content mixes languages.
- GIN index on `search`.
- `src/lib/search.ts`: `buildSearchCondition(q)` using `websearch_to_tsquery('simple', q)`,
  ranked with `ts_rank`; fall back to the old `ILIKE` (with `%`/`_` escaped) when the query
  is under 3 characters.
- Wire into `page.tsx`'s existing `q` param (edit only the query-building lines).

Exit: unit test for `buildSearchCondition` (escaping, short-query fallback); migration file
reviewed and committed; CI green; PR merged.

### 6.5 L1 Link pass

- Merge-order sanity: all S-phases merged, `main` builds and tests green.
- README: update feature list (screenshots, search, filters, auth), env vars, cron.
- `KNOWN-ISSUES.md`: promote still-open cross-phase items from the `docs/log/*.md` files.
- Delete the watcher Routine. Closing report as the PR body.

## 7. Human-inputs checklist

| Item | First needed | Note |
|---|---|---|
| Set new Vercel env vars: `DASHBOARD_PASSWORD`, `AUTH_COOKIE_SECRET` (32+ random chars), `CRON_SECRET` | before deploying O3 | `openssl rand -hex 32` |
| Run `npm run db:migrate` against Neon once after O1 merges, then after O2 and S4 | O1 merge | or let Vercel run it as a build step — decide in O1 log |
| Vercel cron requires the Hobby/Pro plan cron feature | O2 deploy | free plan allows daily crons only; if so set `vercel.json` to daily and note it |
| Re-register the Telegram webhook only if the URL changed | never, unless domain changes | |

## 8. Open business questions (parked)

- Should the weekly "you saved this and never tried it" digest exist? (§10)
- Is a second capture channel (email-to-bot, browser extension) worth it?

## 9. Build log index

| Phase | PR | Log |
|---|---|---|
| plan | this PR | — |
| O1 Foundation | #4 | `docs/log/O1.md` |
| O2 Pipeline | #5 | `docs/log/O2.md` |
| O3 Auth | #6 | `docs/log/O3.md` |
| S4 Search | TBD | `docs/log/S4.md` |
| S2 Tests | #7 | `docs/log/S2.md` |

## 10. Backlog

- Weekly Telegram digest of un-implemented items (Vercel cron + one Claude call).
- Export item(s) as Markdown / Obsidian vault.
- Whisper/ASR fallback for videos with no caption track.
- Semantic search when items exceed ~2,000.
- Innertube-based YouTube transcript fetch if the watch-page scrape breaks.
- Multi-user support (only if the app is ever shared).
