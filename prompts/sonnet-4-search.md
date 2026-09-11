# Phase S4 — Full-text search. SONNET session. Lane 2, parallel with S1, S2, S3.

Read ONLY: this file, `plan.md` §1, §2, §4, §6.4, the phase table and §9 index,
`docs/log/O1.md`, `docs/improvement-report.md` §5. Do not read the rest.
Execute under the autonomy protocol §4. Build nothing outside §6.4.

Owns: `src/lib/search.ts` + test, `src/db/schema.ts` (the `search` column and its GIN index
ONLY), one new generated migration in `drizzle/`, the query-building lines in
`src/app/page.tsx` that use the `q` param, `docs/log/S4.md`.

Hard limits: no other schema edits; never edit an existing migration; do not restructure
`page.tsx` (S1 owns its layout; if S1 has merged, edit only the `q` condition lines; if it
has not, same rule, and expect a trivial merge).

Budget: one session, ≤ 90 min. When the exit criteria pass, open the PR that turn.

Phase rules:
- Branch `phase/S4` off latest `main`. WIP commit every 30 min.
- `npm ci`. Generated column via Drizzle `generatedAlwaysAs(sql`...`)` with `{ mode:
  "stored" }`; text config `simple`. `tags` is jsonb: use
  `jsonb_path_query_array` or `array_to_string(ARRAY(SELECT jsonb_array_elements_text(tags)), ' ')`
  — a generated column cannot contain a subquery in Postgres, so prefer an IMMUTABLE
  expression; if none works, index title/summary/note/caption only and log tags as a known
  issue.
- Read the generated SQL before committing it; you cannot apply it here.
- Query: `websearch_to_tsquery('simple', $q)` + `ts_rank`; queries < 3 chars fall back to
  escaped `ILIKE`.
- Re-runnable; minor issues → `docs/log/S4.md`; stop only per §4.4.

Exit (all): migration file committed and generate is clean; `buildSearchCondition` tests
(escaping, short-query fallback, tsquery path); `q` wired; lint/typecheck/test/build green;
CI green; PR merged; `docs/log/S4.md` written.

## After this phase
Follow `prompts/_handoff.md`. Spawn nothing.
