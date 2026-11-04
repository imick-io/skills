---
"imick-skills": minor
---

`/update-imick-skills` now checks the project's own CI against the epic flow on every run, even when the project is already on the newest release.

When the repo uses the epic workflow, it reads each workflow in `.github/workflows/`, except deploys and the skills' own callers. It reports where CI runs more often than the flow needs:
- PRs into any branch, instead of only `main`;
- pushes to epic branches, which means one full run per ticket the loop lands;
- the full suite on `push: main`;
- no `cancel-in-progress` for runs a newer push replaces.

For each finding, it offers the fix as a diff, applied only on your yes and committed on its own in the update PR. If a workflow saves caches, it keeps `push: main` and limits the expensive jobs to PRs, so `main` still saves the caches new PRs read.

This replaces the hand step from the last release: an already-set-up project gets the CI settings from #62 the next time you run `/update-imick-skills`.
