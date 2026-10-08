---
name: setup-imick-skills
description: "Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. Run once before first use of the other engineering skills."
disable-model-invocation: true
---

# Setup iMick's Skills

Scaffold the per-repo configuration that the engineering skills assume:

- **Issue tracker**: where issues live (GitHub by default; local markdown is also supported out of the box)
- **Triage labels**: the strings used for the five canonical triage roles
- **Domain docs**: where `GLOSSARY.md` and ADRs live, and the consumer rules for reading them
- **Team and areas**: the parts of the product, who owns each, and the people on each team
- **Automatic triage** (optional, GitHub only): a workflow that triages each new issue
- **Agent loop** (optional, GitHub only): Sandcastle agents that work the ready tickets
- **Epic PRs** (optional, GitHub only): the epic-gate merge check and the closing chain

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## Process

### 1. Explore

Look at the current repo to understand its starting state. Read whatever exists; don't assume:

- `git remote -v` and `.git/config`: is this a GitHub repo? Which one?
- `AGENTS.md` and `CLAUDE.md` at the repo root: does either exist? Is there already an `## Agent skills` section in either?
- `GLOSSARY.md` and `GLOSSARY-MAP.md` at the repo root
- `docs/adr/` and any `src/*/docs/adr/` directories
- `docs/agents/`: does this skill's prior output already exist?
- `.scratch/`: a sign that a local-markdown issue tracker convention is already in use
- Is the `triage` skill installed? (a `triage` skill folder alongside this one, or `triage` in your available skills.) This decides whether Section B runs at all.
- Monorepo signals: a `pnpm-workspace.yaml`, a `workspaces` field in `package.json`, or a populated `packages/*` with its own `src/`. These are present only in a genuinely large multi-package repo; their absence means single-context, which is almost every repo.

### 2. Present findings and ask

Summarise what's present and what's missing. Then take the sections in order. One section, one answer, then the next.

Lead each section with the recommended answer so the user can accept it in a word. Give a one-line explainer only when the choice genuinely branches; skip the section entirely when exploration already settled it (Section B when `triage` isn't installed and Section E is declined, Section C when there's no monorepo, Sections E, F and G off GitHub).

**Section A: Issue tracker.**

> Explainer: The "issue tracker" is where issues live for this repo. Skills like `to-tickets`, `triage`, and `to-spec` read from and write to it. They need to know whether to call `gh issue create`, write a markdown file under `.scratch/`, or follow some other workflow you describe. Pick the place you actually track work for this repo.

Default posture: these skills were designed for GitHub. If a `git remote` points at GitHub, propose that. If a `git remote` points at GitLab (`gitlab.com` or a self-hosted host), propose GitLab. Otherwise (or if the user prefers), offer:

- **GitHub**: issues live in the repo's GitHub Issues (uses the `gh` CLI)
- **GitLab**: issues live in the repo's GitLab Issues (uses the [`glab`](https://gitlab.com/gitlab-org/cli) CLI)
- **Local markdown**: issues live as files under `.scratch/<feature>/` in this repo (good for solo projects or repos without a remote)
- **Other** (Jira, Linear, etc.): ask the user to describe the workflow in one paragraph; the skill will record it as freeform prose

Record the choice in `docs/agents/issue-tracker.md`. The GitHub and GitLab templates carry a "PRs as a request surface" flag, defaulted **off**. Leave it off and don't raise it: a user who wants external PRs in the triage queue can flip the flag in the file later.

**Section B: Triage label vocabulary.** Skip this section entirely if the `triage` skill isn't installed (exploration told you), since an uninstalled skill needs no labels.

If it is installed, ask exactly one question:

> Do you want to keep the default triage labels? (recommended: **yes**)

The defaults are the canonical roles in [triage-labels.md](./triage-labels.md), each label string equal to its name. On **yes**, write them as-is. Only if the user says no, usually because their tracker already uses other names, collect the overrides so `triage` applies existing labels instead of creating duplicates.

**Section C: Domain docs.** Default to **single-context** (one `GLOSSARY.md` + `docs/adr/` at the repo root). This fits almost every repo; write it without asking.

Offer **multi-context** (a root `GLOSSARY-MAP.md` pointing to per-context `GLOSSARY.md` files) only when exploration found monorepo signals. Then confirm which layout they want.

**Section D: Team and areas.** Always ask: the repo rarely shows its full structure yet (a dashboard may be planned but not built), and only the user knows who owns what. Offer what exploration found (apps, workspaces, top-level folders) as suggestions to accept or correct, then ask, one at a time:

