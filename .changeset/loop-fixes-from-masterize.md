---
"imick-skills": patch
---

Agent loop fixes:
- A ticket now waits while its epic is still blocked by other epics, instead of being built on missing foundations.
- The loop recognises its agents' comments even when they word the AI disclaimer their own way, so it no longer takes its own comment on a spec for your reply. The autopilot prompt also gives agents the exact disclaimer to use.
- A spec waiting for your approval is announced once per version, not on every pass.

In a project already running the loop, copy `agent-loop/main.mts` and `agent-loop/autopilot-prompt.md` over `.sandcastle/`.
