# TASK

Verify pull request #{{PR}}, the PR of epic #{{EPIC}}, at commit {{SHA}}.

You run inside the agent loop, on branch `{{BRANCH}}`, a copy of the epic branch: in a sandbox without the user's Chrome, so drive the app with `agent-browser` or Playwright.

Read `.claude/skills/verify-epic/SKILL.md` and follow it fully for PR #{{PR}}: file the gaps as tickets, post the report, and set the `verify-epic` status on {{SHA}}. Make no commits.

The sandbox's dependencies are installed, and when the project has a `.sandcastle/sandbox-env`, its services (database, cache) are already running: `source .sandcastle/sandbox-env` before running tests. Don't install or start your own (no `apt-get`, `sudo`, `embedded-postgres` or the like); if a service is missing, say so in your comment.

Before you signal completion, stop every process you started (dev servers, watchers, databases): one left running keeps the sandbox from closing.

Once done, output <promise>COMPLETE</promise>.
