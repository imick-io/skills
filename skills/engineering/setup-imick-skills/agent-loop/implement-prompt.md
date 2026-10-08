# TASK

Build issue #{{ISSUE}}: {{TITLE}}

You run inside the agent loop, on branch `{{BRANCH}}`, which the loop created for you.

Read `.claude/skills/implement/SKILL.md` and follow it for issue #{{ISSUE}} (tests first, then the code-review close-out), with these loop rules on top:

- **Commit** your work to `{{BRANCH}}`. Don't create branches, push, open PRs, close the issue or change its labels: the loop lands the work.
- If the ticket can't be built as written (missing decision, blocked by something not on the tracker, needs access you don't have), make no commits and comment on the issue saying exactly what's missing. The loop hands it to a person.
- Before finishing, run the project's typecheck and test commands and leave them green.

Once done, output <promise>COMPLETE</promise>.
