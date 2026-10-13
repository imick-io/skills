---
"imick-skills": minor
---

New `tracker` skill: `/tracker` builds and opens an issue tracker page for the current GitHub repo, with what waits on you next (and how much each item holds up), specs to approve, the epics' roadmap, and each epic's board and blocking diagram. The agent loop now rebuilds it before and after every pass when `tracker/build.mjs` exists, and `/setup-imick-skills` installs it with the loop. In a project already running the loop, copy the new `syncTracker` hook from `agent-loop/main.mts` into `.sandcastle/main.mts`, then run `/tracker` once to install the page.
