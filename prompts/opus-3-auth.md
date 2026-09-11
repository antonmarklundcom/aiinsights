# Phase O3 — Auth: shared password, signed cookie, proxy. OPUS session. Lane 1 (last).

Read ONLY: this file, `plan.md` §1, §4, §5.3, the phase table and §9 index,
`docs/log/O1.md`, `docs/log/O2.md`, and `docs/improvement-report.md` §2. Do not read the rest.
Execute under the autonomy protocol §4. Build nothing outside §5.3.

Owns: `src/proxy.ts`, `src/lib/auth.ts`, `src/app/login/**`, `src/lib/actions.ts`
(`requireSession` calls), `src/app/layout.tsx`, `docs/log/O3.md`.

Budget: one session, ≤ 90 min. When the exit criteria pass, open the PR that turn.

Phase rules:
- Branch `phase/O3` off latest `main`. WIP commit every 30 min.
- `npm ci`. Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`
  and `01-app/02-guides/authentication.md` (the Proxy section) first. Proxy runs in a
  restricted runtime: Web Crypto only, no Node `crypto` import.
- Cookie: `ai_session`, httpOnly, secure in production, sameSite lax, 30 days, value
  `<expiresAt>.<hmac>`.
- Exempt paths: `/login`, `/api/telegram/*`, `/api/cron/*`, `/_next/*`, `/favicon.ico`.
- Server actions are the real gate; the proxy is optimistic.
- Re-runnable; minor issues → `docs/log/O3.md`; stop only per §4.4.

Exit (all): sign/verify tests (valid, tampered, expired); password compare is constant-time;
`/` without cookie → 302 `/login`; webhook and cron reachable without cookie (test via the
proxy matcher unit test or a documented manual check); lint/typecheck/test/build green; CI
green; PR merged; `docs/log/O3.md` written, including the Vercel env vars Anton must set.

## After this phase
Follow `prompts/_handoff.md`. You are the last lane 1 phase: create the watcher Routine per
`prompts/_watcher.md`, then spawn ALL lane 2 phases at once, model **Sonnet** each:
`prompts/sonnet-1-dashboard.md`, `prompts/sonnet-2-tests.md`, `prompts/sonnet-3-screenshots.md`,
`prompts/sonnet-4-search.md`. If `create_session` is unavailable, stop and print the four
paste lines for Anton.
