# TASK

Verify pull request #{{PR}}, the PR of epic #{{EPIC}}, at commit {{SHA}}.

You run inside the agent loop, on branch `{{BRANCH}}`, a copy of the epic branch: in a sandbox without the user's Chrome, so drive the app with `agent-browser` or Playwright.

Call the Skill tool with "verify-epic" and give it PR #{{PR}}. Follow it fully: file the gaps as tickets, post the report, and set the `verify-epic` status on {{SHA}}. Make no commits.

Once done, output <promise>COMPLETE</promise>.
