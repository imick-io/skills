---
"imick-skills": minor
---

**Agent loop**: `setup-imick-skills` gains Section F, which installs a Sandcastle loop (`npm run agents`, or `-- --once`) that works the repo's `ready-for-agent` and `ready-for-agent-debugging` tickets in Docker sandboxes. It plans which tickets can run in parallel, claims each (assignee = claimed, safe with two machines running), merges `main` into the epic branch first (a conflict opens a `ready-for-human` ticket and pauses that epic), runs `implement` or `debug-and-fix` then a `code-review` pass, lands epic tickets on the epic branch (standalone ones as PRs), opens the epic's PR to `main` once its milestone has no open tickets, skips specs, sleeps when idle and backs off on usage limits. The template (main loop, prompts, a browser-enabled Dockerfile) lives in `setup-imick-skills/agent-loop/`.
