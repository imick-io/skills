---
"imick-skills": minor
---

`/why-sleeping` now answers in two lists: **agent work** and **your work**, each ranked by how much held work a move frees.

- **Agent work** is what an agent can do: build a ready ticket, triage, cut tickets from an approved spec, work a map, verify an epic PR or fix its checks, resolve an epic's conflicts with `main`, clear a stuck label or claim. A `[loop]` mark means the loop's next pass would do it anyway. Say "do the agent work" and the agent makes the moves in order, running the check again after each.
- **Your work** is what only you can do. Each line quotes the loop's last comment, so you see what is asked without opening the issue.

It also flags the loop when it's asleep (or not running) with agent work waiting, and lists what is already being built and the tickets it holds back.

With a loop that has the new status file and dry run (update the project's loop), it asks the loop directly. It shows the loop's real state, even when you started the loop by hand. A `[loop]` mark then means the loop's own next pass would take that move. A job the loop backed off after repeated failures shows up as agent work, with its last error.

A "Resolve conflicts" issue counts as the loop's work in every mode now, matching the loop. Once the loop has asked you about it, or when the epic is `manual`, it shows as your work.
