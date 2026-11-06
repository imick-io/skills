---
"imick-skills": patch
---

The agent loop no longer gets stuck when an epic branch is pushed to from outside the loop while the loop still holds landed tickets it hasn't pushed. Each pass used to fail with `Not possible to fast-forward` and retry every 5 minutes. Now the loop merges the remote epic branch into its own, pushes, and carries on. If that merge conflicts, it stops with a message saying which worktree to merge in by hand.
