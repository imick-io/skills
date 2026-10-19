---
name: whats-next
description: What's next in a project using these skills - reads where it stands (setup, the agent loop, what waits on you on GitHub, local changes) and names the next one to three moves, each with its command. Use when the user asks what's next, where things stand, what's waiting on them, or what to do now.
---

# What's next

Name the user's **next move**: the one to three actions that unblock the most, most important first, each with the exact command or link. This skill only reads. It changes nothing, and offers to do the first move when an agent can.

`/ask-imick` answers "which skill fits my situation?" from the user's description. This skill answers "what now?" from the project's actual state.

## 1. Read the state

Run [scripts/gather.mjs](./scripts/gather.mjs) from the repo root: `node <this skill>/scripts/gather.mjs`. It prints one section per check: setup, skills vs upstream, agent loop files vs templates, the loop (config by key name, mode, Docker, process, last log), local git, and GitHub (what waits on a person, the agent queue, epics in build order, open PRs). Backlog issues are left out on purpose: nobody acts on them.

When a line needs a closer look before you can rank it (a last log ending in an error, an epic labelled `agent:planning` with no loop running, a PR whose checks fail), read just that: the log, the issue, the check. Done when every section is read and each non-empty line is either a candidate move or understood as fine.

## 2. Rank the moves

Take the highest rungs first. A rung with nothing on it is skipped.

1. **Broken**: setup missing (no `docs/agents/issue-tracker.md` → `/setup-imick-skills`); `.sandcastle/.env` or a required key missing; Docker down while the loop is meant to run; an epic stuck in `agent:planning` with no loop running (remove the label so the next pass retries); a last log ending in a failure or a usage limit.
2. **The loop waits on you**: `agent:asked` (answer with a comment on the issue), specs to approve, `ready-for-human` items. Order them by what they block: an item that blocks open issues comes before one that blocks nothing.
3. **Work the agents can't see**: uncommitted or unpushed changes the loop needs (skills, `.sandcastle/`, `docs/`, `GLOSSARY.md`, `tracker/`). Agents in the sandbox see only what's on the remote.
4. **The loop is idle with work to do**: not running while the agent queue has tickets or an autopilot epic is unblocked → `npm run agents:awake` (or `-- --once` to watch one pass).
5. **Review and merge**: `ready-for-review`, and open PRs, epic PRs first; failing checks before green ones.
6. **Drift**: skills that differ from upstream (`npx skills update -p -y`, then check the diff: a difference can be a local customization), loop files behind the templates (copy the template, keeping local changes; the source's CHANGELOG says what each update needs), new upstream skills.
7. **The next step in the flow**: no initiative or epics → `/scope-decomposer` on the idea, or `/triage` for raw issues; `needs-scoping` → `/scope-decomposer <issue>`; an epic needing a brief → `/brief <epic>` (first in build order that nothing unbriefed blocks); a briefed manual epic with no map → `/wayfinder <epic>`; on autopilot, the loop handles planning, so the move is rung 4.
8. **Skim**: open `agent:assumed` issues (the loop already went ahead; comment to change a call), `needs-triage`.

Fast and supersonic modes (`AGENTS_MODE`, or the `fast`/`supersonic` label on an epic) answer much of rung 2 themselves: there, list only what the loop explicitly asked (`agent:asked`) and specs it left for you.

## 3. Answer

Reply in this shape, and nothing longer:

```markdown
**Next:**
1. **<move>**: <why, in one line> → `<command>` or <link>
2. ...

**Also:** <one line naming lower-rung items, if any>

<one line: where things stand, e.g. "The loop is idle; Foundation (#5) is next to plan.">
```

Give at most three numbered moves. Link issues and PRs by number. For a move only a person can do (a decision, an account, a secret), give them what to do and where. When the first move is one the agent can do (commit and push, copy templates, remove a stuck label, start the loop), end with one line offering to do it, and wait for a yes.
