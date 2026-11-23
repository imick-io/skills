---
"imick-skills": minor
---

New skill `/run-design-epic <epic>`: `/run-epic` for an epic whose tickets change what people see. Each ticket's screens are photographed after the build, a fresh agent that never saw the builder's reasoning reviews the pictures, and the builder fixes its findings, for up to three rounds, before the usual code review and landing. A ticket with a `## Design checkpoint` heading waits for your yes before it lands. The findings go on the issue; the pictures stay on your machine under `.claude/design-runs/`, with one review page per epic. It needs a capture recipe at `docs/agents/design-capture.md` (how to run the app from a worktree, sign in as a seeded person and screenshot a route); the skill stops and writes one with you when it's missing.
