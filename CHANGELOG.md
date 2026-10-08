# imick-skills

## 1.4.0

### Minor Changes

- [#14](https://github.com/imick-io/skills/pull/14) [`8015b85`](https://github.com/imick-io/skills/commit/8015b859f2899ef116160df4e071ba63111037d2) Thanks [@imick-io](https://github.com/imick-io)! - **Briefs, and autopilot per epic.** New **`brief`** skill: a short, high-level grill-with-docs session on one epic (must-haves, no-gos, the big product calls), saved as the epic's **Brief** section plus glossary and ADRs; it suggests a new epic when a must-have doesn't fit, and ends by choosing **manual or autopilot**. `/brief` alone takes the next epic labelled `needs-briefing`.
  
  - `scope-decomposer` creates epics with `needs-briefing` + `ready-for-human`, and hands off to `/brief`.
  - `wayfinder` starts from the Brief in both modes (its lines are settled decisions). The epic's **`autopilot` label** is now the switch for autopilot; `/wayfinder <epic> autopilot` adds it.
  - **Agent loop**: plans every epic labelled `autopilot` (and briefed) on any pass, so the **`--autopilot` flag is gone**; `--no-planning` makes a loop build only. Projects using the loop: re-copy `.sandcastle/main.mts` from `setup-imick-skills/agent-loop/`, and label the epics you want planned `autopilot`.

## 1.3.0

### Minor Changes

- [#12](https://github.com/imick-io/skills/pull/12) [`b322d11`](https://github.com/imick-io/skills/commit/b322d113fc205154476efa1bbcdb2b63a1ab5ee3) Thanks [@imick-io](https://github.com/imick-io)! - **Wayfinder autopilot.** `/wayfinder <epic> autopilot` (or `Mode: autopilot` in a map's Notes, with an optional threshold, 75 by default) resolves the map without asking: each decision in its own subagent, decided when at or above the threshold, researched with `dig` when below, and decided as **assumed** if still unsure. Prototypes are judged by the agent; tasks that need a person are parked. The spec it writes lists every decision least confident first, waits on `ready-for-human`, and is approved with the new **`spec-approved`** label; review comments make it revise. The agent loop's new **`--autopilot`** flag does this unattended: it charts untouched epics, resolves autopilot maps, pings Slack when a spec is ready, and cuts tickets once you approve.
  
  **Fix**: skills marked manual-only (`implement`, `debug-and-fix`, `verify-epic`, `to-spec`, `to-tickets`, `wayfinder`, `dig`) can't be called through the Skill tool, so the agent loop's prompts and `product-design` now read and follow those skills' files instead. UI specs from `product-design` are labelled `spec`, so they're never built directly.

## 1.2.0

### Minor Changes

- [#7](https://github.com/imick-io/skills/pull/7) [`fdc8e23`](https://github.com/imick-io/skills/commit/fdc8e237d9d0b841206bb4fd82fcd6d4144377f9) Thanks [@imick-io](https://github.com/imick-io)! - **Agent loop**: `setup-imick-skills` gains Section F, which installs a Sandcastle loop (`npm run agents`, or `-- --once`) that works the repo's `ready-for-agent` and `ready-for-agent-debugging` tickets in Docker sandboxes. It plans which tickets can run in parallel, claims each (assignee = claimed, safe with two machines running), merges `main` into the epic branch first (a conflict opens a `ready-for-human` ticket and pauses that epic), runs `implement` or `debug-and-fix` then a `code-review` pass, lands epic tickets on the epic branch (standalone ones as PRs), opens the epic's PR to `main` once its milestone has no open tickets, skips specs, sleeps when idle and backs off on usage limits. The template (main loop, prompts, a browser-enabled Dockerfile) lives in `setup-imick-skills/agent-loop/`.

- [#10](https://github.com/imick-io/skills/pull/10) [`bdec962`](https://github.com/imick-io/skills/commit/bdec962fe55483c10ae9483094e761dc1b28397b) Thanks [@imick-io](https://github.com/imick-io)! - **Epic PRs, end to end.** New **`verify-epic`** skill: tests an epic's PR in the running app (preview from GitHub deployments, a URL pattern such as Coolify's, or a local start) against each ticket's acceptance criteria, the spec's stories, the API contracts and the agreed screens; files each failure as a `bug` + `ready-for-agent-debugging` ticket under the epic and doubtful results as one `ready-for-human` ticket; keeps one report on the PR and sets a `verify-epic` status. The agent loop now opens an epic's PR when its milestone is empty and verifies each new commit once.
  
  New shared **`epics.yml`** workflow: the **`epic-gate`** check (no open tickets, no `mocks/`, `verify-epic` passed; non-epic PRs pass) and the **closing chain** (epic closed → milestone closed → initiative closed, or a nudge when parked areas remain). `setup-imick-skills` Section G installs it and `docs/agents/preview.md`. Projects with the loop: give `GH_TOKEN` the Commit statuses (read/write), Deployments (read) and Pull requests (read) permissions.

## 1.1.0

### Minor Changes

- [#6](https://github.com/imick-io/skills/pull/6) [`c4db274`](https://github.com/imick-io/skills/commit/c4db2746b53349229e2d4237a41c13740ccdeb79) Thanks [@imick-io](https://github.com/imick-io)! - New **`debug-and-fix`** skill: works one bug from the `ready-for-agent-debugging` queue end to end. It claims the bug, branches (`fix/<n>-<slug>`, or the epic's branch for bugs under an epic), runs `diagnosing-bugs` (browser reproduction for UI bugs), and fixes it with a regression test when the diagnosis is clean: a PR with `Fixes #n`, or a commit on the epic branch. Otherwise it leaves a full diagnosis for a person. The issue ends labelled by outcome: `bug` + `ready-for-review` (fixed), `bug` + `ready-for-human` (diagnosed), `needs-info` (can't reproduce) or `wontfix`.
  
  Adds the **`ready-for-review`** label ("a fix PR waits for review") to the triage vocabulary and `triage-labels.md`. Projects already set up: create it with `gh label create ready-for-review`.

- [#5](https://github.com/imick-io/skills/pull/5) [`75b5a09`](https://github.com/imick-io/skills/commit/75b5a098a6fdfc265ad38abcf9e8b97c555317d1) Thanks [@imick-io](https://github.com/imick-io)! - `diagnosing-bugs` reproduces UI bugs in a real browser before scripting them. A new `BROWSER.md` covers picking a browser (Claude in Chrome first, then `agent-browser`, then the Playwright MCP), running the app or opening the preview URL with test accounts only, following the reporter's steps while watching screenshots, console and network, capturing the evidence, and freezing the steps into a Playwright script that becomes the Phase 1 feedback loop.

- [#3](https://github.com/imick-io/skills/pull/3) [`afb4b6e`](https://github.com/imick-io/skills/commit/afb4b6eb866d615330815b52adc3a14a07184a73) Thanks [@imick-io](https://github.com/imick-io)! - Sync Matt Pocock's skills up to his 1.3.1 (and later unreleased fixes).
  
  - **`implement-spec`**, **`pr`** and **`retro`** graduate from `in-progress` to `engineering`, so they ship in the plugin. `ask-imick` routes them: `/implement-spec` builds a whole spec in one run on an integration branch, `/pr` shapes PR bodies, `/retro` closes the main flow.
  - **`resolving-merge-conflicts` is removed**, as upstream: the agent works through conflicts without a dedicated skill.
  - **`CONTEXT.md` is now `GLOSSARY.md`** (and `CONTEXT-MAP.md` is `GLOSSARY-MAP.md`) in every skill that reads or writes it, including `product-design` and `setup-imick-skills`. In a project set up before this, run `git mv CONTEXT.md GLOSSARY.md` (and the same for `CONTEXT-MAP.md`).
  - `diagnosing-bugs` no longer hands off to `improve-codebase-architecture` from its post-mortem; cross-skill calls use the more reliable "Call the Skill tool" wording.
  - `update-from-upstream`: detaching a skill now declines its upstream original, so it never comes back as a "new" skill.

## 1.0.0

### Major Changes

- First versioned release. iMick's own skills (`scope-decomposer`, `product-design`, `dig`, `plan-work`, `do-work`, `review-work`, `update-from-upstream`, and a rewritten `triage` with an unattended mode), Matt Pocock's skills (customized where noted in `sources.json`), and Cursor's `thermo-nuclear-code-quality-review`. Ships the shared automatic-triage and token-check workflows, pinned by projects as `@v1`.
- `update-from-upstream` shows each source's changelog entries since the last sync (for sources with a `changelog_path`), and quotes them alongside every question about a new, moved or deleted skill.
