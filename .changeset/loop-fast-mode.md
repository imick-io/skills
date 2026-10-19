---
"imick-skills": minor
---

Agent loop: **fast mode**, for projects where speed beats review (personal projects, MVPs). Turn it on for a whole project with `AGENTS_MODE=fast` in `.sandcastle/.env`, or for one epic with the `fast` label. The loop then stops waiting on you wherever it can:

- **Issues waiting on you** (`ready-for-human`): an agent answers it when it's at least 70% confident (`AGENTS_FAST_THRESHOLD`), writes the decision into the issue and sends it back to the agents, or closes it for a wayfinder task. When the issue needs an action only you can take, it uses a local stand-in if one serves. Otherwise it asks you one precise question on the issue, labels it `agent:asked` and pings you in Slack. Your comment on the issue is the answer, applied on the next pass. It always asks before spending money, handling real credentials or personal data, deleting or publishing, and after it has guessed twice on the same issue.
- **Autopilot specs**: approved by the loop when every decision is at or above the threshold. Otherwise you're asked only about the ones below it.
- **Conflicts between `main` and an epic branch**: an agent resolves the merge. It keeps what both sides meant, runs the typecheck and tests, and the loop lands a clean merge commit on the epic branch. When a conflict needs a product decision, the agent explains it on the conflict ticket and you're pinged.
- **Epic PRs**: merged to main once `verify-epic` passes, which frees the epics it blocks. A merge GitHub refuses is pinged to you.

Fast mode never touches the backlog: a `backlog` issue is never answered, and nothing under a `backlog` epic is answered, approved, resolved or merged.

Set `SLACK_USER_ID` (your Slack member ID) so these pings mention you.

In a project already running the loop, copy `agent-loop/main.mts` over `.sandcastle/main.mts` (keeping local changes such as pnpm commands), add the new `agent-loop/unblock-prompt.md` and `agent-loop/conflicts-prompt.md` to `.sandcastle/`, make sure the repo has the `dig` and `wayfinder` skills, and restart the loop.
