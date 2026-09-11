# Phase S2 — Tests for the pipeline libs and webhook. SONNET session. Lane 2, parallel with S1, S3, S4.

Read ONLY: this file, `plan.md` §1, §4, §6.2, the phase table and §9 index,
`docs/log/O1.md`, `docs/log/O2.md`. Do not read the rest.
Execute under the autonomy protocol §4. Build nothing outside §6.2.

Owns: `src/**/*.test.ts`, `src/test/**`, `vitest.config.ts`, `package.json` (`test:coverage`
script only), `docs/log/S2.md`.

Hard limits: tests only. If a test reveals a bug in production code, write the failing test,
skip it with `it.todo` + a one-line reason, and record it in `docs/log/S2.md` Known issues.
Do not fix production code in this phase.

Budget: one session, ≤ 90 min. When the exit criteria pass, open the PR that turn.

Phase rules:
- Branch `phase/S2` off latest `main`. WIP commit every 30 min.
- `npm ci`. Mock `fetch` with `vi.stubGlobal`; mock `@/db` via `src/test/db-mock.ts`; mock
  `next/server`'s `after` to run the callback synchronously in webhook tests.
- Fixtures under `src/test/fixtures/` are trimmed snippets (< 5 KB each), never full pages.
- Coverage target `src/lib/**` ≥ 80 % lines. Stop there.
- Re-runnable; minor issues → `docs/log/S2.md`; stop only per §4.4.

Exit (all): `page-meta`, `youtube`, `telegram`/`telegram-format`, `webhook` test files exist
and pass; coverage number in the phase log; `npm test` green; CI green; PR merged;
`docs/log/S2.md` written.

## After this phase
Follow `prompts/_handoff.md`. Spawn nothing.
