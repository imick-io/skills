---
"imick-skills": patch
---

The agent loop now files missing "Run <suite>" tickets for an epic whose PR is already open, not only before the PR opens. A suite added to `test-suites/` after the PR opened, or a fix that touches files a suite covers with no run yet, used to be skipped and the epic could merge without it; now the PR waits for the run (#96).
