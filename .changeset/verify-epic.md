---
"imick-skills": minor
---

**Epic PRs, end to end.** New **`verify-epic`** skill: tests an epic's PR in the running app (preview from GitHub deployments, a URL pattern such as Coolify's, or a local start) against each ticket's acceptance criteria, the spec's stories, the API contracts and the agreed screens; files each failure as a `bug` + `ready-for-agent-debugging` ticket under the epic and doubtful results as one `ready-for-human` ticket; keeps one report on the PR and sets a `verify-epic` status. The agent loop now opens an epic's PR when its milestone is empty and verifies each new commit once.

New shared **`epics.yml`** workflow: the **`epic-gate`** check (no open tickets, no `mocks/`, `verify-epic` passed; non-epic PRs pass) and the **closing chain** (epic closed → milestone closed → initiative closed, or a nudge when parked areas remain). `setup-imick-skills` Section G installs it and `docs/agents/preview.md`. Projects with the loop: give `GH_TOKEN` the Commit statuses (read/write), Deployments (read) and Pull requests (read) permissions.
