---
"imick-skills": patch
---

`/setup-imick-skills` and `/update-imick-skills` keep lint running on pushes to `main`. Gating the slow jobs to pull requests had also gated lint, so a commit pushed straight to `main` (a doc, a design board, a hotfix) skipped it, and its lint errors then failed every later PR. `/update-imick-skills` now flags such a job as `lint-pr-only`.
