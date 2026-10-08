# Skills

My agent skills, straight from my `.claude/skills` directory.

**New here?** [How work flows](docs/workflow.md) shows the whole path from idea to merged code, and which skill runs each step.

## Installation

### Claude Code (plugin)

```
/plugin marketplace add imick-io/skills
/plugin install imick-skills@imick
```

### Any agent (skills.sh)

```bash
npx skills@latest add imick-io/skills
```

## Skills

My own skills plus the ones I use from other authors, such as [Matt Pocock](https://github.com/mattpocock/skills) and [Cursor](https://github.com/cursor/plugins). The Source column says which is which; licenses are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

<!-- skills:start -->

### Engineering

| Skill | Source | What it does |
| --- | --- | --- |
| [`ask-imick`](skills/engineering/ask-imick/SKILL.md) | Matt Pocock | Ask which skill or flow fits your situation. |
| [`brief`](skills/engineering/brief/SKILL.md) | iMick | Brief an epic before it's planned - a short, high-level grill-with-docs session that captures what you already have in mind, then choose whether wayfinder runs on it manually or on autopilot. |
| [`code-review`](skills/engineering/code-review/SKILL.md) | Matt Pocock | Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). |
| [`codebase-design`](skills/engineering/codebase-design/SKILL.md) | Matt Pocock | Shared vocabulary for designing deep modules. |
| [`debug-and-fix`](skills/engineering/debug-and-fix/SKILL.md) | iMick | Take a bug from the ready-for-agent-debugging queue, diagnose it with diagnosing-bugs (reproducing UI bugs in the browser), fix it with a regression test when the diagnosis is clean, and report the outcome on the issue with the right labels. |
| [`diagnosing-bugs`](skills/engineering/diagnosing-bugs/SKILL.md) | Matt Pocock | Diagnosis loop for hard bugs and performance regressions. |
| [`do-work`](skills/engineering/do-work/SKILL.md) | iMick | Implements the approved plan from the same Claude Code session, executing per the plan's declared Approach (RGR or direct). |
| [`domain-modeling`](skills/engineering/domain-modeling/SKILL.md) | Matt Pocock | Build and sharpen a project's domain model. |
| [`grill-with-docs`](skills/engineering/grill-with-docs/SKILL.md) | Matt Pocock | A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. |
| [`implement`](skills/engineering/implement/SKILL.md) | Matt Pocock | Implement a piece of work based on a spec or set of tickets. |
| [`implement-spec`](skills/engineering/implement-spec/SKILL.md) | Matt Pocock | Implement the result of /to-spec and /to-tickets in code. |
| [`improve-codebase-architecture`](skills/engineering/improve-codebase-architecture/SKILL.md) | Matt Pocock | Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick. |
| [`plan-work`](skills/engineering/plan-work/SKILL.md) | iMick | Read-only planning for an issue on the project issue tracker. |
| [`pr`](skills/engineering/pr/SKILL.md) | Matt Pocock | Use when writing a PR body. |
| [`product-design`](skills/engineering/product-design/SKILL.md) | iMick | Build an epic's real UI with the user, from a fast mockup on mock data to production tickets, so human and agent share one vision of the product. |
| [`prototype`](skills/engineering/prototype/SKILL.md) | Matt Pocock | Build a throwaway prototype to answer a design question. |
| [`research`](skills/engineering/research/SKILL.md) | Matt Pocock | Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. |
| [`retro`](skills/engineering/retro/SKILL.md) | Matt Pocock | Conduct a retrospective on a coding session. |
| [`review-work`](skills/engineering/review-work/SKILL.md) | iMick | Refactor-only review pass over a recent commit. |
| [`scope-decomposer`](skills/engineering/scope-decomposer/SKILL.md) | iMick | Break a big idea, product, feature, existing project or broad issue into an initiative of epics on the issue tracker, each one ready for /brief and then /wayfinder. |
| [`setup-imick-skills`](skills/engineering/setup-imick-skills/SKILL.md) | Matt Pocock | Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. |
| [`tdd`](skills/engineering/tdd/SKILL.md) | Matt Pocock | Test-driven development. |
| [`thermo-nuclear-code-quality-review`](skills/engineering/thermo-nuclear-code-quality-review/SKILL.md) | Cursor | Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth. |
| [`to-spec`](skills/engineering/to-spec/SKILL.md) | Matt Pocock | Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed. |
| [`to-tickets`](skills/engineering/to-tickets/SKILL.md) | Matt Pocock | Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker). |
| [`triage`](skills/engineering/triage/SKILL.md) | iMick | Classify incoming issues (and optionally external PRs) by what they are and who acts next, write agent-ready briefs, and route big asks to scoping. |
| [`verify-epic`](skills/engineering/verify-epic/SKILL.md) | iMick | Test an epic's PR against its tickets, spec and agreed screens in the running app, file each failure as a bug ticket under the epic, and set the verify-epic status the merge gate requires. |
| [`wayfinder`](skills/engineering/wayfinder/SKILL.md) | Matt Pocock | Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear. |
| [`wizard`](skills/engineering/wizard/SKILL.md) | Matt Pocock | Generate an interactive bash wizard that walks a human through steps only they can perform. |

