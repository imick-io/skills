---
"imick-skills": patch
---

The tracker page makes what waits on you impossible to miss, and its roadmap is easier to scan.

- **Red means you, everywhere:**
  - A ticket on your turn or for your review is a solid red chip with a "You" tag on the roadmap, a red card on the epic board and a filled red box in the blocking graph.
  - An epic is outlined in red when anything in it waits on you. Its status turns red when the epic itself does: a brief, a spec to approve, a PR to merge.
  - "Needs triage", which used to be red, is now amber.
- **One plain colour key** replaces the two legends. It says what each colour asks of you: red you, green agent on it, blue agents next, amber not sorted, grey waiting, faded done.
- **Done epics fold to one line** on the roadmap ("✓ Done · 26 tickets"). Click one to see its tickets.
- The epic board's six lanes now fit on one row.

Run `/update-imick-skills` in a project to get the new `tracker/build.mjs`.
