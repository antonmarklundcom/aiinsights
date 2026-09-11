# Watcher — Sonnet, fresh session per firing, ends within minutes

Created by O3 via `create_trigger`: hourly cron, `create_new_session_on_fire: true`,
model `claude-sonnet-5`, prompt exactly `Read prompts/_watcher.md in this repo and execute it.`

Each firing:

1. Read `plan.md` phase table and §9. `git fetch`, list branches `phase/*` and open PRs.
2. For each lane 2 phase (S1–S4) classify: **merged** (PR merged) / **running** (branch has a
   commit < 90 min old) / **stalled** (branch exists, older than 90 min, PR not merged) /
   **not started** (no branch).
3. While fewer than 4 phases are running: re-spawn stalled ones and start not-started ones
   (`create_session`, model `claude-sonnet-5`, prompt `Read prompts/<file>.md in this repo
   and execute it.`). Prompts are re-runnable.
4. A PR that is green and mergeable but whose session died: merge it, then note in §9.
5. When S1–S4 are all merged and no `phase/L1` branch exists: spawn the link pass
   (`prompts/sonnet-5-link-pass.md`, Sonnet).
6. Read `docs/decisions-needed.md`. If it has unanswered entries, push a notification to
   Anton with the questions verbatim.
7. Never edit code, never answer a design question, never message a running session.
8. After 10 firings with the build still not done: notify Anton and disable this Routine.
