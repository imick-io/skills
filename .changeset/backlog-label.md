---
"imick-skills": minor
---

A `backlog` label parks an issue for later. It keeps its **what** role and drops its **who** role, so it's in nobody's inbox:
- the agent loop never builds a backlog ticket and never plans a backlog epic, and a backlog issue under an epic doesn't hold the epic's PR back;
- triage skips it, both the workflow and `/triage` ("backlog #42" parks one);
- the tracker shows it in its own Backlog lane, and keeps it out of action items.

In a project already running the loop: add the `backlog` row to `docs/agents/triage-labels.md`, create the label (`gh label create backlog --force`), and copy `agent-loop/main.mts` over `.sandcastle/main.mts` (keeping local changes) and `tracker/build.mjs` over `tracker/build.mjs`.
