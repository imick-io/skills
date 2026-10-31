---
"imick-skills": patch
---

Agent loop fixes:

- **A landed ticket's branch is now really deleted.** After merging a ticket into its epic branch, the loop deleted the ticket's branch without freeing the sandbox's worktree, and git refuses to delete a branch checked out in a worktree. The ticket was already closed and landed, so nothing was lost, but `land()` threw after landing (logging an error and releasing an already-closed ticket), and every ticket's branch and worktree stayed in `.sandcastle/worktrees` for good. The same fix as for a conflicting ticket (#50): `freeBranch` first.
- **The job that merges `main` into an epic branch gets 30 minutes to install,** up from 10. It keeps the bind mount even with `AGENTS_SANDBOX=isolated`, because patches can't carry its merge commit, and on Docker Desktop for Mac an install across the bind mount can outlast 10 minutes.

Existing setups: copy the new `main.mts` into `.sandcastle/` (or add `freeBranch(t.branch);` before the `git branch -D` in `land()`'s success path, and pass a 30-minute install hook to the conflict job's `createSandbox`), then restart the loop. Worktrees already left behind can be removed with `git worktree remove` once no sandbox uses them.
