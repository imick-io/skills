---
"imick-skills": minor
---

**Briefs, and autopilot per epic.** New **`brief`** skill: a short, high-level grill-with-docs session on one epic (must-haves, no-gos, the big product calls), saved as the epic's **Brief** section plus glossary and ADRs; it suggests a new epic when a must-have doesn't fit, and ends by choosing **manual or autopilot**. `/brief` alone takes the next epic labelled `needs-briefing`.

- `scope-decomposer` creates epics with `needs-briefing` + `ready-for-human`, and hands off to `/brief`.
- `wayfinder` starts from the Brief in both modes (its lines are settled decisions). The epic's **`autopilot` label** is now the switch for autopilot; `/wayfinder <epic> autopilot` adds it.
- **Agent loop**: plans every epic labelled `autopilot` (and briefed) on any pass, so the **`--autopilot` flag is gone**; `--no-planning` makes a loop build only. Projects using the loop: re-copy `.sandcastle/main.mts` from `setup-imick-skills/agent-loop/`, and label the epics you want planned `autopilot`.
