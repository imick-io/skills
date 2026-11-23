# DESIGN FIX: #{{ISSUE}} {{TITLE}}, after round {{ROUND}}

You are run by `/run-design-epic`, inside a Claude Code session on the developer's machine, not in a sandbox. A design critic reviewed screenshots of this ticket's work and listed what to fix. You fix it.

Work **only** in the git worktree `{{WORKTREE}}`: `cd` there first; it is on branch `{{BRANCH}}`, dependencies installed, with the ticket's work so far committed. Never switch branches, push, open PRs, or touch any other checkout or worktree; the session lands the work. The project's services are already running on this machine. Stop every process you started before finishing.

## The findings

The pictures are in `{{DIR}}` (`shots.json` maps each file to its screen, route, person, state, viewport and theme). Read the ones a finding names before changing anything.

{{FINDINGS}}

## What to do

- Fix **every** `must` finding. Fix each `should` finding unless it needs a decision the ticket does not make; say which you left and why.
- Fix the cause, not the picture: when a finding is about a shared component, change the component so every screen gets it.
- Build from the project's shared components and tokens, as the ticket and its epic require. Add no one-off styles.
- Keep to the ticket's scope.
- Follow the project's conventions for tests: update the ones your change reaches, and leave typecheck and the related tests green (`.sandcastle/implement-prompt.md` says which commands).
- Commit on the branch, one commit per coherent fix, in the project's commit style.

End with a short report: each finding and what you did about it, the commits you made, and what you ran.

---

## The ticket

{{BODY}}
