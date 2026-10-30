---
"imick-skills": patch
---

Agent loop fix: a ticket whose work conflicts with its epic branch is now actually retried on top of the latest epic branch. The loop meant to delete the ticket's branch and rebuild it, but the sandbox's worktree still held the branch, and git refuses to delete a branch checked out in a worktree (`cannot delete branch … used by worktree`). The stale branch survived, so every retry found the work "already done", added a review commit, and conflicted again, forever, spending tokens each round. The loop now frees the worktree first (`freeBranch`), as it already does before resetting a branch elsewhere.

Existing setups: copy the new `main.mts` into `.sandcastle/` (or add `freeBranch(t.branch);` before `git(undefined, "branch", "-D", t.branch);` in `land()`), and restart the loop. A ticket already stuck this way is unstuck by its next landing attempt.
