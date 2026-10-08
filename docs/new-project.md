# Running a new project

The practical checklist: from an empty repo to agents shipping your epics. For the *why* behind each step, see [How work flows](workflow.md); for the always-on machine, see [Always-on Mac](mac-setup.md).

Commands run in the project's folder unless said otherwise. `/something` means typing it in a Claude Code session opened in that folder.

## The short version

```text
1. Create the repo, install the skills, run /setup-imick-skills         (once, ~20 min)
2. /scope-decomposer "<your idea>"            → initiative + epics          (you + agent)
3. /brief                                      → per epic: intent + manual or autopilot
4. Manual epics: /wayfinder <epic>             Autopilot epics: the loop plans them
5. Approve specs (label spec-approved)         → tickets
6. npm run agents                              → agents build, fix, verify
7. Review the epic PR when epic-gate is green  → merge → everything closes
```

## 1. Set up the project (once)

**Prerequisites on your machine**: `git`, `gh` logged in (`gh auth status`), Node 22+, Docker Desktop, Claude Code. Global skills `grilling`, `grill-me`, `handoff`, `teach`, `research` and `dig` are already linked in `~/.claude/skills/`.

**1.1 Create the repo** on GitHub (in the Concreo org for client work, so secrets can be shared at the org level) and clone it.

**1.2 Install the skills into the project**, as copies so they're committed: agents in the loop's Docker sandboxes only see the repo.

```bash
npx skills@latest add imick-io/skills --agent claude-code --copy -y --skill \
  setup-imick-skills ask-imick triage scope-decomposer brief wayfinder dig research grilling \
  domain-modeling codebase-design prototype product-design to-spec to-tickets implement tdd \
  code-review debug-and-fix diagnosing-bugs verify-epic
```

Commit `.claude/skills/`. Update them later with `npx skills@latest update -p`, then commit again.

**1.3 Run `/setup-imick-skills`** and answer its sections:

| Section | What to answer |
| --- | --- |
| A. Issue tracker | GitHub |
| B. Triage labels | Keep the defaults |
| C. Domain docs | Single-context (unless it's a monorepo) |
| D. Team and areas | The apps and parts, who owns each (`area:app:dashboard` …), each person's GitHub handle; "single area" for a one-person project |
| E. Automatic triage | Yes if others will file issues; pin `v1` |
| F. Agent loop | Yes |
| G. Epic PRs | Yes; say where previews live (Vercel → `github-deployments`, Coolify → a URL pattern, none → `local`); confirm making `epic-gate` a required check |

It writes `docs/agents/*`, the workflows, `.sandcastle/` and the labels. Commit and push to `main`: workflows only run from the default branch.

**1.4 Secrets.** GitHub never shows a secret again, so keep the values in your password manager.

| Secret | Where | How |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` (triage) | Repo or org secret | `claude setup-token` in a regular terminal, copy it, then `pbpaste \| tr -d '[:space:]' \| gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <owner>/<repo>` |
| `SLACK_FEED_WEBHOOK_URL`, `SLACK_ALERTS_WEBHOOK_URL` (optional) | Repo or org secret | Slack incoming webhooks for `#triage-feed` and `#triage-alerts`, same `gh secret set` |
| `.sandcastle/.env` (the loop) | The file, never committed | `cp .sandcastle/.env.example .sandcastle/.env`, then fill `CLAUDE_CODE_OAUTH_TOKEN` and `GH_TOKEN` with the `sed … pbpaste` commands in the [README](../README.md#agent-loop) |

`GH_TOKEN` is a fine-grained token for this repo only: Issues read/write, Metadata read, Commit statuses read/write, Deployments read, Pull requests read.

**1.5 Check it.** Open a test issue: within minutes it's labelled and commented (triage works). Then `npm run agents -- --once`: it should log "nothing ready" (the loop works). Close the test issue.

## 2. Scope the idea

```text
/scope-decomposer Build a budgeting app for couples: ...
```

A high-level interview, then a proposal of epics in build order. Push back until the cut feels right. It creates an **initiative** issue and the **epics** under it, each with its milestone (`NN: Initiative / Epic`), branch (`epic/NN-slug`), area, and blocking links. Every epic starts labelled `needs-briefing` + `ready-for-human`.

Vague parts land in the initiative's **Not yet scoped** list; run `/scope-decomposer #<initiative>` again later to turn them into epics.

## 3. Brief each epic

```text
/brief            # the next epic waiting for one, in build order
/brief #12        # a specific epic
```

A few rounds of high-level questions: who it's for, must-haves, no-gos, the big product calls. Reply `ok` to accept every recommendation at 90%+. It writes the epic's **Brief** section (plus `GLOSSARY.md` and ADRs) and ends with:

- **Autopilot**: the epic gets the `autopilot` label and the agent loop plans it.
- **Manual**: you plan it yourself in step 4.

Brief every epic now, or just before each is planned; either works. To skip a brief, remove `needs-briefing` and `ready-for-human` from the epic yourself (and add `autopilot` if you want the agent to plan it).

## 4. Plan each epic

**Manual epics**: `/wayfinder #<epic>`. It charts a map of decision tickets starting from your brief, then works through them with you, one per session (`/dig Q3` researches a question you can't settle). When the way is clear it hands off to `/to-spec`, then `/to-tickets` cuts the tickets. Run them yourself when wayfinder says the map is done.

**Autopilot epics**: nothing to run. The loop (step 6) charts the map, decides on its own (your brief's lines as given, 75%+ answers directly, the rest after `dig` or marked *assumed*), and writes the spec.

**The UI, either way**: `/product-design #<epic>` builds the real screens on mock data with you, before, during or after the map. Say "we agree" when it looks right: it writes a UI spec and production tickets.

## 5. Approve autopilot specs

When an autopilot spec is ready, Slack pings you and the spec issue is labelled `spec` + `ready-for-human`. Read its **Decided on autopilot** section, least confident first.

- **Approve**: add the `spec-approved` label. The next loop pass cuts the tickets.
- **Change something**: comment what to change. The next pass revises the spec and pings you again.

## 6. Run the agents

```bash
npm run agents                    # until you stop it: plans autopilot epics, builds, fixes, verifies
npm run agents -- --once          # a single pass
npm run agents -- --no-planning   # build only
```

On your laptop while you work, and on the [always-on Mac](mac-setup.md) the rest of the time; they never take the same ticket. Each pass:

- plans `autopilot` epics and cuts tickets from approved specs,
- builds every ready ticket (`ready-for-agent`), fixes every ready bug (`ready-for-agent-debugging`),
- lands epic work on the epic branch; other work arrives as PRs,
- opens an epic's PR to `main` once its milestone is empty, and verifies it in the running app.

## 7. Review and merge

An epic's PR is ready when **`epic-gate`** is green: no open tickets, no `mocks/` left, `verify-epic` passed. Failures `verify-epic` found are already tickets the loop is fixing. Review the PR and merge it: the epic closes, then its milestone, then the initiative when it was the last epic (or it comments, if parked areas remain).

## Your daily check

| Look for | Means | Do |
| --- | --- | --- |
| `ready-for-human` assigned to you | You're the next step | Read the comment: answer, decide, or do the task |
| `spec` + `ready-for-human` | An autopilot spec to review | Approve (`spec-approved`) or comment |
| `needs-briefing` | Epics waiting for a brief | `/brief` |
| `ready-for-review` | A fix PR waiting | Review and merge |
| A green `epic-gate` | An epic ready to ship | Review and merge |
| `#triage-alerts` in Slack | A failed run, a stuck issue, or a token expiring | Follow the message |

`/ask-imick` answers "which skill now?" at any point.

## When something's off

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| A new issue isn't labelled | Triage token missing or expired | Check `#triage-alerts` or the Actions tab; renew with `claude setup-token` |
| `npm run agents` fails at once | Docker isn't running, or `.sandcastle/.env` incomplete | Start Docker Desktop; fill the `.env` |
| The loop says "nothing ready" but tickets exist | They're assigned, blocked, or lack `ready-for-agent` | Unassign, close the blocker, or add the label |
| An autopilot epic never gets planned | It still has `needs-briefing`, lacks `autopilot`, or is blocked by another epic | Brief it, add the label, or finish the blocker |
| An epic is paused | Merging `main` into its branch conflicts | Resolve the "Resolve conflicts" ticket on the epic branch |
| `epic-gate` stays red | Its description says why | Close the tickets, remove `mocks/`, or wait for verification |
