# TASK

Build issue #{{ISSUE}}: {{TITLE}}

You run inside the agent loop, on branch `{{BRANCH}}`, which the loop created for you.

Read `.claude/skills/implement/SKILL.md` and follow it for issue #{{ISSUE}} (tests first, then the code-review close-out), with these loop rules on top:

- **Commit** your work to `{{BRANCH}}`. Don't create branches, push, open PRs, close the issue or change its labels: the loop lands the work.
- If the ticket can't be built as written (missing decision, blocked by something not on the tracker, needs access you don't have), make no commits and comment on the issue saying exactly what's missing. The loop hands it to a person.
- Before finishing, run the project's typecheck and test commands and leave them green.

The sandbox's dependencies are installed, and when the project has a `.sandcastle/sandbox-env`, its services (database, cache) are already running: `source .sandcastle/sandbox-env` before running tests. Don't install or start your own (no `apt-get`, `sudo`, `embedded-postgres` or the like); if a service is missing, say so in your comment.

Before you signal completion, stop every process you started (dev servers, watchers, databases): one left running keeps the sandbox from closing.

Once done, output <promise>COMPLETE</promise>.
