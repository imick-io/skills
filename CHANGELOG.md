# imick-skills

## 1.6.0

### Minor Changes

- [#28](https://github.com/imick-io/skills/pull/28) [`95ad776`](https://github.com/imick-io/skills/commit/95ad776a01daef1ae2fecdd8ab4f75f8d4885243) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop: stop it nicely, and Ctrl-C no longer breaks the next run.
  
  - `npm run agents:stop` (new script, see `setup-imick-skills` section F) asks a running loop to start nothing new, let its in-flight tickets land, then exit and post to Slack, so you can close the machine once the message arrives. Starting the loop clears a leftover stop request.
  - Ctrl-C still quits at once, but the loop first releases the tickets it had claimed and the `agent:planning` / `agent:unblocking` labels it had set, so the next start picks the work back up instead of skipping it as "someone's on it".
  - The loop now runs on Node's own type stripping instead of `tsx`: tsx ran it in a child process and hard-killed that child on Ctrl-C whenever the loop was inside a `gh` or `git` call, which is why claims kept being left behind. Existing setups: change the `agents` script to `node --env-file-if-exists=.sandcastle/.env .sandcastle/main.mts`, add `agents:stop`, add `STOP` to `.sandcastle/.gitignore`, and copy the new `main.mts`.
  - Tracker: a finished epic (every ticket closed, nothing left to plan) now shows as "Built and verified; merge its PR" instead of "Building", and appears in your action items with a link to its PR.

- [#30](https://github.com/imick-io/skills/pull/30) [`d020054`](https://github.com/imick-io/skills/commit/d020054c8dff38c51fe8d0535d95e9ac548af38b) Thanks [@imick-io](https://github.com/imick-io)! - Triage can now run inside the agent loop instead of GitHub Actions. `/setup-imick-skills` asks where automatic triage runs: **GitHub Actions** (reacts within a minute, around the clock, with the triage agent limited to `gh issue` commands, but uses Actions minutes) or **the agent loop** (no Actions minutes or billing, but issues are only triaged while the loop runs, up to its idle wait later, with the sandbox's full permissions, so keep it to repos where only trusted people file issues).
  
  With `AGENTS_TRIAGE=1` in `.sandcastle/.env`, each pass starts by triaging, before it builds:
  
  - new issues with no triage label, filed by the repo's own people,
  - `needs-info` issues whose newest comment is a reply from the reporter or a collaborator, or that were edited after the last triage note,
  - anything on `needs-triage`: a triage that didn't finish, or one you ask for by adding the label.
  
  It skips what the workflow skips: epics, initiatives, specs, wayfinder issues, backlog, and tickets under an epic. It needs no state between passes, so it also catches what was filed or answered while the loop was off. With `SLACK_FEED_WEBHOOK_URL` set, every decision goes to the feed channel, like the workflow's. A triage that ends without a decision and a comment is alerted once and left alone until the loop restarts.
  
  In a project already running the loop: copy `agent-loop/main.mts` over `.sandcastle/main.mts` (keeping local changes) and `agent-loop/triage-prompt.md` into `.sandcastle/`, make sure the `triage` skill is committed in the repo, add `AGENTS_TRIAGE=1` to `.sandcastle/.env`, and strip `.github/workflows/triage.yml` down to its `workflow_dispatch` trigger so the two never triage the same issue. Restart the loop.

- [#26](https://github.com/imick-io/skills/pull/26) [`e1f1c65`](https://github.com/imick-io/skills/commit/e1f1c6506ef285f9c4c914de41a3e91dc2b06db5) Thanks [@imick-io](https://github.com/imick-io)! - New `whats-next` skill: ask "what's next?" (or `/whats-next`) in a project using these skills, and it reads where the project stands and names your next one to three moves, each with its command or link. It checks setup, whether your skills and `.sandcastle/` files are behind upstream, the agent loop (config by key name only, mode, Docker, whether it's running, its last log), uncommitted or unpushed work the loop's agents can't see, and what waits on you on GitHub: `agent:asked` questions, specs to approve, `ready-for-human` items ordered by what they block, epics to brief, reviews and open PRs. It only reads, and offers to do the first move when an agent can.
  
  To add it to a project: `npx skills@latest add imick-io/skills --skill whats-next`.

### Patch Changes

- [#29](https://github.com/imick-io/skills/pull/29) [`9568b53`](https://github.com/imick-io/skills/commit/9568b53b22c13a3a5436396188d12029c5ab3635) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop fix: finished work interrupted before it landed is now reviewed and landed on the next pass, instead of being handed to a person. If the loop stopped or restarted between a ticket's build and its landing, the rerun found the work already committed, made no new commits, and the loop moved the ticket to `ready-for-human` with no comment. The loop now checks for commits on the ticket's branch that its base doesn't have yet, not just the latest run's commits.
  
  In a project already running the loop, port the change to `.sandcastle/main.mts`, or copy `agent-loop/main.mts` over it while keeping any local changes, and restart the loop.

## 1.5.0

### Minor Changes

- [#23](https://github.com/imick-io/skills/pull/23) [`0cb71b9`](https://github.com/imick-io/skills/commit/0cb71b980748d1b05b149aad06d77dc94abcd733) Thanks [@imick-io](https://github.com/imick-io)! - A `backlog` label parks an issue for later. It keeps its **what** role and drops its **who** role, so it's in nobody's inbox:
  - the agent loop never builds a backlog ticket and never plans a backlog epic, and a backlog issue under an epic doesn't hold the epic's PR back;
  - triage skips it, both the workflow and `/triage` ("backlog [#42](https://github.com/imick-io/skills/issues/42)" parks one);
  - the tracker gives the backlog its own tab (initiatives, epics and issues, with what each is, its area and its epic), shows backlog tickets in their own lane on the epic board, and keeps them out of action items.
  
  In a project already running the loop: add the `backlog` row to `docs/agents/triage-labels.md`, create the label (`gh label create backlog --force`), and copy `agent-loop/main.mts` over `.sandcastle/main.mts` (keeping local changes) and `tracker/build.mjs` over `tracker/build.mjs`.

- [#23](https://github.com/imick-io/skills/pull/23) [`0cb71b9`](https://github.com/imick-io/skills/commit/0cb71b980748d1b05b149aad06d77dc94abcd733) Thanks [@imick-io](https://github.com/imick-io)! - Local-first v1: build the product before the infrastructure, so the agent loop stops stalling on accounts and secrets only you can set up.
  
  - `/scope-decomposer` now asks, for a new product, whether v1 is **local first**, recommending yes. Every product epic then runs on your machine with local stand-ins: SQLite or Docker Postgres, local storage, a dev login, console email, test-mode payments. Cloud accounts, domains, secrets and deploys go into one **Go live** epic, last and blocking nothing, or stay in Not yet scoped until you decide to go live. The exception is a product whose core is an integration (e.g. Stripe Connect): it gets one narrow human task for that service, not an infrastructure epic up front.
  - `/brief` records local first as an already-decided line in the epic's brief.
  - Wayfinder on autopilot, on a local-first epic, uses a local stand-in instead of parking a human task, and notes the real service for Go live.
  
  Existing initiatives keep their current order. To move one to local first, re-run `/scope-decomposer <initiative>`: it can only change epics that have no map yet.

- [#23](https://github.com/imick-io/skills/pull/23) [`0cb71b9`](https://github.com/imick-io/skills/commit/0cb71b980748d1b05b149aad06d77dc94abcd733) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop: **fast mode**, for projects where speed beats review (personal projects, MVPs). Turn it on for a whole project with `AGENTS_MODE=fast` in `.sandcastle/.env`, or for one epic with the `fast` label. The loop then stops waiting on you wherever it can:
  
  - **Issues waiting on you** (`ready-for-human`): an agent answers it when it's at least 70% confident (`AGENTS_FAST_THRESHOLD`), writes the decision into the issue and sends it back to the agents, or closes it for a wayfinder task. When the issue needs an action only you can take, it uses a local stand-in if one serves. Otherwise it asks you one precise question on the issue, labels it `agent:asked` and pings you in Slack. Your comment on the issue is the answer, applied on the next pass. It always asks before spending money, handling real credentials or personal data, deleting or publishing, and after it has guessed twice on the same issue.
  - **Autopilot specs**: approved by the loop when every decision is at or above the threshold. Otherwise you're asked only about the ones below it.
  - **Conflicts between `main` and an epic branch**: an agent resolves the merge. It keeps what both sides meant, runs the typecheck and tests, and the loop lands a clean merge commit on the epic branch. When a conflict needs a product decision, the agent explains it on the conflict ticket and you're pinged.
  - **Epic PRs**: merged to main once `verify-epic` passes, which frees the epics it blocks. A merge GitHub refuses is pinged to you.
  
  Fast mode never touches the backlog: a `backlog` issue is never answered, and nothing under a `backlog` epic is answered, approved, resolved or merged.
  
  Set `SLACK_USER_ID` (your Slack member ID) so these pings mention you.
  
  In a project already running the loop, copy `agent-loop/main.mts` over `.sandcastle/main.mts` (keeping local changes such as pnpm commands), add the new `agent-loop/unblock-prompt.md` and `agent-loop/conflicts-prompt.md` to `.sandcastle/`, make sure the repo has the `dig` and `wayfinder` skills, and restart the loop.

- [#24](https://github.com/imick-io/skills/pull/24) [`7fe5b8d`](https://github.com/imick-io/skills/commit/7fe5b8dc9de0a3c10e818a26e3ad26e9617c471f) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop: **supersonic mode**, for throwaway MVPs where waiting costs more than a wrong guess. Turn it on with `AGENTS_MODE=supersonic` in `.sandcastle/.env`, or the `supersonic` label on one epic. It does everything fast mode does, and:
  
  - **One interview.** `/scope-decomposer` drafts every epic's brief during its interview, asks only what the drafts are missing, and publishes the epics on autopilot. No `/brief` sessions follow, and the loop starts planning straight away.
  - **Assumes instead of asking.** Below the threshold, a call that can be undone (a product or UI call, a default, copy) is assumed: the loop goes on with its best guess, labels the issue `agent:assumed`, and leaves the question on the issue. Specs are always approved, with their low-confidence decisions standing as assumed.
  - **A daily digest** in Slack lists what was assumed (`AGENTS_DIGEST_HOURS`, 24 by default) instead of a ping per question. Comment on an assumed issue to change the call: the loop edits what isn't built yet, or files a follow-up ticket for what is.
  - **Still waits for you** before spending money, handling real credentials or personal data, deleting or publishing, and never touches `backlog`.
  
  The confidence threshold is now `AGENTS_THRESHOLD` (70 by default) for both modes; `AGENTS_FAST_THRESHOLD` still works. When it's set, wayfinder's autopilot uses it too, instead of its own 75.
  
  In a project already running the loop: copy `agent-loop/main.mts` over `.sandcastle/main.mts` (keeping local changes), add the new `agent-loop/followup-prompt.md` and the updated `unblock-prompt.md` to `.sandcastle/`, add `.sandcastle/digest.json` to `.gitignore`, and restart the loop.

- [#17](https://github.com/imick-io/skills/pull/17) [`4e1be3e`](https://github.com/imick-io/skills/commit/4e1be3e951374f1edc93972202dc674f3ec11264) Thanks [@imick-io](https://github.com/imick-io)! - New `tracker` skill: `/tracker` builds and opens an issue tracker page for the current GitHub repo, with what waits on you next (and how much each item holds up), specs to approve, the epics' roadmap, and each epic's board and blocking diagram. The agent loop now rebuilds it before and after every pass when `tracker/build.mjs` exists, and `/setup-imick-skills` offers it as a yes/no step (Section H). In a project already running the loop, copy the new `syncTracker` hook from `agent-loop/main.mts` into `.sandcastle/main.mts`, then run `/tracker` once to install the page.

### Patch Changes

- [#21](https://github.com/imick-io/skills/pull/21) [`3e644e7`](https://github.com/imick-io/skills/commit/3e644e70eee85952b0dea3ae8950cb91895eb7af) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop: a second script, `agents:awake` (`caffeinate -i npm run agents`), runs the loop without letting a Mac idle-sleep. A laptop that sleeps pauses the loop, and an agent run cut off mid-way can fail and leave its epic labelled `agent:planning`.
  
  In a project already running the loop, add `"agents:awake": "caffeinate -i npm run agents"` to `package.json` (with its package manager in place of `npm run`).

- [#20](https://github.com/imick-io/skills/pull/20) [`381bbb8`](https://github.com/imick-io/skills/commit/381bbb853eccaf80f01821b8f47626d766d1fa11) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop fixes:
  - A run that died no longer blocks the next one: the loop removes a leftover sandbox worktree before resetting a planning or verify branch, instead of failing with "cannot force update the branch … used by worktree".
  - An epic that hasn't been planned yet is no longer taken for finished: its milestone must hold at least one issue, all closed, before the loop opens the epic's PR. Before, an empty milestone passed, the loop tried to open a PR with no commits, and the failure aborted the whole pass.
  
  In a project already running the loop, copy `agent-loop/main.mts` over `.sandcastle/main.mts`, keeping any local changes (such as pnpm commands), and restart the loop.

- [#19](https://github.com/imick-io/skills/pull/19) [`7d44fb8`](https://github.com/imick-io/skills/commit/7d44fb804e5fee069eadbef49f10401e2b5c17a5) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop fixes:
  - A ticket now waits while its epic is still blocked by other epics, instead of being built on missing foundations.
  - The loop recognises its agents' comments even when they word the AI disclaimer their own way, so it no longer takes its own comment on a spec for your reply. The autopilot prompt also gives agents the exact disclaimer to use.
  - A spec waiting for your approval is announced once per version, not on every pass.
  
  In a project already running the loop, copy `agent-loop/main.mts` and `agent-loop/autopilot-prompt.md` over `.sandcastle/`.

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
