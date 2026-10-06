# Skills

My agent skills, straight from my `.claude/skills` directory.

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
| [`code-review`](skills/engineering/code-review/SKILL.md) | Matt Pocock | Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). |
| [`codebase-design`](skills/engineering/codebase-design/SKILL.md) | Matt Pocock | Shared vocabulary for designing deep modules. |
| [`diagnosing-bugs`](skills/engineering/diagnosing-bugs/SKILL.md) | Matt Pocock | Diagnosis loop for hard bugs and performance regressions. |
| [`do-work`](skills/engineering/do-work/SKILL.md) | iMick | Implements the approved plan from the same Claude Code session, executing per the plan's declared Approach (RGR or direct). |
| [`domain-modeling`](skills/engineering/domain-modeling/SKILL.md) | Matt Pocock | Build and sharpen a project's domain model. |
| [`grill-with-docs`](skills/engineering/grill-with-docs/SKILL.md) | Matt Pocock | A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. |
| [`implement`](skills/engineering/implement/SKILL.md) | Matt Pocock | Implement a piece of work based on a spec or set of tickets. |
| [`improve-codebase-architecture`](skills/engineering/improve-codebase-architecture/SKILL.md) | Matt Pocock | Scan a codebase for deepening opportunities, present them as a visual HTML report, then grill through whichever one you pick. |
| [`plan-work`](skills/engineering/plan-work/SKILL.md) | iMick | Read-only planning for an issue on the project issue tracker. |
| [`product-design`](skills/engineering/product-design/SKILL.md) | iMick | Build an epic's real UI with the user, from a fast mockup on mock data to production tickets, so human and agent share one vision of the product. |
| [`prototype`](skills/engineering/prototype/SKILL.md) | Matt Pocock | Build a throwaway prototype to answer a design question. |
| [`research`](skills/engineering/research/SKILL.md) | Matt Pocock | Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. |
| [`resolving-merge-conflicts`](skills/engineering/resolving-merge-conflicts/SKILL.md) | Matt Pocock | Use when you need to resolve an in-progress git merge/rebase conflict. |
| [`review-work`](skills/engineering/review-work/SKILL.md) | iMick | Refactor-only review pass over a recent commit. |
| [`scope-decomposer`](skills/engineering/scope-decomposer/SKILL.md) | iMick | Break a big idea, product, feature, existing project or broad issue into an initiative of epics on the issue tracker, each one ready for /wayfinder. |
| [`setup-imick-skills`](skills/engineering/setup-imick-skills/SKILL.md) | Matt Pocock | Configure this repo for the engineering skills: set up its issue tracker, triage label vocabulary, and domain doc layout. |
| [`tdd`](skills/engineering/tdd/SKILL.md) | Matt Pocock | Test-driven development. |
| [`thermo-nuclear-code-quality-review`](skills/engineering/thermo-nuclear-code-quality-review/SKILL.md) | Cursor | Run an extremely strict maintainability review for abstraction quality, giant files, and spaghetti-condition growth. |
| [`to-spec`](skills/engineering/to-spec/SKILL.md) | Matt Pocock | Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed. |
| [`to-tickets`](skills/engineering/to-tickets/SKILL.md) | Matt Pocock | Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker). |
| [`triage`](skills/engineering/triage/SKILL.md) | iMick | Classify incoming issues (and optionally external PRs) by what they are and who acts next, write agent-ready briefs, and route big asks to scoping. |
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
| [`implement-spec`](skills/in-progress/implement-spec/SKILL.md) | Matt Pocock | Implement a specification in code. |
| [`loop-me`](skills/in-progress/loop-me/SKILL.md) | Matt Pocock | Grill me about specs for the workflows I want to build, within this workspace. |
| [`pr`](skills/in-progress/pr/SKILL.md) | Matt Pocock | Use when writing a PR body. |
| [`retro`](skills/in-progress/retro/SKILL.md) | Matt Pocock | Conduct a retrospective on a coding session. |
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

## License

MIT
