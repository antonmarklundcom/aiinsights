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
   - Instagram: best-effort `og:title`/`og:description` scrape (Instagram often
     blocks this — that's expected and handled).
   - If a GitHub/GitLab/etc. link is mentioned in the message, its README is
     fetched too and used to ground the summary.
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
3. Push the schema:
   ```bash
   npm install
   npm run db:push
   ```

### 2. Anthropic

Create an API key at [console.anthropic.com](https://console.anthropic.com) and set
`ANTHROPIC_API_KEY`.

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

## Notes / limitations

- Instagram has no public transcript/caption API, so most Reels rely on the
  note-fallback flow — this is by design, not a bug.
- YouTube transcript fetching relies on scraping the public caption track from
  the watch page; if YouTube changes that page's structure it may need updating
  in `src/lib/youtube.ts`.
- This is single-user by design (`TELEGRAM_ALLOWED_CHAT_ID` gate) — no auth on
  the dashboard itself, so don't deploy it somewhere publicly discoverable
  without adding one if that matters to you.
