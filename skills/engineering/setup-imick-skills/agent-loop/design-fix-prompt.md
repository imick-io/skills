# DESIGN FIX: #{{ISSUE}} {{TITLE}}, after round {{ROUND}}

A design critic photographed the screens of issue #{{ISSUE}}, built on branch `{{BRANCH}}`, and listed what to fix before it lands on `{{BASE}}`. You fix it.

## The findings

{{FINDINGS}}

## What to do

- Fix **every** `must` finding. Fix each `should` finding unless it needs a decision the ticket doesn't make.
- Fix the cause, not the picture: when a finding is about a shared component, change the component so every screen gets it.
- Compose from `DESIGN.md`'s shared components and tokens. Add no one-off styles.
- Look at each screen you changed before finishing: run the app (as `docs/agents/design-capture.md` says, when it exists) and open it with `agent-browser` or Playwright, at the width and theme the finding names.
- Keep to the ticket's scope: `gh issue view {{ISSUE}}` has it.
- Run the typecheck and the tests your fixes can reach (the test files of the changed code, and those that import it), in the foreground with a time limit, and leave them green. Don't run the whole suite.
- Commit to `{{BRANCH}}`, one commit per coherent fix. Don't push, merge other branches, open PRs or touch the issue.

The sandbox's dependencies are installed, and when the project has a `.sandcastle/sandbox-env`, its services (database, cache) are already running: `source .sandcastle/sandbox-env` before running the app or tests. Don't install or start your own.

Before you signal completion, stop every process you started (dev servers, watchers, databases): one left running keeps the sandbox from closing.

Once done, output <promise>COMPLETE</promise>.
