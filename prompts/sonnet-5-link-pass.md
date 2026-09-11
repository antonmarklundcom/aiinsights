# Phase L1 — Link pass. SONNET session. Sequential, after S1–S4 are merged.

Read ONLY: this file, `plan.md` §1, §4, §6.5, §7, §9, §10, and every `docs/log/*.md`.
Execute under the autonomy protocol §4.

Owns: everything, edits only (README, KNOWN-ISSUES.md, plan §9/§10, small cross-phase fixes
that no single phase could make). No new features.

Budget: one session, ≤ 60 min.

Phase rules:
- Branch `phase/L1` off latest `main`.
- `npm ci`; confirm `lint`, `typecheck`, `test`, `build` are green on `main` first. If not,
  fixing that is the first task.
- README: features (auth, screenshots, search, filters, cron), full env var list, migration
  flow, remove any stale `db:push` or "Instagram or YouTube only" wording.
- `KNOWN-ISSUES.md`: promote every still-open item from the phase logs; drop resolved ones.
- Check the `it.todo` tests S2 left: if the fix is under 10 lines and inside one file, make
  it and un-skip; otherwise list in KNOWN-ISSUES.
- Write plan §7 as a final "what Anton must do to deploy" list at the top of the PR body.
- Re-runnable; stop only per §4.4.

Exit: `main` green; README and KNOWN-ISSUES current; plan §9 complete; PR merged.

## After this phase
Delete the watcher Routine (list_triggers → delete_trigger). Then STOP with the closing
report: what shipped per phase, what is in KNOWN-ISSUES, what Anton must set in Vercel.
