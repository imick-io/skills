---
"imick-skills": patch
---

A ticket the agent found blocked (no commits) no longer stays stuck on a stale branch. The loop kept the ticket's branch between retries to preserve progress, so when the block was fixed on the epic branch meanwhile (another epic merged in, a dependency landed), each retry still read the old code and blocked again. A branch with no commits of its own is now reset to the epic tip; one with commits keeps them.
