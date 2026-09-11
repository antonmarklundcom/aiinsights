# AI Insights

A personal knowledge base for the AI tools / open-source repos / dev tricks you see on
Instagram and YouTube and actually mean to try. Share a post to a Telegram bot,
it saves the link, pulls whatever it can (transcript, caption, linked repo README),
asks you for a one-line note if it can't find anything, and asks Claude to turn it
into a title, summary, tags, and step-by-step "how to get started" — searchable in a
web dashboard.

## How it works

1. **Capture** — on Instagram/YouTube, tap Share → Telegram → send it to your bot.
2. **Webhook** (`/api/telegram/webhook`) saves the link and immediately tries to
   gather content:
   - YouTube: video title (oEmbed) + captions/transcript (public caption track,
     no API key needed).
   - Instagram, and anything else (a Notion doc, an article, a bare repo
     link — whatever you actually forward): best-effort `og:title`/
     `og:description` scrape. Instagram often blocks this — that's expected
     and handled. The bot isn't picky about the link being Instagram/YouTube
     specifically; it saves whatever link is in the message.
   - If a GitHub/GitLab/etc. link is mentioned in the message (either as the
     saved link itself, or alongside it — e.g. an IG Reel about a repo), its
     README is fetched too and used to ground the summary.
   - Tracking params (`fbclid`, `utm_*`, `igsi`/`igshid`, ...) are stripped
     from saved URLs.
3. **Fallback** — if none of the above produced anything (common for Instagram
   Reels with no caption), the bot asks you to reply with a quick note
   ("repo that turns screenshots into React components"). Your next text reply
   in that chat is attached as the note and processing re-runs.
4. **Summarize** — Claude turns whatever content is available into a structured
   title, 2-4 sentence summary, category, tags, and concrete getting-started
   steps.
5. **Dashboard** (`/`) — search and filter everything you've saved by platform,
   status, category or "implemented" state. Each item has a detail page where
   you can add/edit your note, re-run the summary, mark it implemented, or
   delete it.

## Stack

- Next.js (App Router) on Vercel
- Neon Postgres + Drizzle ORM
- Anthropic API (Claude) for summarization
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
2. Add all vars from `.env.example` as Environment Variables.
3. Deploy.
4. Go back and finish step 3 above (webhook registration + chat id lock).

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
  note-fallback flow — this is by design, not a bug.
- YouTube transcript fetching relies on scraping the public caption track from
  the watch page; if YouTube changes that page's structure it may need updating
  in `src/lib/youtube.ts`.
- This is single-user by design (`TELEGRAM_ALLOWED_CHAT_ID` gate) — no auth on
  the dashboard itself, so don't deploy it somewhere publicly discoverable
  without adding one if that matters to you.
