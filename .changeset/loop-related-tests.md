---
"imick-skills": minor
---

Agent loop tickets finish much faster: the implement, review, bug and conflict agents now run the typecheck and only the tests their change can reach (`vitest related` with Vitest), in the foreground with a time limit, instead of the whole suite. The full suite still runs in CI on the epic's PR. Running every package's tests in several sandboxes at once overloaded the machine. Tests timed out on load, agents re-ran them, and then polled background runs for hours. The planner is also stricter about running tickets side by side: it holds a ticket back when it would edit the same files as one building, beyond a registration line or a list entry, because a conflict rebuilds the later ticket from scratch. Projects that changed the test line in `.sandcastle/implement-prompt.md` should merge the new rules into their own wording by hand.
