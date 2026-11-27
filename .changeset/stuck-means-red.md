---
"imick-skills": minor
---

**Red means stuck.** On the tracker, every ticket labelled `ready-for-human` used to be red, whether an agent had stopped on it or it was a device session planned for you weeks ago. Now the two are told apart.

- **New label `human-step`**, beside `ready-for-human`: a step planned as yours from the start (a device session, an account to open, a go-live run). `/to-tickets` sets it. Without it, `ready-for-human` on a ticket means an agent stopped and handed it over.
- **The tracker shows three things where it showed one.**
  - **Red, "Stuck":** an agent handed the ticket back or asked a question, or a fix waits for your review.
  - **Teal, "Your step":** a `human-step`, a suite only you can run, an issue to scope, a manual epic's ticket. Nothing has stopped on it.
  - A step turns red once work has stopped on it: an agent's ticket waits on it alone, or nothing is left for an agent in its epic. The hover says which.
  - The actions tab lists stuck items first and counts them apart, and the board has a "Your steps" lane.
- **Every ticket that waits on you says what it needs in one line.** Hand-backs and questions from the loop, `/run-epic`, `debug-and-fix` and `verify-epic`, and human steps cut by `/to-tickets`, open with `**Needs you:** <the one decision or action>`. The tracker shows that line on hover, on the board and in the actions tab.
- **Fast mode leaves your planned steps alone.** The loop no longer spends a run asking a question on a `human-step` ticket that already says what to do.
- `/whats-next` and `/why-sleeping` list stuck tickets and your steps apart.

**Existing setups.** Run `/update-imick-skills`: it copies the tracker's `build.mjs`, the loop's `main.mts` and its prompts, and creates the `human-step` label (`gh label create human-step --color 0e7480`). Then label what is already open, once: for each open `ready-for-human` ticket that a spec planned as a person's step (its title or body says so: "H1:", "Human step", "Founder:", "Runs via: human"), run `gh issue edit <n> --add-label human-step`. Leave tickets an agent handed back or filed with a question as they are. Until then every such ticket stays red.
