---
"imick-skills": minor
---

A `manual` label for epics a person plans **and** builds, with other tools or models: the agent loop never plans the epic, never queues or unblocks its tickets whatever they're labelled, and never opens or verifies its PR. Until now the only way to keep the loop off an epic was `backlog`, which means "parked", so the tracker showed the epic as dormant and anyone removing the label handed it to the loop. Also closes a gap: the loop's epic-PR step ran for a `backlog` epic once its milestone emptied.

- **Agent loop (`main.mts`).** `LABEL.manual` (`AGENTS_LABEL_MANUAL`). A `manual` epic is skipped by planning, by the epic PR and verification pass (as is a `backlog` epic now), and by fast-mode unblocking; a ticket whose milestone belongs to a `manual` epic never enters the queue, even labelled `ready-for-agent`, and its `ready-for-human` questions are never answered by the loop.
- **`/brief`** ends with a three-way choice: autopilot, manual (the label: you plan and build it), or neither (you plan it, the loop builds its tickets). **`/scope-decomposer`** asks once whether any epic is yours to run by hand and publishes it with `manual`. **`/wayfinder`** cuts a `manual` epic's tickets as `ready-for-human`. **`/whats-next`** names a `manual` epic's tickets as your moves.
- **Tracker.** A `manual` epic shows a `manual` pill on the roadmap and in the epic table, with its statuses worded for you ("You are building it") in your colour instead of the agent's.
- **Docs.** `triage-labels.md`, `workflow.md`, `new-project.md` and the setup skill's label list.

Existing setups: copy the new `main.mts` into `.sandcastle/` and `tracker/build.mjs` into `tracker/`, add the `manual` row to `docs/agents/triage-labels.md`, and create the `manual` label (`gh label create manual --color 5319E7`).
