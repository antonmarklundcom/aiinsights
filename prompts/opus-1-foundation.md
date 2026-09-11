# Phase O1 — Foundation: schema, migrations, env, CI. OPUS session. Lane 1.

Read ONLY: this file, `plan.md` §1, §2, §4, §5.1, the phase table and §9 index,
and `docs/improvement-report.md` §4 and §7. Do not read the rest.
Execute under the autonomy protocol §4. Build nothing outside §5.1.

Owns: `src/db/**`, `drizzle/**`, `drizzle.config.ts`, `src/lib/env.ts`, `src/test/db-mock.ts`,
`package.json`, `.env.example`, `.github/workflows/ci.yml`, `README.md` (setup sections),
`docs/log/O1.md`.

Budget: one session, ≤ 90 min. When the exit criteria pass, open the PR that turn.

Phase rules:
- Branch `phase/O1` off latest `main`. WIP commit every 30 min.
- `npm ci` first. Read `node_modules/next/dist/docs/01-app/01-getting-started/` index before
  touching any Next file; this Next version differs from training data (AGENTS.md).
- Migration 0000 must be the baseline of the schema AS IT IS on `main` today; 0001 adds §2.
  Never edit a generated migration by hand except the enum/data one O2 owns.
- No DB is reachable from this session. Verify migrations by re-running `drizzle-kit
  generate` and checking it produces no new file.
- `env.ts` is hand-rolled, no zod. Production-required rule tested with `NODE_ENV` toggled.
- CI must pass `next build` with dummy env values set in the workflow.
- Re-runnable; minor issues → `docs/log/O1.md`; stop only per §4.4.

Exit (all): `drizzle/0000_*.sql` + `0001_*.sql` committed and generate is clean; `env.ts` +
its test; `db-mock.ts` exists and is used by at least one test; `npm run lint && npm run
typecheck && npm test && npm run build` green locally; CI green on the PR; README updated;
PR merged; `docs/log/O1.md` written.

## After this phase
Follow `prompts/_handoff.md`. Next: `prompts/opus-2-pipeline.md`, model **Opus**.
