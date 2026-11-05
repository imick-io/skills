---
name: run-ticket
description: Build one ticket inside this Claude Code session, the way the agent loop would (claim, branch, implement, review, land), without Docker or Sandcastle. A ticket under an epic lands on the epic branch, exactly as /run-epic or the loop lands it; any other ticket (a bug, a small enhancement) arrives as a PR to main. Use when the user wants a single ticket built here, says "run the ticket", "build #42 here", or "run-ticket 42".
disable-model-invocation: true
argument-hint: "<ticket number> [--force]"
---

# Run ticket

The agent loop's pipeline, in a session, on one ticket. You coordinate; one subagent per step builds. It's [/run-epic](../run-epic/SKILL.md) for a single ticket, and it also covers tickets in no epic, which `/run-epic` never sees. A ticket built this way is indistinguishable from one the loop built: the same claim and branch rules, the loop's own prompts, the same landing.

- **Under an epic** (its milestone belongs to an open `epic`): branch `agent/issue-<n>` off the epic branch after merging `main` into it, land by merging onto the epic branch, close the ticket. When it was the epic's last open ticket, its PR to `main` goes up, as `/run-epic` opens it.
- **No epic**: branch `feat/<n>` (`fix/<n>` for a bug) off `main`, land as a PR to `main` with `Fixes #<n>`, labelled `ready-for-review`. A person merges it.

[scripts/run-ticket.mjs](./scripts/run-ticket.mjs) does every deterministic step; run it from the repo root as `node <this skill>/scripts/run-ticket.mjs <command>`. Below, `run-ticket` means that.

## 0. Before building

1. **`run-ticket check <ticket>`.** It stops (exit 1) when the checkout is dirty, `gh` is logged out, or the ticket can't be built here: closed, an epic (offer `/run-epic`), a spec or a wayfinder ticket, parked in `backlog`, never triaged into a buildable ticket (none of `ready-for-agent`, `ready-for-agent-debugging`, `ready-for-human`: offer `/triage`), claimed by someone else, blocked, or its branch held by another worktree. Relay the reason and its fix in plain words; don't work around it. **Exit 2**: the ticket is assigned to the user and the agent loop runs in this checkout, so the loop may be building it; ask them to stop the loop or pick another ticket. `--force` overrides a block, the backlog, a missing label or exit 2, and only on the user's word.
2. **Read `notes`.** A `ready-for-human` ticket was meant for a person: read the issue and its last comments. If it waits on a decision, an answer from someone, or access the agent won't have, stop and say so instead of building.
3. **Permissions.** The build runs unattended for a while. Ask the user, once: is the session in a mode where tool calls won't prompt (auto mode, or an allowlist covering `git`, `gh`, the package manager and the test runners)? If not, stop and ask them to switch (`shift+tab` or `/permissions`); never change settings yourself.
4. **Services.** `check` prints what `.sandcastle/sandbox-setup.sh` starts in a sandbox and the project's dev-up command. Check they are running on this machine (a quick port probe or the project's own status command). If not, **ask before starting them**; start them only on a yes, with the project's own command.
5. Tell the user the plan in two lines: the ticket, and where it lands (`ticket.lands`). Then start; don't ask again until it's landed or handed back.

## 1. Build and land

1. **`run-ticket prepare <ticket>`.** Claims it (assignee), brings the base up to date (under an epic: merges `main` into the epic branch and pushes), creates or reuses the ticket branch in a worktree under `.claude/worktrees/run-ticket-<n>`, installs dependencies there. Read the JSON: `install` must say ok; `branchNote` tells you whether earlier work exists.
2. **Build.** `run-ticket prompt implement <ticket>` (`prompt bug` when `kind` is `bug`) prints the loop's own prompt, filled in, with a RUN-TICKET preamble naming the worktree. Dispatch **one subagent** (general-purpose) with that text as its whole prompt. Wait for it.
3. **`run-ticket commits <ticket>`.** `0` means the agent couldn't build it and has said why on the issue (a bug it diagnosed for a person, or couldn't reproduce, ends here too): `run-ticket handback <ticket> "<its reason, one line>"`, then report. Don't retry, don't fix it yourself: the loop gives one attempt, and so do you.
4. **Review.** `run-ticket prompt review <ticket>`; dispatch one subagent with it. Wait.
5. **`run-ticket land <ticket>`.**
   - **No epic**: pushes the branch, opens the PR to `main` (or reuses the open one), swaps the ticket's label to `ready-for-review`, removes the worktree (the branch stays for review fixes), rebuilds the tracker, posts to the Slack feed.
   - **Under an epic**: merges onto the epic branch, pushes, closes the ticket with the loop's wording, deletes the branch and worktree. When the epic has no open ticket left, `epicPrOpened` / `epicPr` say its PR to `main` went up (or was already open). **Exit 3** is a merge conflict with work landed since the branch was cut: as the loop does, `run-ticket prepare <ticket> --retry` (drops the branch, recreates it on the latest epic branch) and build once more from step 2. A second conflict is a hand-back.

**If a step fails for another reason** (a push refused, `gh` down, a subagent that died): hand the ticket back with the error as the reason, and report.

## 2. Report

One message, standing on its own: the ticket, then either the PR to review (no epic) or the commit it landed in on the epic branch, and the epic's PR when it went up (tell the user to run `/verify-epic` on it before merging; don't run it yourself). For a hand-back, the reason and a link to the issue. Add anything the agents flagged (a failing check that predates the run, a service they missed). `run-ticket notify feed "<the same, in one or two lines>"` when `check` showed a webhook. Leave no worktree of yours behind: `land` and `handback` remove theirs.

## Rules

- **Reuse the loop, don't improvise.** The prompts are the loop's (`.sandcastle/*-prompt.md`, else this repo's templates); if a step needs something they don't say, that is a change to the loop's prompts, not to this run.
- **Subagents commit; you land.** No subagent pushes, opens a PR, closes or labels an issue. Everything on GitHub goes through the script.
- **One attempt, no questions mid-run.** The hand-back is the question: it reaches the user on the issue, in the tracker and in Slack.
- **Several tickets?** Run them one after the other, never two at once: they share this machine's database, ports and CPU. A whole `manual` epic is `/run-epic`'s job; for tickets the loop should build without you watching, `npm run agents -- --tickets=<n>,<m>` scopes the loop to them.
- **`main` stays untouched.** The checkout never changes branch; all work is in worktrees, pushed to the ticket branch or the epic branch.
