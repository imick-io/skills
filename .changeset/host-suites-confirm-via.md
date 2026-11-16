---
"imick-skills": minor
---

A test suite can now run on the agent loop's own machine instead of in GitHub Actions. Give a suite that needs an emulator or a device `runs-via: host` and the loop runs its `command` on the host itself, one host suite at a time, then hands the result to the agent. Add `confirm-via: workflow <file> [-f key=value…]` to any `host` or `sandbox` suite to run its workflow once after a green local run, never after a red one, so fixing a red suite no longer costs a CI run per attempt. Existing `runs-via: workflow` suites work as before. Restart the agent loop after updating: the new `suite-prompt.md` needs the new `main.mts`, and an old loop fails its Run tickets on the missing `{{HOST_EXIT}}` argument.
