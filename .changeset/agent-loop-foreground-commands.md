---
"imick-skills": patch
---

Suite runs no longer stall the agent loop or lose their results.

- The agent loop's `.sandcastle/.env.example` sets `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, so Claude Code no longer moves a long command into the background and leaves the agent waiting for a notification the sandbox never delivers.
- `suite-prompt.md` waits for a run in foreground steps of at most 8 minutes, under the loop's 10-minute idle timeout. Before, an agent waiting on a CI workflow went quiet, was stopped at 10 minutes, and the retry started a fresh workflow run, so the result was never reported. A `workflow` suite now reuses a run already started on the commit under test, and a `sandbox` suite longer than 8 minutes runs detached with its output in a file.

Existing projects: add `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` to `.sandcastle/.env` (every key there reaches the sandboxes), and take the new `.sandcastle/suite-prompt.md` with `/update-imick-skills`.
