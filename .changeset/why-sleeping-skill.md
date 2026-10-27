---
"imick-skills": minor
---

New `why-sleeping` skill: ask "why are the agents sleeping?" (or `/why-sleeping`) and it answers with what you must do so the agent loop has work again, and nothing else. It follows every held ticket and autopilot epic down its blocked-by chain to the action only you can take (merge a verified epic PR, approve a spec, answer an `agent:asked` question, decide a `ready-for-human` item, brief an epic), and ranks those actions by how much each frees. It puts loop problems first (Docker down, the loop not running, a label stuck on `agent:planning`) and leaves out what fast or supersonic mode handles itself. It only reads.

To add it to a project: `npx skills@latest add imick-io/skills --skill why-sleeping`.
