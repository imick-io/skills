---
"imick-skills": minor
---

A new skill, **`/run-epic <epic>`**: build every ticket of one epic inside a Claude Code session, the way the agent loop would, without Docker. For an epic labelled `manual` (the loop never touches it) when you would rather watch it being built in a session than build each ticket by hand with `/claim`.

- **The loop's pipeline, one ticket at a time.** Claim, `main` merged into the epic branch, `agent/issue-<n>` off it in its own worktree with dependencies installed, a subagent on the loop's own `implement-prompt.md` (or `bug-prompt.md`), a second on `review-prompt.md`, then landed on the epic branch and closed with the loop's wording. The frontier is re-read after each landing, so unblocked tickets follow. Tickets of a `manual` epic carry `ready-for-human`; the skill takes those as well as `ready-for-agent` and `ready-for-agent-debugging`.
- **Unattended.** No questions once it starts: a build with no commits is handed to a person (label, comment with the reason, assignee removed) and the run goes on; a merge conflict at landing rebuilds the ticket once on the latest epic branch, as the loop does, then hands back. The tracker is rebuilt after each ticket, and the loop's Slack webhooks (`.sandcastle/.env`) get one message per landed or handed-back ticket.
- **Refuses what the loop could also be building:** the epic must be `manual` (it asks you to add the label, and stops if you refuse); `--force` only when you say the loop is off. Before starting it asks whether the session's permissions let tool calls run unprompted, and whether to start the project's services if they aren't running.
- **At the end** it opens the epic's PR to `main` when every ticket is closed, and reports what landed, what was handed back and why.

Existing projects: `npx skills update -p -y` installs it (or `npx skills add imick-io/skills --skill run-epic`). It reads the project's `.sandcastle/*-prompt.md`; without them it uses this repo's templates.
