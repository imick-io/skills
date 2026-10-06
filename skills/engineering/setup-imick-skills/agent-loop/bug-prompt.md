# TASK

Debug issue #{{ISSUE}}: {{TITLE}}

You run inside the agent loop, on branch `{{BRANCH}}`, which the loop created for you, in a sandbox without the user's Chrome: reproduce UI bugs with `agent-browser` or Playwright.

Call the Skill tool with "debug-and-fix" and give it issue #{{ISSUE}}. Follow it, with these loop rules overriding its branch and landing steps:

- The issue is already claimed and the branch already exists: skip picking, claiming and branching.
- **Fixed**: commit the regression test and the fix to `{{BRANCH}}` and post the outcome comment. Don't push, open a PR, close the issue or change its labels: the loop lands the fix.
- **Any other outcome** (diagnosed for a person, can't reproduce, works as intended): make no commits; post the comment, set the labels and assignee exactly as the skill's outcome table says, and remove yourself as assignee.

Once done, output <promise>COMPLETE</promise>.