### Productivity

| Skill | Source | What it does |
| --- | --- | --- |
| [`dig`](skills/productivity/dig/SKILL.md) | iMick | Dig into one grilling question in the background (why it matters, the options, what competitors do) and come back with a sharper recommendation. |
| [`grill-me`](skills/productivity/grill-me/SKILL.md) | Matt Pocock | A relentless interview to sharpen a plan or design. |
| [`grilling`](skills/productivity/grilling/SKILL.md) | Matt Pocock | Grill the user relentlessly about a plan, decision, or idea. |
| [`handoff`](skills/productivity/handoff/SKILL.md) | Matt Pocock | Compact the current conversation into a handoff document for another agent to pick up. |
| [`teach`](skills/productivity/teach/SKILL.md) | Matt Pocock | Teach the user a new skill or concept, within this workspace. |
| [`to-questionnaire`](skills/productivity/to-questionnaire/SKILL.md) | Matt Pocock | Turn a decision you can't fully answer into a questionnaire for someone else to fill in. |
| [`wait-what`](skills/productivity/wait-what/SKILL.md) | Matt Pocock | Stop. |
| [`writing-for-agents`](skills/productivity/writing-for-agents/SKILL.md) | Matt Pocock | Writing documents for agents. |

### Misc

| Skill | Source | What it does |
| --- | --- | --- |
| [`git-guardrails-claude-code`](skills/misc/git-guardrails-claude-code/SKILL.md) | Matt Pocock | Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, branch -D, etc.) before they execute. |
| [`migrate-to-shoehorn`](skills/misc/migrate-to-shoehorn/SKILL.md) | Matt Pocock | Migrate test files from `as` type assertions to @total-typescript/shoehorn. |
| [`scaffold-exercises`](skills/misc/scaffold-exercises/SKILL.md) | Matt Pocock | Create exercise directory structures with sections, problems, solutions, and explainers that pass linting. |
| [`setup-pre-commit`](skills/misc/setup-pre-commit/SKILL.md) | Matt Pocock | Set up Husky pre-commit hooks with lint-staged (Prettier), type checking, and tests in the current repo. |
| [`update-from-upstream`](skills/misc/update-from-upstream/SKILL.md) | iMick | Sync the skills in this repo with their upstream sources, merging upstream changes with local customizations; or `add <github-repo> <skill-path>` to import a skill from a new source. |

### In progress (not in the plugin)

