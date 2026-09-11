# Phase S3 — Screenshot capture (Telegram photo → Claude vision). SONNET session. Lane 2, parallel with S1, S2, S4.

Read ONLY: this file, `plan.md` §1, §2, §4, §6.3, the phase table and §9 index,
`docs/log/O1.md`, `docs/log/O2.md`, `docs/improvement-report.md` §6. Do not read the rest.
Execute under the autonomy protocol §4. Build nothing outside §6.3.

Owns: `src/lib/telegram-files.ts`, `src/lib/vision.ts`, a `/* == S3 == */` block in
`src/lib/summarize.ts` and in `src/app/api/telegram/webhook/route.ts` and in
`src/lib/process-item.ts` (the `hasContent` line only), its tests, `docs/log/S3.md`.

Hard limits: append-only marked blocks in the three shared files; no other edits there. No
schema changes (`image_file_id` already exists from O1). No changes to the model, effort,
or tool schema in `summarize.ts`.

Budget: one session, ≤ 90 min. When the exit criteria pass, open the PR that turn.

Phase rules:
- Branch `phase/S3` off latest `main`. WIP commit every 30 min.
- `npm ci`. Load the `claude-api` skill before adding the image content block (base64
  `image` block, `media_type` from the downloaded file, placed BEFORE the text block).
- Telegram `getFile` → `https://api.telegram.org/file/bot<token>/<file_path>`. Pick the
  largest `photo` entry with width ≤ 1,600.
- A photo with no link is a valid capture: `url = tg://photo/<file_id>`, platform `other`,
  caption → `userNote`. Dashboard must not crash on a non-http `url` (render as text).
- Re-runnable; minor issues → `docs/log/S3.md`; stop only per §4.4.

Exit (all): photo-size selection test; `hasContent` true with image test; summarize builds an
image block when `image_file_id` is set (SDK mocked); help text updated; live test against the
real bot documented if the token is available, else stated as untested-live;
lint/typecheck/test/build green; CI green; PR merged; `docs/log/S3.md` written.

## After this phase
Follow `prompts/_handoff.md`. Spawn nothing.
