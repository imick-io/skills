---
"imick-skills": minor
---

Run one agent loop per area, on as many machines as you like, without them colliding.

- **`--area=mobile,crm`** scopes the loop to the epics labelled `area:mobile` or `area:crm` (an `area:mobile:<part>` counts as `mobile`) and to the tickets outside epics with those labels; `--area=none` takes what has no area label. It runs on like an unscoped loop instead of stopping, and doesn't triage. Give each machine its own areas, say `npm run agents:awake -- --area=mobile` on one and `--area=crm,api,none` on another, and the loops never share an epic branch, a planning run, a PR or a ticket. Don't run an unscoped loop beside them, since it takes everything. `--dry-run` shows the scope and warns when no open epic carries an area you named, and `/why-sleeping` says which areas the running loop has.
- **The tracker shows each epic's area** as a pill on the roadmap and the epic board.

Run `/update-imick-skills` in a project to get the new `.sandcastle/main.mts` and `tracker/build.mjs`. Areas come from the `area:*` labels your epics already carry (see `docs/agents/team.md`).