1. **Areas**: the parts of the product, each with one owner. Label `area:<app>`, or `area:<app>:<part>` when an app has several owners. If the answer is a single area, record "Single area: no area labels" and skip the rest of this section.
2. **Teams**: the teams, and which team owns each area.
3. **People**: each member's GitHub handle and a one-line description of what they do, including who is the default for their team.

**Section E: Automatic triage.** GitHub only; skip otherwise. Check `.github/workflows/` for an existing `triage.yml` first. Ask:

> Install automatic triage? A workflow triages each new issue, re-triages `needs-info` issues when the reporter replies, and reports to Slack if you want. (recommended: **yes** for repos where others file issues)

On **yes**, ask one more question:

> Pin a released version (`v1`, recommended), or follow `main` (every change to the skills repo applies immediately)?

Then, besides the files in step 4:

- Write `.github/workflows/triage.yml` from [triage-caller.yml](./triage-caller.yml), replacing both `<REF>` with the answer. Section B's labels file is required: run Section B even if `triage` isn't installed locally (the workflow loads the skill itself).
- Create every role label from `triage-labels.md` (`gh label create "<label>" --force`).
- Tell the user which secrets this repo needs, set on the repo, or on its organization limited to selected repositories (an org admin does this). They paste each value themselves; never ask for or handle the values:
  - `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`; one year) or `ANTHROPIC_API_KEY`. The token prints wrapped over two lines, and terminals embedded in apps may mask it, so: run `claude setup-token` in a regular terminal, copy the token, check the clipboard with `pbpaste | tr -d '[:space:]' | cut -c1-13; pbpaste | tr -d '[:space:]' | wc -c` (expect `sk-ant-oat01-` and about 108), then store it with `pbpaste | tr -d '[:space:]' | gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <owner>/<repo>`
  - optional `SLACK_ALERTS_WEBHOOK_URL` (failures, stuck issues, token warnings) and `SLACK_FEED_WEBHOOK_URL` (every triage decision): Slack incoming webhooks, one per channel
- Remind them that workflows only run from the default branch: commit and push this setup there.

**First time only** (the user has no token checks running anywhere yet): offer to walk them through the one-time steps with the `wizard` skill: creating the token, the two Slack webhooks, and the token checks. The token checks go in one repo that holds the same token, from [token-checks-caller.yml](./token-checks-caller.yml), with the repo or org variable `CLAUDE_TOKEN_CREATED` set to the token's creation date (`gh variable set CLAUDE_TOKEN_CREATED --body YYYY-MM-DD`). Suggest keeping a list of every repo holding the token: renewing it is then a checklist.

**Section F: Agent loop.** GitHub only; skip otherwise. Ask:

> Set up the agent loop? Agents in Docker sandboxes work this repo's `ready-for-agent` and `ready-for-agent-debugging` tickets: epic tickets land on the epic branch, the rest as PRs, and a finished epic opens its PR to `main`. You run it with `npm run agents` (or `-- --once` for one pass), on your machine while you work and on an always-on machine. (recommended: **yes** once the repo has an issue tracker and tickets)

On **yes**:

1. **Docker**: check `docker info` succeeds; if not, ask the user to start Docker Desktop (or install it) and wait.
2. **Scaffold**: `npx @ai-hero/sandcastle init --agent claude-code --sandbox docker --template blank --issue-tracker github-issues --create-label false --build-image false --install-template-deps false`, then replace its files with this skill's [agent-loop/](./agent-loop/) folder: `main.mts`, the four prompts, `Dockerfile` and `.env.example`, all into `.sandcastle/`. Delete the scaffold's `prompt.md` and its `main.ts` (a `"type": "module"` project gets `main.ts` instead of `main.mts`).
3. **Dependencies and script**: install `@ai-hero/sandcastle`, `zod` and `tsx` as dev dependencies with the project's package manager, and add the script `"agents": "tsx --env-file-if-exists=.sandcastle/.env .sandcastle/main.mts"`.
4. **Image**: `npx sandcastle docker build-image`.
5. **Secrets**: tell the user to copy `.sandcastle/.env.example` to `.sandcastle/.env` (gitignored) and fill it themselves; never ask for or handle the values:
   - `CLAUDE_CODE_OAUTH_TOKEN`: the same clipboard routine as Section E, writing to the file instead of a secret.
   - `GH_TOKEN`: a fine-grained token for this repo with **Issues: read and write**, **Metadata: read**, and for `verify-epic` **Commit statuses: read and write**, **Deployments: read** and **Pull requests: read**. Agents in the sandbox use it to read tickets and comment; pushing and PRs happen on the host with the user's own `gh` login.
