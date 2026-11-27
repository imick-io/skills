# TASK

Review the work for issue #{{ISSUE}} on branch `{{BRANCH}}` before it lands on `{{BASE}}`.

## Diff

!`git diff {{BASE}}...{{BRANCH}}`

## Commits

!`git log {{BASE}}..{{BRANCH}} --oneline`

# REVIEW

Call the Skill tool with "code-review", reviewing this branch against `{{BASE}}` and against issue #{{ISSUE}} as the spec.

Fix what it finds on this branch, preserving behaviour: correctness bugs, missing tests for changed behaviour, violations of the project's coding standards. Run the typecheck and the tests your fixes can reach (the test files of the changed code, and those that import it: with Vitest, `vitest related --run <changed files>`), in the foreground with a time limit, and commit the fixes. Don't run the whole suite: the epic's PR runs it in CI. If the work is already sound, change nothing.

**Screens.** When the diff changes what people see and the project has a `DESIGN.md`, you are the design critic too: you didn't build these screens. Run the app (as `docs/agents/design-capture.md` says, when it exists), screenshot each changed screen with `agent-browser` or Playwright in each theme and at phone width, and judge the pictures against `DESIGN.md`: one clear primary action, aligned edges and a steady spacing rhythm, the shared components used everywhere, designed loading, empty and error states, plain copy, a dark theme that is designed rather than inverted, a usable phone viewport. Fix what a customer would notice, and commit the fixes.

Don't push, open PRs or touch the issue.

The sandbox's dependencies are installed, and when the project has a `.sandcastle/sandbox-env`, its services (database, cache) are already running: `source .sandcastle/sandbox-env` before running tests. Don't install or start your own (no `apt-get`, `sudo`, `embedded-postgres` or the like); if a service is missing, say so in your comment.

Before you signal completion, stop every process you started (dev servers, watchers, databases): one left running keeps the sandbox from closing.

Once done, output <promise>COMPLETE</promise>.
