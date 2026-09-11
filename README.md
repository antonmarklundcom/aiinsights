# AI Insights

A personal knowledge base for the AI tools / open-source repos / dev tricks you see on
Instagram, YouTube, or anywhere else, and actually mean to try. Forward a link (or a
screenshot) to a Telegram bot, it saves it, pulls whatever it can (transcript, caption,
linked repo README, or the screenshot's own on-screen text), asks you for a one-line
note if it can't find anything, and asks Claude to turn it into a title, summary,
category, tags, and step-by-step "how to get started" — searchable in a
password-protected web dashboard.

## How it works

1. **Capture** — share a link to your bot (Instagram's native Share sheet includes
   Telegram directly), or just send a screenshot. The bot saves whatever link or
   image is in the message; it isn't picky about the source.
2. **Webhook** (`/api/telegram/webhook`) saves the item and immediately tries to
   gather content:
   - YouTube: video title (oEmbed) + captions/transcript (public caption track,
     no API key needed).
   - A screenshot (no link, or a link plus a photo): stored and later shown to
     Claude directly, so it can read on-screen text — repo names, captions,
     commands — that no scrape would find.
   - Any other link (Instagram, a Notion doc, an article, a bare repo link):
     best-effort `og:title`/`og:description` scrape. Instagram often blocks
     this — that's expected and handled.
   - If a GitHub/GitLab/etc. link is mentioned in the message (either as the
     saved link itself, or alongside it — e.g. an IG Reel about a repo), its
     README is fetched too and used to ground the summary.
   - Tracking params (`fbclid`, `utm_*`, `igsi`/`igshid`, ...) are stripped
     from saved URLs. Re-forwarding a link you already saved replies with a
     link to the existing item instead of creating a duplicate.
3. **Fallback** — if none of the above produced anything (common for Instagram
   Reels with no caption), the bot asks you to reply with a quick note
   ("repo that turns screenshots into React components"). Your next text reply
   in that chat is attached as the note and processing re-runs.
4. **Summarize** — Claude turns whatever content is available (text, transcript,
   README, or screenshot image) into a structured title, 2-4 sentence summary,
   category, tags, and concrete getting-started steps, always in English. A
   failed attempt is retried automatically (a Vercel cron sweeps stuck items
   every 15 minutes) up to 3 attempts before it's marked `failed`.
5. **Dashboard** (`/`) — behind a single shared password. Full-text search plus
   filters by platform, status, category, tag, and "implemented" state, with
   cursor pagination. Each item has a detail page where you can add/edit your
   note, re-run the summary (even past the 3-attempt limit), mark it
   implemented, copy it as Markdown, or delete it.

## Stack

- Next.js (App Router) on Vercel
- Neon Postgres + Drizzle ORM
- Anthropic API (Claude) for summarization, including screenshot vision
- Telegram Bot API for capture

## Setup

### 1. Database (Neon)

1. Create a free project at [neon.tech](https://neon.tech).
2. Copy the pooled connection string into `DATABASE_URL`.
3. Apply the schema:
   ```bash
   npm install
   npm run db:migrate
   ```
   Schema changes go through committed migrations in `drizzle/`: edit
   `src/db/schema.ts`, run `npm run db:generate` to write the SQL, commit it,
   then `npm run db:migrate` to apply. CI fails a PR whose schema has no
   matching migration.

   **If your database predates migrations** (its `items` table was created with
   the old `db:push` flow), migration `0000` is a baseline of exactly that table
   and will fail with `relation "items" already exists`. Mark it as already
   applied once, then migrate normally:

   ```sql
   CREATE SCHEMA IF NOT EXISTS drizzle;
   CREATE TABLE IF NOT EXISTS drizzle."__drizzle_migrations" (
     id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint
   );
   INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at") VALUES (
     '585077ddd6e68ea88cbe30089e74543dc16cb199432d10e4b1b6700a9beadad2',
     1789092093129
   );
   ```

   The hash is the sha256 of `drizzle/0000_clumsy_jetstream.sql` and the number is
   its `when` from `drizzle/meta/_journal.json`; the migrator skips anything older
   than the newest recorded timestamp. A fresh, empty database needs none of this —
   just run `npm run db:migrate`.

### 2. Anthropic

Create an API key at [console.anthropic.com](https://console.anthropic.com) and set
`ANTHROPIC_API_KEY`.

### 2b. Environment variables

`src/lib/env.ts` validates the environment and throws once, listing every missing
key, rather than failing later with an undefined value. `.env.example` documents
all of them.

| Variable | Required | What it's for |
|---|---|---|
| `DATABASE_URL` | always | Neon pooled connection string |
| `ANTHROPIC_API_KEY` | always | Claude summarization |
| `TELEGRAM_BOT_TOKEN` | always | Bot API calls |
| `TELEGRAM_WEBHOOK_SECRET` | production | Verifies webhook calls came from Telegram |
| `TELEGRAM_ALLOWED_CHAT_ID` | production | Locks the bot to your chat |
| `DASHBOARD_PASSWORD` | production | The single shared dashboard password |
| `CRON_SECRET` | production | Bearer token the retry cron route requires |
| `AUTH_COOKIE_SECRET` | production | Signs the dashboard session cookie |
| `GITHUB_TOKEN` | optional | Higher rate limit when fetching repo READMEs |

The production-only ones are a warning rather than a crash in development, so you
can run the dashboard locally without a bot. `next build` runs in production mode,
so a build needs all of them set — placeholder values are fine (see
`.github/workflows/ci.yml`).

### 3. Telegram bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram, run `/newbot`, follow
   the prompts. You'll get a token — that's `TELEGRAM_BOT_TOKEN`.
2. Pick a random secret string for `TELEGRAM_WEBHOOK_SECRET` (e.g.
   `openssl rand -hex 24`).
3. Deploy the app first (step 4) so you have a public URL, then register the
   webhook:
   ```bash
   curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
     -d "url=https://<your-vercel-domain>/api/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
4. Lock it to just you: message your bot anything, then run
   `curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates"` and read
   `message.chat.id` from the response. Set that as `TELEGRAM_ALLOWED_CHAT_ID`
   (redeploy after setting it).

On iOS/Android, Instagram's native Share sheet includes Telegram directly once
Telegram is installed — share a Reel/post → Telegram → search your bot's
username → send. No extension needed.

### 4. Deploy (Vercel)

1. Import this repo into Vercel.
2. Add all vars from `.env.example` as Environment Variables — set them on both
   **Production** and **Preview**, or preview deployments crash on first request.
3. Deploy.
4. Go back and finish step 3 above (webhook registration + chat id lock).
5. The dashboard is gated by a single shared password (`DASHBOARD_PASSWORD`); the
   login page sets a signed cookie (`AUTH_COOKIE_SECRET`) that lasts 30 days. The
   webhook and cron routes are never gated by this cookie — they check their own
   secrets instead.
6. The retry cron (`/api/cron/reprocess`, every 15 minutes) requires a Vercel plan
   with sub-daily cron schedules (Pro or higher). On the Hobby plan, Vercel runs it
   at most once a day, so a stuck item's retry can be delayed accordingly.

### 5. Local development

```bash
cp .env.example .env
# fill in .env
npm install
npm run dev
```

The webhook route works locally too if you tunnel it (e.g. `ngrok http 3000`)
and point `setWebhook` at the tunnel URL — useful for testing changes to the
summarization pipeline against your real Telegram chat.

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `main`:
`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, plus a check
that `src/db/schema.ts` has no changes missing from `drizzle/`. The build step
uses placeholder env values; nothing in CI reaches a real database.

Locally, the same four commands are the pre-push check:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

`npm run typecheck` runs `next typegen` first, because Next generates the route
and layout types (`LayoutProps`, `PageProps`) that `tsc` needs.

## Notes / limitations

- Instagram has no public transcript/caption API, so most Reels rely on the
  note-fallback flow, or on sending a screenshot instead — both by design, not
  a bug.
- YouTube transcript fetching relies on scraping the public caption track from
  the watch page; if YouTube changes that page's structure it may need updating
  in `src/lib/youtube.ts`.
- This is single-user by design: the bot only accepts messages from
  `TELEGRAM_ALLOWED_CHAT_ID`, and the dashboard sits behind the single shared
  `DASHBOARD_PASSWORD`. See KNOWN-ISSUES.md for open items.
