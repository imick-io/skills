---
"imick-skills": minor
---

**The loop reviews screens for real, and `needs-design` now holds building too.**

- **Design rounds in the agent loop.** In a project with a `DESIGN.md`, a ticket whose diff touches screen files goes through `/run-design-epic`'s rounds between its build and its code review. A fresh agent that didn't build the screens photographs them in the sandbox and lists what's wrong; a must-fix finding goes to a fix and another round, three at most. A ticket that passes gets a "Design review" comment saying so. One with a must-fix finding still open after the last round is not landed: it goes to `ready-for-human` with the findings, its work kept on its branch. When the app won't start in the sandbox the ticket lands on its code review alone, and its issue says the screens were not reviewed. Until now the review was one paragraph in the reviewer's prompt, which nothing checked.
- **You can see what the critic saw.** Each round's screenshots are copied out of the sandbox to `.sandcastle/design/<ticket>/round-<n>/` on the loop's machine (never committed), and the issue's comment names the folder. `index.html` there is a review page: every ticket's verdict, findings and pictures, latest first. A ticket that passed keeps its last round only, one handed back keeps them all, and a ticket closed for a week (`AGENTS_DESIGN_KEEP_DAYS`) loses its folder at the loop's next start.
- **Fast mode retries a failed design review once.** Its unblocking may send the first hand-back to be built again; a second one gets `agent:asked` and a Slack ping, and waits for your comment.
- **`/brand` settles the shell too.** After the look, you agree the navigation and one page of each kind (list, detail, form), so no epic invents its own; `DESIGN.md` gains a **Shell and navigation** section and the Design system epic builds it as layout components.
- **The Design system epic makes the screens photographable.** Its must-haves now include the capture recipe (`docs/agents/design-capture.md`) and a `sandbox-setup.sh` that starts the app, which the loop's critic needs.
- **`needs-design` holds building as well as planning.** The loop no longer builds tickets that already sit under an epic labelled `needs-design` (an epic planned before you chose to design it). Its `--dry-run` says why such a ticket waits.
- **The tracker's roadmap shows the design hold.** A ticket the loop would take next shows as waiting (grey) while its epic is `needs-design`, with the reason on hover, and the roadmap's key names the design step.
- The three flowcharts on the handbook page show `/brand` and `/product-design`.

**Existing setups.** Run `/update-imick-skills`: it copies the tracker's `build.mjs`, the loop's `main.mts`, the trimmed `review-prompt.md` and the two new prompts, `design-review-prompt.md` and `design-fix-prompt.md`, into `.sandcastle/`. Then:

1. The critic needs the app running in the sandbox. A product briefed with `/brand` from now on gets this from its Design system epic; on an existing one, if `.sandcastle/sandbox-setup.sh` doesn't start what the app needs, add it, and write `docs/agents/design-capture.md` (how to run the app, sign in as a seeded person and screenshot a route) for anything that isn't obvious from the dev script.
2. Optional, in `.sandcastle/.env`: `AGENTS_DESIGN_ROUNDS` (3; `0` turns the rounds off, for a mobile app the sandbox can't run) and `AGENTS_DESIGN_FILES` (the changed files that mean a ticket changes screens; `*.tsx,*.jsx,*.vue,*.svelte,*.astro,*.css,*.scss`).

A UI ticket now costs one to three extra agent runs for the critic (on the planner model) and up to two for fixes.
