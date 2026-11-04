---
"imick-skills": minor
---

CI runs far less often on projects that use epics (#62).

- **The agent loop and `/run-epic` batch their pushes to an open epic PR.** While more of the epic's work is coming, a push says `[skip ci]`: main merged in before a ticket starts, or a fix landing while others are still building (`/run-epic`: still ready). The batch's last push runs CI, once, on the branch with every fix in. If the batch ends on a skipped push, because its last ticket failed or was handed back, the loop (or `/run-epic finish`) pushes an empty commit so CI still runs. That commit changes no files, so the epic's `verify-epic` status carries over.
- **`/verify-epic` and `/run-epic` say not to re-run failed CI jobs by hand** while fixes are open or building: the batch's last push runs CI anyway.
- **`/setup-imick-skills`, Section G (Epic PRs), offers CI settings that fit the flow**, for the project's own workflows:
  - `pull_request: branches: [main]`
  - `concurrency` with `cancel-in-progress`, so a newer push cancels the run it replaces
  - no full suite on `push: main`: the push to `main` keeps only the cheap jobs that save caches, so new PRs don't start cold

  For a project already set up, ask an agent to apply step 4 of Section G of `/setup-imick-skills` to its workflows.

To get the loop change, run `/update-imick-skills` in each project, then restart the loop.
