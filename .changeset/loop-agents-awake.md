---
"imick-skills": patch
---

Agent loop: a second script, `agents:awake` (`caffeinate -i npm run agents`), runs the loop without letting a Mac idle-sleep. A laptop that sleeps pauses the loop, and an agent run cut off mid-way can fail and leave its epic labelled `agent:planning`.

In a project already running the loop, add `"agents:awake": "caffeinate -i npm run agents"` to `package.json` (with its package manager in place of `npm run`).
