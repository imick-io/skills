---
"imick-skills": patch
---

Agent loop fixes:
- A run that died no longer blocks the next one: the loop removes a leftover sandbox worktree before resetting a planning or verify branch, instead of failing with "cannot force update the branch … used by worktree".
- An epic that hasn't been planned yet is no longer taken for finished: its milestone must hold at least one issue, all closed, before the loop opens the epic's PR. Before, an empty milestone passed, the loop tried to open a PR with no commits, and the failure aborted the whole pass.

In a project already running the loop, copy `agent-loop/main.mts` over `.sandcastle/main.mts`, keeping any local changes (such as pnpm commands), and restart the loop.
