---
"imick-skills": minor
---

The tracker's roadmap shows every ticket, and its links are easier to follow. It's now the page the tracker opens on.

- **Outside epics:** a card at the bottom of the roadmap's first column lists the tickets in no epic. Those are standalone bugs and small changes from triage, including the children of a split email, each shipped as its own PR to `main`. They used to show nowhere until their PR waited for your review. They now appear with the same chips: blue while queued, green while an agent fixes them, red with "YOU" when it's your turn. Tickets closed in the last two weeks stay listed, and the backlog comes last. The Epic board's menu has the same "Outside epics" entry, with its lanes and blocking graph.
- **Clearer links between epics:**
  - An arrow is solid while the epic still holds the next one back, and dashed once it's done.
  - Lines are drawn above the cards, with a dot at the start and an arrow at the end. A link that skips a column runs along a lane above the cards instead of across them.
  - Hover an epic to see only its links, in blue, with the other epics dimmed.
  - Each card says it in words: "after #7" and "then #11".
- **Order:** backlog tickets come last everywhere on the roadmap.
- **Roadmap first:** it's the first tab and opens by default, unless you last left the tracker on another tab.

Run `/update-imick-skills` in a project to get the new `tracker/build.mjs`.
