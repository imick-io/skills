---
"imick-skills": minor
---

New `whats-next` skill: ask "what's next?" (or `/whats-next`) in a project using these skills, and it reads where the project stands and names your next one to three moves, each with its command or link. It checks setup, whether your skills and `.sandcastle/` files are behind upstream, the agent loop (config by key name only, mode, Docker, whether it's running, its last log), uncommitted or unpushed work the loop's agents can't see, and what waits on you on GitHub: `agent:asked` questions, specs to approve, `ready-for-human` items ordered by what they block, epics to brief, reviews and open PRs. It only reads, and offers to do the first move when an agent can.

To add it to a project: `npx skills@latest add imick-io/skills --skill whats-next`.
