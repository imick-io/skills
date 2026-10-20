---
"imick-skills": minor
---

Triage can now run inside the agent loop instead of GitHub Actions. `/setup-imick-skills` asks where automatic triage runs: **GitHub Actions** (reacts within a minute, around the clock, with the triage agent limited to `gh issue` commands, but uses Actions minutes) or **the agent loop** (no Actions minutes or billing, but issues are only triaged while the loop runs, up to its idle wait later, with the sandbox's full permissions, so keep it to repos where only trusted people file issues).

With `AGENTS_TRIAGE=1` in `.sandcastle/.env`, each pass starts by triaging, before it builds:

- new issues with no triage label, filed by the repo's own people,
- `needs-info` issues whose newest comment is a reply from the reporter or a collaborator, or that were edited after the last triage note,
- anything on `needs-triage`: a triage that didn't finish, or one you ask for by adding the label.

It skips what the workflow skips: epics, initiatives, specs, wayfinder issues, backlog, and tickets under an epic. It needs no state between passes, so it also catches what was filed or answered while the loop was off. With `SLACK_FEED_WEBHOOK_URL` set, every decision goes to the feed channel, like the workflow's. A triage that ends without a decision and a comment is alerted once and left alone until the loop restarts.

In a project already running the loop: copy `agent-loop/main.mts` over `.sandcastle/main.mts` (keeping local changes) and `agent-loop/triage-prompt.md` into `.sandcastle/`, make sure the `triage` skill is committed in the repo, add `AGENTS_TRIAGE=1` to `.sandcastle/.env`, and strip `.github/workflows/triage.yml` down to its `workflow_dispatch` trigger so the two never triage the same issue. Restart the loop.
