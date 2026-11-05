---
"imick-skills": minor
---

Point the agent loop at specific epics or tickets, and build a single ticket in a session.

- **Scoped loop runs: `--epic=12,14` and `--tickets=31,32`.** The loop then works only on what you name: an epic brings everything under it (its planning, tickets, conflicts with `main`, its PR and the `verify-epic` check), a ticket is built and nothing more. No triage, no other epic or ticket. It still follows the usual rules (a `manual` epic, or a blocked, assigned or unlabelled ticket isn't taken) and says at start which named items it won't work and why. It exits once nothing in scope is left: every ticket landed, in a PR or handed to a person, every epic closed. The flags combine with each other and with `--once` and `--dry-run`, and `/why-sleeping` says when the running loop is scoped. With pnpm: `pnpm agents:awake --epic=12`. With npm: `npm run agents:awake -- --epic=12`.
- **New skill: `/run-ticket <n>`.** `/run-epic` for one ticket, with no Docker or Sandcastle: it claims the ticket, branches, builds and reviews it with the loop's own prompts in subagents, and lands it the way the loop would. A ticket under an epic merges onto the epic branch and closes, and the epic's PR goes up when it was the last open ticket. Any other ticket (a bug, a small enhancement) arrives as a PR to `main` with `Fixes #n`, labelled `ready-for-review`. Install it with `npx skills@latest add imick-io/skills --skill run-ticket`.

Run `/update-imick-skills` in a project to get the new `.sandcastle/main.mts`. **npm projects:** change the `agents:awake` script to `"caffeinate -i npm run agents --"`, so npm passes the flags through to the loop. pnpm and yarn projects need no change.