6. **Labels**: make sure `ready-for-agent`, `ready-for-agent-debugging`, `ready-for-human` and `ready-for-review` exist.

The loop needs the skills it calls committed in the repo (`implement`, `tdd`, `code-review`, `debug-and-fix`, `diagnosing-bugs`, `verify-epic`, and their dependencies; for `--autopilot` also `wayfinder`, `dig`, `research`, `to-spec`, `to-tickets` and `prototype`): agents in the sandbox see only the repo. Check `.claude/skills/` and offer `npx skills@latest add imick-io/skills` for any missing.

**Section G: Epic PRs.** GitHub only, and only when the repo uses epics (`/scope-decomposer`). Ask:

> Install the epic workflow? It adds the **epic-gate** check, which keeps an epic's PR unmergeable until its tickets are closed, no `mocks/` folder is left and `verify-epic` passed, and the **closing chain**, which closes an epic's milestone when the epic closes and its initiative when the last epic ships. (recommended: **yes** with the agent loop)

On **yes**:

1. Write `.github/workflows/epics.yml` from [epics-caller.yml](./epics-caller.yml), with the same `<REF>` choice as Section E.
2. Write `docs/agents/preview.md` from [preview.md](./preview.md). Ask which **Source** applies: previews reported to GitHub (`github-deployments`, e.g. Vercel), a predictable URL (`url-pattern`, e.g. Coolify: ask for the pattern with `{number}`), or none (`local`). Ask whether previews are protected, and if so which environment variable names hold the credentials; the user puts the values in `.sandcastle/.env` themselves.
3. **Make `epic-gate` a required check** on the default branch. This changes a repo setting: confirm first, then use the repo's existing branch protection (add `epic-gate` to its required status checks) or, if there is none, tell the user to add it under **Settings → Branches**. Every non-epic PR passes it automatically.

### 3. Confirm and edit

Show the user a draft of:

- The `## Agent skills` block to add to whichever of `CLAUDE.md` / `AGENTS.md` is being edited (see step 4 for selection rules)
- The contents of `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, `docs/agents/team.md`, and `docs/agents/triage-labels.md` (the last only when `triage` is installed)

Let them edit before writing.

### 4. Write

**Pick the file to edit:**

- If `CLAUDE.md` exists, edit it.
- Else if `AGENTS.md` exists, edit it.
- If neither exists, ask the user which one to create; don't pick for them.

Never create `AGENTS.md` when `CLAUDE.md` already exists (or vice versa); always edit the one that's already there.

If an `## Agent skills` block already exists in the chosen file, update its contents in-place rather than appending a duplicate. Don't overwrite user edits to the surrounding sections.

The block:

```markdown
## Agent skills

### Issue tracker

[one-line summary of where issues are tracked]. See `docs/agents/issue-tracker.md`.

### Triage labels

[one-line summary of the label vocabulary]. See `docs/agents/triage-labels.md`.

### Domain docs

[one-line summary of layout: "single-context" or "multi-context"]. See `docs/agents/domain.md`.

### Team and areas

[one-line summary: the areas and their owning teams, or "single area"]. See `docs/agents/team.md`.
```

Include the `### Triage labels` sub-block, and write `docs/agents/triage-labels.md`, only when `triage` is installed and Section B ran. When it isn't, both are omitted.

Then write the docs files using the seed templates in this skill folder as a starting point:

- [issue-tracker-github.md](./issue-tracker-github.md): GitHub issue tracker
- [issue-tracker-gitlab.md](./issue-tracker-gitlab.md): GitLab issue tracker
- [issue-tracker-local.md](./issue-tracker-local.md): local-markdown issue tracker
- [triage-labels.md](./triage-labels.md): label mapping (only if `triage` is installed)
- [domain.md](./domain.md): domain doc consumer rules + layout
- [team.md](./team.md): areas, owning teams and people

On GitHub, also create every `area:*` label from `team.md` (`gh label create "<label>" --force`), plus `initiative` and `epic`. Section E's workflow and labels are written here too, when the user chose it.

For "other" issue trackers, write `docs/agents/issue-tracker.md` from scratch using the user's description.

### 5. Done

Tell the user the setup is complete and which engineering skills will now read from these files. Mention they can edit `docs/agents/*.md` directly later; re-running this skill is only necessary if they want to switch issue trackers or restart from scratch.