| Skill | Source | What it does |
| --- | --- | --- |
| [`claude-handoff`](skills/in-progress/claude-handoff/SKILL.md) | Matt Pocock | Hand the current conversation off to a fresh background agent that picks up the work immediately. |
| [`loop-me`](skills/in-progress/loop-me/SKILL.md) | Matt Pocock | Grill me about specs for the workflows I want to build, within this workspace. |
| [`setup-ts-deep-modules`](skills/in-progress/setup-ts-deep-modules/SKILL.md) | Matt Pocock | Wire dependency-cruiser into a TypeScript repo so each package is a deep module, with implementation hidden in subfolders and reachable only through its entry-point files. |
| [`writing-beats`](skills/in-progress/writing-beats/SKILL.md) | Matt Pocock | Writing, exploit; assemble raw material into a journey of beats, grounding each term before a beat leans on it. |
| [`writing-fragments`](skills/in-progress/writing-fragments/SKILL.md) | Matt Pocock | Writing, explore: mine raw fragments, no structure yet. |
| [`writing-shape`](skills/in-progress/writing-shape/SKILL.md) | Matt Pocock | Writing, exploit: shape raw material into an article, paragraph by paragraph. |

<!-- skills:end -->

## Adding a skill

- **Your own**: create `skills/<category>/<skill-name>/SKILL.md` and add an entry with `"source": "own"` to [`sources.json`](sources.json).
- **From another author**: run `/update-from-upstream add <github-repo> <skill-path>` from this repo.

The tables above, [`plugin.json`](.claude-plugin/plugin.json) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) are generated from `sources.json`.

## Updating from upstream

Run `/update-from-upstream` from this repo. It pulls the latest from every source in [`sources.json`](sources.json), merges it with the local customizations, and only asks when the two collide.

## Automatic triage

A GitHub workflow that runs the [`triage`](skills/engineering/triage/SKILL.md) skill on every new issue, so incoming work arrives labelled, briefed and assigned. Anyone can use it; nothing in it is specific to this repo's owner.

**What it does.** On each new issue from an org member or collaborator, it labels the issue with what it is and who acts next (`bug` + `ready-for-agent-debugging`, `enhancement` + `ready-for-agent` or `ready-for-human`, `needs-scoping`, `needs-info`, `wontfix`), adds its area, assigns the person who acts next, and comments with its reasoning or an agent brief. It never closes anything. When a `needs-info` issue gets a reply or an edit, it triages again. Issues created by the planning skills (initiatives, epics, wayfinder maps and everything under an epic) are left alone.

**Install** with `/setup-imick-skills` in your project, or by hand:

1. Add the labels from [`triage-labels.md`](skills/engineering/setup-imick-skills/triage-labels.md) and the `docs/agents/` files the skill reads (`triage-labels.md`, `team.md`).
2. Copy [`triage-caller.yml`](skills/engineering/setup-imick-skills/triage-caller.yml) to `.github/workflows/triage.yml`, replacing `<REF>` with a release tag (`v1`) or `main`.
3. Set the secrets, on the repo or on your organization:
   - `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`, valid one year; runs count against your Claude plan) or `ANTHROPIC_API_KEY` (billed per use). Run `claude setup-token` in a regular terminal (some app-embedded terminals mask the token), copy the token, check it with `pbpaste | tr -d '[:space:]' | cut -c1-13` (expect `sk-ant-oat01-`), then store it without line breaks: `pbpaste | tr -d '[:space:]' | gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <owner>/<repo>`.
   - Optional: `SLACK_FEED_WEBHOOK_URL` (one message per triage decision) and `SLACK_ALERTS_WEBHOOK_URL` (failures, issues stuck on `needs-triage`, token warnings). Every message starts with `[owner/repo]`, so several projects can share channels.
4. Push to the default branch.

**Token checks.** Once, in one repo that holds the token, copy [`token-checks-caller.yml`](skills/engineering/setup-imick-skills/token-checks-caller.yml) and set the variable `CLAUDE_TOKEN_CREATED` to the token's creation date. It checks the token daily and warns 30 days before it expires.

**Safety.** The run can only read the code and edit issues: its tools are limited to reading files and `gh issue` commands, and issue text is treated as data, never as instructions. Re-run a triage from the Actions tab with the issue number, or run `/triage #<n>` locally.

## Agent loop

