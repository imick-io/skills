---
"imick-skills": patch
---

The agent loop's `.sandcastle/.env.example` now sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`. Without it, an agent that runs a long command, such as `gh run watch` on a suite's CI workflow, gets the command moved to the background and then waits for a notification the sandbox never delivers, so it sits idle for hours and the loop stops with it. Existing projects: add `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` to `.sandcastle/.env` (every key there reaches the sandboxes).
