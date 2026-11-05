---
"imick-skills": minor
---

The tracker's roadmap is easier to read at a glance.

- **Done epics are green.** They stay folded to one line, now with a green edge and tint and "✓ Done · N tickets" in green, instead of grey.
- **New colours:** blue is an agent on it (a ticket being built or fixed, an epic being built), and purple is an agent next (a ticket queued, an epic being planned). Green now means done everywhere: done epics, struck-through done tickets, progress bars, approved specs. Red still means you, amber not sorted, grey waiting.
- **Tickets in no epic are grouped by kind** instead of in one "Outside epics" card: Bugs, Small changes, To scope, Waiting on the reporter, Not doing, Not sorted, and Backlog last. Each group is its own card at the bottom of the first column, showing only when it has tickets, and is outlined in red when one of its tickets needs you.
- **Two legends:** one for epics (needs you, building, planning, waiting, done) and one for tickets (you, agent on it, agent next, not sorted, waiting, done, backlog), each saying what the colour asks of you.

Run `/update-imick-skills` in a project to get the new `tracker/build.mjs`.
