---
"imick-skills": minor
---

Agent loop: more tickets at once, and the real fix for the idle-timeout failure.

- **A rolling pool instead of batches.** The loop used to start a batch of tickets and wait for the slowest one, then run every epic check, before starting anything new. Now each ticket is its own job: when one lands, its slot is refilled at once, and epic checks run beside the tickets instead of in front of them. `npm run agents:stop` and `--once` still wait for running tickets and checks to land. The planner sees the tickets already building and fills only the free slots. It no longer installs dependencies, since it only reads.
- **The planner holds fewer tickets back.** Small edits to a shared file (a route, an export, a config line) no longer keep two tickets apart. Only large overlapping rewrites, or a real dependency, do; a ticket whose merge does conflict is redone on top of the other, as before.
- **Contract-first tickets.** `/to-tickets` now suggests cutting a thin first ticket that lands the shared shape (types, migration, stubbed routes), so the rest fan out from it instead of forming a chain.
- **`AGENTS_EPIC_GATE=ticket` (opt-in).** By default an epic blocked by other epics holds back all its tickets. With `ticket`, only tickets with blockers of their own wait, and autopilot planning of a blocked epic goes ahead. `/to-tickets` now links each ticket that needs another epic to that epic, which is what makes this safe; use it for tickets cut that way.
- **Only one loop per checkout** (#33). The "finished run fails on the idle timeout" turned out to be two loops running in the same folder: one started an epic check the other was already running, and deleted the worktree the first one's agent was working in. That agent went silent until the idle timeout. A second loop started in the same folder now refuses to start (`.sandcastle/loop.pid`). Loops on other machines are still fine, and a check another loop is running (`verify-epic` pending, less than an hour old) is no longer started twice. v1.6.0's workaround, which counted an idle timeout as success when the run's log had the completion signal, is removed: two runs share a log file, so it could count a dead run as done.

Existing setups: copy the new `main.mts`, `plan-prompt.md` and `.env.example` into `.sandcastle/`, and add `loop.pid` to `.sandcastle/.gitignore`. Before starting the new loop, stop every loop already running in that folder: loops started before this change don't write `loop.pid`, so the lock can't see them.
