---
"imick-skills": minor
---

The agent loop now resolves conflicts between `main` and an epic branch in every mode, not just fast and supersonic.

When merging `main` into an epic branch conflicts, the epic still pauses and gets a "Resolve conflicts" issue. An agent then resolves the merge on the epic branch, checks that no conflict markers are left, pushes and closes the issue with the list of files it resolved. Only when it can't does it ask you on the issue (`agent:asked`), with a Slack ping. Before, a normal-mode epic waited for you to merge by hand.

The resolved merge reaches `main` only through the epic's PR, so you review it there. A `manual` epic's conflicts stay yours. `npm run agents -- --dry-run` lists the conflicts the next pass would take.
