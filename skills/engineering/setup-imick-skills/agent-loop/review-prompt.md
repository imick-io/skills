# TASK

Review the work for issue #{{ISSUE}} on branch `{{BRANCH}}` before it lands on `{{BASE}}`.

## Diff

!`git diff {{BASE}}...{{BRANCH}}`

## Commits

!`git log {{BASE}}..{{BRANCH}} --oneline`

# REVIEW

Call the Skill tool with "code-review", reviewing this branch against `{{BASE}}` and against issue #{{ISSUE}} as the spec.

Fix what it finds on this branch, preserving behaviour: correctness bugs, missing tests for changed behaviour, violations of the project's coding standards. Run the typecheck and tests, and commit the fixes. If the work is already sound, change nothing.

Don't push, open PRs or touch the issue.

Once done, output <promise>COMPLETE</promise>.
