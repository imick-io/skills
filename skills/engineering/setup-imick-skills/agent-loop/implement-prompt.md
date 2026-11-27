# TASK

Build issue #{{ISSUE}}: {{TITLE}}

You run inside the agent loop, on branch `{{BRANCH}}`, which the loop created for you.

Read `.claude/skills/implement/SKILL.md` and follow it for issue #{{ISSUE}} (tests first, then the code-review close-out), with these loop rules on top:

- **Commit** your work to `{{BRANCH}}`. Don't create branches, push, open PRs, close the issue or change its labels: the loop lands the work.
- **Don't merge other branches** into yours (`git merge`, `git pull` from another branch): in an isolated sandbox your commits come back to the host as patches, which can't carry a merge. If the ticket needs work that isn't on your branch, make no commits and say so on the issue.
- If the ticket can't be built as written (missing decision, blocked by something not on the tracker, needs access you don't have), make no commits and comment on the issue saying exactly what's missing, starting the comment with `**Needs you:** <the one decision or action, in a line>`. The loop hands it to a person, and that line is what they read first.
- **Test what you changed, not the whole repo.** This replaces the skill's full-suite run at the end. While building, run single test files. Before finishing, run the typecheck and the tests your change can reach: the test files you added or edited, plus the ones that import the code you changed (with Vitest, `vitest related --run <changed source files>`; otherwise those packages' tests). Leave them green. Don't run the whole suite: the epic's PR runs it in CI before it merges, and in a sandbox it takes far longer and times out on load, not on your code.
- **A ticket that changes what people see** is built from the design system: read `DESIGN.md` (when the project has one) and the screenshots the ticket links, compose from the shared components and tokens, and add to those rather than styling a one-off in the page. Then look at it: run the app, open each screen you changed with `agent-browser` or Playwright, in each theme and at phone width, and fix what looks wrong before you finish.
- **Run tests in the foreground** with a time limit (`timeout 600 <command>`), never in the background: a background run leaves you polling while nothing moves. A test that fails on a timeout in code you didn't touch is load, not your bug: re-run that one file alone before investigating.

The sandbox's dependencies are installed, and when the project has a `.sandcastle/sandbox-env`, its services (database, cache) are already running: `source .sandcastle/sandbox-env` before running tests. Don't install or start your own (no `apt-get`, `sudo`, `embedded-postgres` or the like); if a service is missing, say so in your comment.

Before you signal completion, stop every process you started (dev servers, watchers, databases): one left running keeps the sandbox from closing.

Once done, output <promise>COMPLETE</promise>.
