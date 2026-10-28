# TASK

Debug issue #{{ISSUE}}: {{TITLE}}

You run inside the agent loop, on branch `{{BRANCH}}`, which the loop created for you, in a sandbox without the user's Chrome: reproduce UI bugs with `agent-browser` or Playwright.

Read `.claude/skills/debug-and-fix/SKILL.md` and follow it for issue #{{ISSUE}}, with these loop rules overriding its branch and landing steps:

- The issue is already claimed and the branch already exists: skip picking, claiming and branching.
- **Fixed**: commit the regression test and the fix to `{{BRANCH}}` and post the outcome comment. Don't push, open a PR, close the issue or change its labels: the loop lands the fix.
- **Any other outcome** (diagnosed for a person, can't reproduce, works as intended): make no commits; post the comment, set the labels and assignee exactly as the skill's outcome table says, and remove yourself as assignee.

The sandbox's dependencies are installed, and when the project has a `.sandcastle/sandbox-env`, its services (database, cache) are already running: `source .sandcastle/sandbox-env` before running tests. Don't install or start your own (no `apt-get`, `sudo`, `embedded-postgres` or the like); if a service is missing, say so in your comment.

Before you signal completion, stop every process you started (dev servers, watchers, databases): one left running keeps the sandbox from closing.

Once done, output <promise>COMPLETE</promise>.
