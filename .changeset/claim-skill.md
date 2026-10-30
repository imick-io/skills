---
"imick-skills": minor
---

A new skill, **`/claim`**: take a ticket out of the agent queue to build it yourself, with its branch set up the way the agent loop would. `/claim` takes the next available ticket (the loop's own queue, in build order, plus a `manual` epic's tickets); `/claim 42` takes #42.

- **Claims it**: assigns you (the loop only takes unassigned tickets), re-reads, and backs off if the loop claimed it at the same moment.
- **Branches like the loop.** Under an epic: merges `main` into the epic branch and pushes it, in a temporary worktree, since the loop may hold the epic branch in its own; then `agent/issue-<n>` off it. Otherwise `feat/<n>` (`fix/<n>` for a bug) off `main`. A branch the loop already started is reused.
- **Switches you to it** and lists the next steps for that ticket: services, `/implement` or `/debug-and-fix`, `/code-review` against the right base, the checks, and the commands to land it.
- **Stops instead of guessing**: uncommitted changes, a blocked ticket (`--force` to build it anyway), a ticket the loop looks to be building (it claims with your account), a merge conflict between `main` and the epic. `--dry-run` shows what it would do.

**Building a ticket yourself** (`docs/build-a-ticket-yourself.md`) now starts with `/claim`, and its by-hand commands update and land on the epic branch without checking it out, which failed while the loop held that branch in a worktree. The handbook's *A ticket, by hand* flow and journey use `/claim`.

Existing projects: `npx skills update -p -y` installs it.
