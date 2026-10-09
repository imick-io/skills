---
"imick-skills": patch
---

Agent loop fixes. Re-copy `.sandcastle/main.mts` and `.sandcastle/autopilot-prompt.md` from `setup-imick-skills/agent-loop/` to pick them up.

- Tickets now wait while their epic is blocked by another epic. Before, a ticket with no blockers inside its milestone was built even when the epic it belongs to was still waiting on other epics, on foundations that didn't exist yet.
- Autopilot planning no longer loops on a spec waiting for review. The planner sometimes worded the AI disclaimer its own way, so the loop read its last comment as a human review, re-ran a revise job on every pass and sent the same "Spec ready for review" Slack alert each time. The autopilot prompt now pins the exact disclaimer, the loop also recognises reworded ones, and each version of a spec is announced once.