Agents that work your tickets while you do something else. A [Sandcastle](https://github.com/mattpocock/sandcastle) loop runs in your project, picks up every issue labelled `ready-for-agent` or `ready-for-agent-debugging`, and works it in a Docker sandbox with the same skills you'd use by hand (`implement`, `debug-and-fix`, `code-review`).

**What one pass does**

1. **Finds the queue**: open, unassigned, unblocked `ready-for-agent` and `ready-for-agent-debugging` issues. Specs (from `to-spec`) are skipped: `to-tickets` turns them into tickets.
2. **Plans**: an agent picks the tickets that can run in parallel without touching the same code (3 at most by default).
3. **Claims** each ticket by assigning it. Two loops (an always-on machine and your laptop) never take the same ticket, and the assignee shows who's on what.
4. **Prepares branches**: a ticket under an epic branches off the epic's branch (`epic/NN-slug`, created from `main` if needed) after `main` is merged into it. If that merge conflicts, the loop opens a `ready-for-human` "Resolve conflicts" ticket and skips the epic. Other tickets branch off `main`.
5. **Builds and reviews**: one sandbox per ticket runs `implement` (or `debug-and-fix` for bugs), then a `code-review` pass.
6. **Lands the work**:
   - an **epic ticket** merges into the epic branch, which is pushed, and the ticket closes;
   - a **standalone ticket** gets a PR with `Fixes #n`, and the issue moves to `ready-for-review`;
   - a ticket with **no commits** (couldn't be built, or a bug that needs a person) moves to `ready-for-human` with the agent's explanation;
   - an **epic whose milestone has no open tickets left** gets its PR to `main` (`Closes #epic`).

Then it checks again. With nothing ready it sleeps (45 minutes by default); on a usage limit it sleeps an hour and posts once to Slack.

**Install** with `/setup-imick-skills` (Section F) in your project. By hand:

1. `npx @ai-hero/sandcastle init --agent claude-code --sandbox docker --template blank --issue-tracker github-issues --create-label false --build-image false --install-template-deps false`
2. Replace the scaffold's `main.mts`/`main.ts` and `prompt.md` with the files in [`setup-imick-skills/agent-loop/`](skills/engineering/setup-imick-skills/agent-loop/) (the loop, four prompts, a Dockerfile with a headless Chromium, and `.env.example`), all into `.sandcastle/`.
3. `npm i -D @ai-hero/sandcastle zod tsx`, and add the script `"agents": "tsx --env-file-if-exists=.sandcastle/.env .sandcastle/main.mts"`.
4. Commit the skills the loop calls into `.claude/skills/` (`implement`, `tdd`, `code-review`, `debug-and-fix`, `diagnosing-bugs` and what they use): agents see only the repo.
5. Start Docker, then build the image: `npx sandcastle docker build-image`.

**Secrets** go in `.sandcastle/.env` (gitignored): `cp .sandcastle/.env.example .sandcastle/.env`, then fill each from your clipboard so no line break or masking sneaks in:

```bash
# Claude token (from `claude setup-token`, run in a regular terminal)
sed -i '' "s|^CLAUDE_CODE_OAUTH_TOKEN=.*|CLAUDE_CODE_OAUTH_TOKEN=$(pbpaste | tr -d '[:space:]')|" .sandcastle/.env
# A fine-grained GitHub token for this repo only: Issues read/write, Metadata read
sed -i '' "s|^GH_TOKEN=.*|GH_TOKEN=$(pbpaste | tr -d '[:space:]')|" .sandcastle/.env
```

Agents use `GH_TOKEN` inside the sandbox to read and comment on issues. Pushing branches and opening PRs happen on your machine, with your own `gh` login (or the always-on machine's bot account).

**Run**

```bash
npm run agents                    # loop: plans autopilot epics, works everything ready, sleeps when idle
npm run agents -- --once          # one pass, then exit
npm run agents -- --no-planning   # build only: leave planning to another machine
```

**Autopilot planning**, per epic. Every epic from `/scope-decomposer` waits for a **`/brief`**: a short, high-level session where you say what you already have in mind (must-haves, no-gos, the big product calls), saved in the epic's Brief section, the glossary and ADRs. The brief ends with **autopilot or manual?** An epic labelled `autopilot` is planned by the loop: it runs wayfinder on it by itself, takes every Brief line as decided, decides the rest (75% confidence or more directly, below that after researching it with `dig`, still unsure as **assumed**), parks tasks that need you as `ready-for-human`, and writes the spec with a **Decided on autopilot** section (least confident first). The spec waits on `ready-for-human` and Slack pings you: **approve** with the `spec-approved` label and the next pass cuts the tickets; **request changes** with a comment and the next pass revises it. Epics without the label are yours to plan with `/wayfinder <epic>`, and the loop never touches them.

Tune it in `.sandcastle/.env`: `AGENTS_IDLE_MINUTES` (45), `AGENTS_MAX_PARALLEL` (3), `AGENTS_PLANNER_MODEL`, `AGENTS_WORKER_MODEL`, and `SLACK_ALERTS_WEBHOOK_URL` for usage-limit and failure alerts.

**Good to know**

- The epic branch lives in its own worktree (`.sandcastle/worktrees/`), so the loop never switches the branch you're working on.
- Runs count against the Claude plan behind `CLAUDE_CODE_OAUTH_TOKEN`; an idle loop costs nothing (each check is a `gh issue list`).
- Nothing merges to `main` by itself: standalone work and finished epics arrive as PRs for you.
- Each run leaves a log in `.sandcastle/logs/`.

To run it around the clock on a spare Mac (never sleeping, reachable from your phone with Claude's Remote Control), see [docs/mac-setup.md](docs/mac-setup.md).

## Epic PRs

When the agent loop finishes an epic (every ticket in its milestone closed), it opens the epic's PR to `main` and runs [`verify-epic`](skills/engineering/verify-epic/SKILL.md) on it: in the running app (the PR's preview, per `docs/agents/preview.md`, or started locally) it checks that the app loads cleanly, then each ticket's acceptance criteria, the spec's user stories, the API contracts and the agreed screens. Each failure becomes a `bug` + `ready-for-agent-debugging` ticket under the epic, which the loop fixes on the epic branch; the PR gets one report that updates in place, and a `verify-epic` status. New commits are verified again.

The shared [`epics.yml`](.github/workflows/epics.yml) workflow (installed by `/setup-imick-skills`, Section G, from [`epics-caller.yml`](skills/engineering/setup-imick-skills/epics-caller.yml)) adds:

- **`epic-gate`**, a status check to make required on `main`: green for any PR that isn't an epic's; for an epic PR, green only with no open tickets in its milestone, no `mocks/` folder left, and `verify-epic` passed.
- **The closing chain**: merging the epic PR closes the epic ("Closes #n"), which closes its milestone; when an initiative's last epic closes, the initiative closes too, or gets a comment if its "Not yet scoped" section still lists areas.

## Releasing

Versions follow [semver](https://semver.org) and are managed with [Changesets](https://github.com/changesets/changesets); see [CHANGELOG.md](CHANGELOG.md) for what changed in each release.

Projects pin the shared workflows and the triage skill to a **major tag** (`@v1`), so a change here reaches them only once it's released. A test repo can follow `@main` to try changes first.

1. Every change lands through a pull request with a changeset describing it (`npx changeset`): **patch** for fixes, **minor** for new skills or behaviour, **major** for anything that breaks an existing setup.
2. The release workflow collects pending changesets into a **"chore: version skills"** pull request that bumps the version and writes the changelog.
3. Merging it releases: the workflow tags `vX.Y.Z`, publishes a GitHub Release, and moves `v1` to it. Projects on `@v1` pick it up on their next run.

A **major** release (`v2.0.0`) starts a new `v2` tag and leaves `v1` where it was. Move each project when it's ready: change `@v1` to `@v2` in its `.github/workflows/triage.yml`, or re-run `/setup-imick-skills`.

## License

MIT
