# Handoff gates and spawn call (every phase reads this at the end)

A phase is DONE only when all four gates pass:

1. PR merged green (CI: lint, typecheck, test, build).
2. Every exit criterion in the phase's plan section checked off.
3. One adversarial re-read of the merged diff on `main`; findings fixed in ONE follow-up
   commit (direct to `main` only if trivial and green; otherwise a tiny PR). No second round.
4. `docs/log/<id>.md` committed (≤ 12 lines Built, ≤ 8 Decisions, ≤ 8 Known issues,
   1 line Verification) and its index line added to `plan.md` §9.

Then, by lane:

- **Lane 1 (O1 → O2 → O3):** spawn the next phase with `create_session`:
  inherit environment and permission mode (never `plan`), `model` set explicitly to the
  phase table's model (Opus: `claude-opus-5`; Sonnet: `claude-sonnet-5`), `title`
  `aiinsights <id>`, `prompt` exactly `Read prompts/<next-file>.md in this repo and execute it.`
- **O3 (last lane 1):** first create the watcher Routine per `prompts/_watcher.md`, then
  spawn S1, S2, S3, S4 at once (four sessions, all Sonnet).
- **Lane 2 (S1–S4):** spawn nothing. End with the phase report.
- **Link pass (L1):** delete the watcher Routine, then STOP with the closing report.

Fallback when `create_session` is unavailable (local CLI): continue in the same window if
the next phase uses the same model; stop and print "Next: open a <Opus|Sonnet> window and
paste: Read prompts/<next-file>.md in this repo and execute it." at a model switch.

Never spawn anything on Fable (plan §4.8).
