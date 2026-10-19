---
"imick-skills": minor
---

Agent loop: **supersonic mode**, for throwaway MVPs where waiting costs more than a wrong guess. Turn it on with `AGENTS_MODE=supersonic` in `.sandcastle/.env`, or the `supersonic` label on one epic. It does everything fast mode does, and:

- **One interview.** `/scope-decomposer` drafts every epic's brief during its interview, asks only what the drafts are missing, and publishes the epics on autopilot. No `/brief` sessions follow, and the loop starts planning straight away.
- **Assumes instead of asking.** Below the threshold, a call that can be undone (a product or UI call, a default, copy) is assumed: the loop goes on with its best guess, labels the issue `agent:assumed`, and leaves the question on the issue. Specs are always approved, with their low-confidence decisions standing as assumed.
- **A daily digest** in Slack lists what was assumed (`AGENTS_DIGEST_HOURS`, 24 by default) instead of a ping per question. Comment on an assumed issue to change the call: the loop edits what isn't built yet, or files a follow-up ticket for what is.
- **Still waits for you** before spending money, handling real credentials or personal data, deleting or publishing, and never touches `backlog`.

The confidence threshold is now `AGENTS_THRESHOLD` (70 by default) for both modes; `AGENTS_FAST_THRESHOLD` still works. When it's set, wayfinder's autopilot uses it too, instead of its own 75.

In a project already running the loop: copy `agent-loop/main.mts` over `.sandcastle/main.mts` (keeping local changes), add the new `agent-loop/followup-prompt.md` and the updated `unblock-prompt.md` to `.sandcastle/`, add `.sandcastle/digest.json` to `.gitignore`, and restart the loop.
