---
"imick-skills": minor
---

When a built and reviewed ticket conflicts with its epic branch (other tickets landed meanwhile), the agent loop no longer throws the work away and rebuilds the ticket from scratch. It merges the epic branch into the ticket's branch, hands the conflict markers to an agent (`ticket-conflicts-prompt.md`, new) and lands the resolved result as one clean merge commit. Rebuilding stays the fallback when the agent can't resolve it or needs a product decision. Projects update by copying `main.mts` and the new prompt into `.sandcastle/`; the loop picks them up on restart.
