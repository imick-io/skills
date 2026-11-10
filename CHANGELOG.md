# imick-skills

## 1.20.0

### Minor Changes

- [#86](https://github.com/imick-io/skills/pull/86) [`6018bd5`](https://github.com/imick-io/skills/commit/6018bd5447a5e5830b869a70cdeb9f0bd5dc6c36) Thanks [@imick-io](https://github.com/imick-io)! - **Slow test suites run through tickets, not on every PR.** A repo's `test-suites/` folder holds one file per slow or special suite (a 30-minute backtest, an Android e2e that needs an emulator): its command, the paths it covers, how long it takes, and who can run it (`sandbox`, a GitHub `workflow`, or a `human`). `/to-tickets` adds a **Run \<suite\>** ticket to an epic whose slices touch what a suite covers, blocked by every other ticket so it runs last; the agent loop adds any the epic's real diff calls for before it opens the PR. The loop runs the ticket (or starts the workflow and waits): green closes it with the commit tested, red files bugs it then waits on. The epic's PR opens only once its suites passed. The tracker gains a **Test suites** tab: each suite, its last green run, and whether it's **stale** (commits to `main` touched what it covers since), with the command to file a run against `main`; a stale suite is also an action item. New label `suite-run`; `/setup-imick-skills` gets a Section I for it.
  
  **CI that skips what didn't change.** `setup-imick-skills/ci-change-gates.md` documents the shape for a Turbo monorepo: a `changes` job (`turbo --affected` plus `dorny/paths-filter`), the expensive steps (services, e2e, browsers) gated on its outputs, and one always-running `ci-ok` job as the single required check, with the pitfalls (a shallow checkout or missing `TURBO_SCM_BASE` silently runs everything; a workflow-level `paths:` filter leaves a required check pending forever; a Turbo graph missing a cross-package link skips tests that should run). `/update-imick-skills` reports three new CI issues with fixes: `no-change-gate`, `paths-on-required` and `no-aggregator`, and copies `test-suites/README.md` into projects on the loop or the epic workflow.
  
  **Epics have a version, and the roadmap shows one at a time.** Every epic carries a `version:<v>` label (`version:v1`, `version:v1.1`, `version:v2`…), set by `/scope-decomposer` from the initiative's version and moved by hand when an epic slips. The tracker's roadmap gets a version picker (remembered per viewer, defaulting to the lowest version with open epics), with **Backlog** (parked epics and tickets) and **No version** as entries of their own; the standalone bugs and small changes move from the bottom of the first column to a strip above the roadmap. Arrows now always run left to right one column at a time: a link that skips columns runs under the cards with a dot where it passes each column, instead of piling into the lane above. A blocker from another version is a dashed stub in a first column, amber when that version is later, and the Progress table groups epics by version. An open epic without a version, or one waiting on a later version's epic, is flagged in a banner and as an action item until fixed.
  
  Existing setups: `/update-imick-skills` asks which version the work so far is and labels every unlabelled epic with it (by hand: `gh label create version:v1 --color 0e8a16` and `gh issue edit <n> --add-label version:v1` per epic). For the rest, `/update-imick-skills` does it (new `main.mts`, `suite-prompt.md` and `plan-prompt.md` in `.sandcastle/`, `tracker/build.mjs`, the `suite-run` label and row, `test-suites/README.md`), then restart the loop. By hand: copy those files, add the `suite-run` row to `docs/agents/triage-labels.md` and `gh label create suite-run --color 0052CC`. For a suite run via a workflow, give the loop's `GH_TOKEN` **Actions: read and write**; for the hosted tracker's new tab, give its `GITHUB_TOKEN` **Contents: read**. Then write one `test-suites/<name>.md` per slow suite (the README says how) and, if that suite ran on every PR until now, drop its `pull_request` trigger.

## 1.19.1

### Patch Changes

- [#84](https://github.com/imick-io/skills/pull/84) [`d1b1486`](https://github.com/imick-io/skills/commit/d1b14868beda9294e6d681198864f4536cddf743) Thanks [@imick-io](https://github.com/imick-io)! - A ticket the agent found blocked (no commits) no longer stays stuck on a stale branch. The loop kept the ticket's branch between retries to preserve progress, so when the block was fixed on the epic branch meanwhile (another epic merged in, a dependency landed), each retry still read the old code and blocked again. A branch with no commits of its own is now reset to the epic tip; one with commits keeps them.

## 1.19.0

### Minor Changes

- [#81](https://github.com/imick-io/skills/pull/81) [`2e344fe`](https://github.com/imick-io/skills/commit/2e344fe4b59cb5bae07dd56887b378abd90fad0a) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop tickets finish much faster: the implement, review, bug and conflict agents now run the typecheck and only the tests their change can reach (`vitest related` with Vitest), in the foreground with a time limit, instead of the whole suite. The full suite still runs in CI on the epic's PR. Running every package's tests in several sandboxes at once overloaded the machine. Tests timed out on load, agents re-ran them, and then polled background runs for hours. The planner is also stricter about running tickets side by side: it holds a ticket back when it would edit the same files as one building, beyond a registration line or a list entry, because a conflict rebuilds the later ticket from scratch. Projects that changed the test line in `.sandcastle/implement-prompt.md` should merge the new rules into their own wording by hand.

- [#82](https://github.com/imick-io/skills/pull/82) [`fe67161`](https://github.com/imick-io/skills/commit/fe67161a95b0ac9e0b8193fb9855910089409f6d) Thanks [@imick-io](https://github.com/imick-io)! - When a built and reviewed ticket conflicts with its epic branch (other tickets landed meanwhile), the agent loop no longer throws the work away and rebuilds the ticket from scratch. It merges the epic branch into the ticket's branch, hands the conflict markers to an agent (`ticket-conflicts-prompt.md`, new) and lands the resolved result as one clean merge commit. Rebuilding stays the fallback when the agent can't resolve it or needs a product decision. Projects update by copying `main.mts` and the new prompt into `.sandcastle/`; the loop picks them up on restart.

## 1.18.1

### Patch Changes

- [#79](https://github.com/imick-io/skills/pull/79) [`ed4d9a2`](https://github.com/imick-io/skills/commit/ed4d9a2bd69328f0d1f12435638975c492a2df4b) Thanks [@imick-io](https://github.com/imick-io)! - The agent loop no longer gets stuck when an epic branch is pushed to from outside the loop while the loop still holds landed tickets it hasn't pushed. Each pass used to fail with `Not possible to fast-forward` and retry every 5 minutes. Now the loop merges the remote epic branch into its own, pushes, and carries on. If that merge conflicts, it stops with a message saying which worktree to merge in by hand.

## 1.18.0

### Minor Changes

- Run one agent loop per area, on as many machines as you like, without them colliding.
  
  - **`--area=mobile,crm`** scopes the loop to the epics labelled `area:mobile` or `area:crm` (an `area:mobile:<part>` counts as `mobile`) and to the tickets outside epics with those labels; `--area=none` takes what has no area label. It runs on like an unscoped loop instead of stopping, and doesn't triage. Give each machine its own areas, say `npm run agents:awake -- --area=mobile` on one and `--area=crm,api,none` on another, and the loops never share an epic branch, a planning run, a PR or a ticket. Don't run an unscoped loop beside them, since it takes everything. `--dry-run` shows the scope and warns when no open epic carries an area you named, and `/why-sleeping` says which areas the running loop has.
  - **The tracker shows each epic's area** as a pill on the roadmap and the epic board.
  
  Run `/update-imick-skills` in a project to get the new `.sandcastle/main.mts` and `tracker/build.mjs`. Areas come from the `area:*` labels your epics already carry (see `docs/agents/team.md`).

## 1.17.0

### Minor Changes

- [#76](https://github.com/imick-io/skills/pull/76) [`d066ca1`](https://github.com/imick-io/skills/commit/d066ca19ad00ecc98282a51fcb3ad47504d7854a) Thanks [@imick-io](https://github.com/imick-io)! - Point the agent loop at specific epics or tickets, and build a single ticket in a session.
  
  - **Scoped loop runs: `--epic=12,14` and `--tickets=31,32`.** The loop then works only on what you name: an epic brings everything under it (its planning, tickets, conflicts with `main`, its PR and the `verify-epic` check), a ticket is built and nothing more. No triage, no other epic or ticket. It still follows the usual rules (a `manual` epic, or a blocked, assigned or unlabelled ticket isn't taken) and says at start which named items it won't work and why. It exits once nothing in scope is left: every ticket landed, in a PR or handed to a person, every epic closed. The flags combine with each other and with `--once` and `--dry-run`, and `/why-sleeping` says when the running loop is scoped. With pnpm: `pnpm agents:awake --epic=12`. With npm: `npm run agents:awake -- --epic=12`.
  - **New skill: `/run-ticket <n>`.** `/run-epic` for one ticket, with no Docker or Sandcastle: it claims the ticket, branches, builds and reviews it with the loop's own prompts in subagents, and lands it the way the loop would. A ticket under an epic merges onto the epic branch and closes, and the epic's PR goes up when it was the last open ticket. Any other ticket (a bug, a small enhancement) arrives as a PR to `main` with `Fixes #n`, labelled `ready-for-review`. Install it with `npx skills@latest add imick-io/skills --skill run-ticket`.
  
  Run `/update-imick-skills` in a project to get the new `.sandcastle/main.mts`. **npm projects:** change the `agents:awake` script to `"caffeinate -i npm run agents --"`, so npm passes the flags through to the loop. pnpm and yarn projects need no change.

## 1.16.0

### Minor Changes

- [#74](https://github.com/imick-io/skills/pull/74) [`26e4107`](https://github.com/imick-io/skills/commit/26e4107283e24688b6b05d30aa144e7a9b94916b) Thanks [@imick-io](https://github.com/imick-io)! - The tracker's roadmap is easier to read at a glance.
  
  - **Done epics are green.** They stay folded to one line, now with a green edge and tint and "✓ Done · N tickets" in green, instead of grey.
  - **New colours:** blue is an agent on it (a ticket being built or fixed, an epic being built), and purple is an agent next (a ticket queued, an epic being planned). Green now means done everywhere: done epics, struck-through done tickets, progress bars, approved specs. Red still means you, amber not sorted, grey waiting.
  - **Tickets in no epic are grouped by kind** instead of in one "Outside epics" card: Bugs, Small changes, To scope, Waiting on the reporter, Not doing, Not sorted, and Backlog last. Each group is its own card at the bottom of the first column, showing only when it has tickets, and is outlined in red when one of its tickets needs you.
  - **Two legends:** one for epics (needs you, building, planning, waiting, done) and one for tickets (you, agent on it, agent next, not sorted, waiting, done, backlog), each saying what the colour asks of you.
  
  Run `/update-imick-skills` in a project to get the new `tracker/build.mjs`.

## 1.15.0

### Minor Changes

- [#72](https://github.com/imick-io/skills/pull/72) [`324309f`](https://github.com/imick-io/skills/commit/324309f26ca9759b0e1c07e1aeca4bcd1d5b24cc) Thanks [@imick-io](https://github.com/imick-io)! - The tracker's roadmap shows every ticket, and its links are easier to follow. It's now the page the tracker opens on.
  
  - **Outside epics:** a card at the bottom of the roadmap's first column lists the tickets in no epic. Those are standalone bugs and small changes from triage, including the children of a split email, each shipped as its own PR to `main`. They used to show nowhere until their PR waited for your review. They now appear with the same chips: blue while queued, green while an agent fixes them, red with "YOU" when it's your turn. Tickets closed in the last two weeks stay listed, and the backlog comes last. The Epic board's menu has the same "Outside epics" entry, with its lanes and blocking graph.
  - **Clearer links between epics:**
    - An arrow is solid while the epic still holds the next one back, and dashed once it's done.
    - Lines are drawn above the cards, with a dot at the start and an arrow at the end. A link that skips a column runs along a lane above the cards instead of across them.
    - Hover an epic to see only its links, in blue, with the other epics dimmed.
    - Each card says it in words: "after [#7](https://github.com/imick-io/skills/issues/7)" and "then [#11](https://github.com/imick-io/skills/issues/11)".
  - **Order:** backlog tickets come last everywhere on the roadmap.
  - **Roadmap first:** it's the first tab and opens by default, unless you last left the tracker on another tab.
  
  Run `/update-imick-skills` in a project to get the new `tracker/build.mjs`.

## 1.14.0

### Minor Changes

- [#70](https://github.com/imick-io/skills/pull/70) [`cf928aa`](https://github.com/imick-io/skills/commit/cf928aad20002299fb9f53d5d65680650cef3a3b) Thanks [@imick-io](https://github.com/imick-io)! - Triage now splits an issue that bundles several asks into one issue per ask. You can paste a client's long email into an issue as is, without reading it.
  
  - **What it does:** when an issue asks for several separate things (three bugs, a bug plus two small changes, feedback mixed with requests), triage creates one child issue per ask. Each child quotes the client's own words, says `Split from #n`, and is triaged on its own:
    - a bug goes to the debugging queue, where the loop reproduces and fixes it;
    - a small change gets an agent brief;
    - a big feature becomes `needs-scoping`;
    - an unclear ask becomes `needs-info`.
  - **The original issue** gets a summary comment: a task list of its children, plus any feedback with nothing to act on. It's labelled `split`, a new role that, like `backlog`, sits in nobody's inbox. You close it once the children are done.
  - **Limits:**
    - Only separate asks are split. Two sentences about the same problem stay one issue, and a single big ask still goes to `needs-scoping`.
    - With more than ten asks, the whole issue goes to `needs-scoping` instead.
    - In manual `/triage`, the split is recommended first and waits for your go.
  - **Workflow:** the triage workflow (and the loop's triage) may now run `gh issue create`, and creates the `split` label. No new secret, and the caller workflow is unchanged.
  - **Other skills:** the tracker and `/why-sleeping` treat a split issue as a summary, not a ticket.
  
  For a project already set up, `/update-imick-skills` adds the `split` row to `docs/agents/triage-labels.md` and creates the label.

## 1.13.0

### Minor Changes

- [#65](https://github.com/imick-io/skills/pull/65) [`326c9cb`](https://github.com/imick-io/skills/commit/326c9cba76924fe0c2ebf74bb511ee604ecc375b) Thanks [@imick-io](https://github.com/imick-io)! - CI runs far less often on projects that use epics ([#62](https://github.com/imick-io/skills/issues/62)).
  
  - **The agent loop and `/run-epic` batch their pushes to an open epic PR.** While more of the epic's work is coming, a push says `[skip ci]`: main merged in before a ticket starts, or a fix landing while others are still building (`/run-epic`: still ready). The batch's last push runs CI, once, on the branch with every fix in. If the batch ends on a skipped push, because its last ticket failed or was handed back, the loop (or `/run-epic finish`) pushes an empty commit so CI still runs. That commit changes no files, so the epic's `verify-epic` status carries over.
  - **`/verify-epic` and `/run-epic` say not to re-run failed CI jobs by hand** while fixes are open or building: the batch's last push runs CI anyway.
  - **`/setup-imick-skills`, Section G (Epic PRs), offers CI settings that fit the flow**, for the project's own workflows:
    - `pull_request: branches: [main]`
    - `concurrency` with `cancel-in-progress`, so a newer push cancels the run it replaces
    - no full suite on `push: main`: the push to `main` keeps only the cheap jobs that save caches, so new PRs don't start cold
  
    For a project already set up, ask an agent to apply step 4 of Section G of `/setup-imick-skills` to its workflows.
  
  To get the loop change, run `/update-imick-skills` in each project, then restart the loop.

- [#66](https://github.com/imick-io/skills/pull/66) [`a121082`](https://github.com/imick-io/skills/commit/a121082c5621bd8b24c3a855279ad6d5242bd166) Thanks [@imick-io](https://github.com/imick-io)! - The agent loop now resolves conflicts between `main` and an epic branch in every mode, not just fast and supersonic.
  
  When merging `main` into an epic branch conflicts, the epic still pauses and gets a "Resolve conflicts" issue. An agent then resolves the merge on the epic branch, checks that no conflict markers are left, pushes and closes the issue with the list of files it resolved. Only when it can't does it ask you on the issue (`agent:asked`), with a Slack ping. Before, a normal-mode epic waited for you to merge by hand.
  
  The resolved merge reaches `main` only through the epic's PR, so you review it there. A `manual` epic's conflicts stay yours. `npm run agents -- --dry-run` lists the conflicts the next pass would take.

- [#64](https://github.com/imick-io/skills/pull/64) [`6c79729`](https://github.com/imick-io/skills/commit/6c797296dbe016e0957fcf4553cfbbebbee178ea) Thanks [@imick-io](https://github.com/imick-io)! - The agent loop no longer sleeps through work it could do.
  
  - **It wakes when GitHub changes.** While it waits (with nothing to do, or for a busy slot), the loop looks at your issues and PRs every 2 minutes. When one changed, for example you approved a spec, answered a question, merged an epic PR, or a ticket became ready, it runs a pass at once instead of sleeping out its 45 minutes. Changes on the tickets it's building don't count. Set `AGENTS_POLL_MINUTES` to change how often it looks, or to `0` for the old behaviour.
  - **It cleans up after a loop that died.** A crash, a power cut or `kill -9` used to leave tickets claimed and epics labelled `agent:planning` or `agent:unblocking`, so every later loop skipped them until you fixed them by hand. The loop now records what it holds (in `.git/agent-loop-held.json`). On start, it releases what a dead loop in the same folder left, and alerts you when it did. It doesn't release a claim made again since, such as one made with `/claim`. It also frees ticket, planning and check branches that dead sandboxes left checked out in `.sandcastle/worktrees/`; the commits on them are kept.
  - **A job that keeps failing no longer keeps the loop spinning.** A build, planning run, unblock, follow-up or conflict resolution that failed, or ran and changed nothing, used to count as work. The next pass then started at once and paid for the same model run again, so the loop never slept. Now that job backs off: it's tried again after 5 minutes (`AGENTS_RETRY_MINUTES`), then 10, 20 and so on, up to every 4 hours. You get one Slack alert at its third strike instead of one each time, and the rest of the queue goes on. A planning run counts as progress only when it changed the epic's issues (new tickets, a closed decision, an edited spec), not when it only commented. Restarting the loop clears the backoff.
  - **Ready tickets no longer wait for a planner that picks none.** With nothing building, there's nothing to clash with, so the oldest ready ticket starts. Each pass now logs why ready tickets didn't start: held back by the planner, an epic paused on a conflict, a claim lost to someone else. A lost claim is tried again after 5 minutes instead of 45.
  - **`npm run agents -- --dry-run`** prints what the next pass would do (build, plan, verify, triage, unblock), and what is backed off and why, changing nothing. It's safe to run beside a running loop; add `--json` for scripts.
  - **The loop keeps a status file** (`.git/agent-loop-status.json`): what it's doing, asleep until when, what it's building, what's backed off and why the last pass started nothing. `/why-sleeping` reads it, so it knows the loop's state even when you started the loop by hand.
  
  To get it, run `/update-imick-skills` in each project, then restart the loop.

- [#69](https://github.com/imick-io/skills/pull/69) [`80e7dd0`](https://github.com/imick-io/skills/commit/80e7dd0ad3f04211d7dac37802148df7da49c565) Thanks [@imick-io](https://github.com/imick-io)! - `/update-imick-skills` now checks the project's own CI against the epic flow on every run, even when the project is already on the newest release.
  
  When the repo uses the epic workflow, it reads each workflow in `.github/workflows/`, except deploys and the skills' own callers. It reports where CI runs more often than the flow needs:
  - PRs into any branch, instead of only `main`;
  - pushes to epic branches, which means one full run per ticket the loop lands;
  - the full suite on `push: main`;
  - no `cancel-in-progress` for runs a newer push replaces.
  
  For each finding, it offers the fix as a diff, applied only on your yes and committed on its own in the update PR. If a workflow saves caches, it keeps `push: main` and limits the expensive jobs to PRs, so `main` still saves the caches new PRs read.
  
  This replaces the hand step from the last release: an already-set-up project gets the CI settings from [#62](https://github.com/imick-io/skills/issues/62) the next time you run `/update-imick-skills`.

- [#63](https://github.com/imick-io/skills/pull/63) [`ee526b6`](https://github.com/imick-io/skills/commit/ee526b648ab4e07f325ebccf046ad6149095709a) Thanks [@imick-io](https://github.com/imick-io)! - `/why-sleeping` now answers in two lists: **agent work** and **your work**, each ranked by how much held work a move frees.
  
  - **Agent work** is what an agent can do: build a ready ticket, triage, cut tickets from an approved spec, work a map, verify an epic PR or fix its checks, resolve an epic's conflicts with `main`, clear a stuck label or claim. A `[loop]` mark means the loop's next pass would do it anyway. Say "do the agent work" and the agent makes the moves in order, running the check again after each.
  - **Your work** is what only you can do. Each line quotes the loop's last comment, so you see what is asked without opening the issue.
  
  It also flags the loop when it's asleep (or not running) with agent work waiting, and lists what is already being built and the tickets it holds back.
  
  With a loop that has the new status file and dry run (update the project's loop), it asks the loop directly. It shows the loop's real state, even when you started the loop by hand. A `[loop]` mark then means the loop's own next pass would take that move. A job the loop backed off after repeated failures shows up as agent work, with its last error.
  
  A "Resolve conflicts" issue counts as the loop's work in every mode now, matching the loop. Once the loop has asked you about it, or when the epic is `manual`, it shows as your work.

### Patch Changes

- [#67](https://github.com/imick-io/skills/pull/67) [`3dbf7b9`](https://github.com/imick-io/skills/commit/3dbf7b91fdc51d5d80985ff23d608b605fb2ffca) Thanks [@imick-io](https://github.com/imick-io)! - The tracker page makes what waits on you impossible to miss, and its roadmap is easier to scan.
  
  - **Red means you, everywhere:**
    - A ticket on your turn or for your review is a solid red chip with a "You" tag on the roadmap, a red card on the epic board and a filled red box in the blocking graph.
    - An epic is outlined in red when anything in it waits on you. Its status turns red when the epic itself does: a brief, a spec to approve, a PR to merge.
    - "Needs triage", which used to be red, is now amber.
  - **One plain colour key** replaces the two legends. It says what each colour asks of you: red you, green agent on it, blue agents next, amber not sorted, grey waiting, faded done.
  - **Done epics fold to one line** on the roadmap ("✓ Done · 26 tickets"). Click one to see its tickets.
  - The epic board's six lanes now fit on one row.
  
  Run `/update-imick-skills` in a project to get the new `tracker/build.mjs`.

## 1.12.0

### Minor Changes

- [#32](https://github.com/imick-io/skills/pull/32) [`6801da7`](https://github.com/imick-io/skills/commit/6801da73ed914bff85ea7b2ce8bca0872f673cd4) Thanks [@imick-io](https://github.com/imick-io)! - New `why-sleeping` skill: ask "why are the agents sleeping?" (or `/why-sleeping`) and it answers with what you must do so the agent loop has work again, and nothing else. It follows every held ticket and autopilot epic down its blocked-by chain to the action only you can take (merge a verified epic PR, approve a spec, answer an `agent:asked` question, decide a `ready-for-human` item, brief an epic), and ranks those actions by how much each frees. It puts loop problems first (Docker down, the loop not running, a label stuck on `agent:planning`) and leaves out what fast or supersonic mode handles itself. It only reads.
  
  To add it to a project: `npx skills@latest add imick-io/skills --skill why-sleeping`.

## 1.11.1

### Patch Changes

- [#59](https://github.com/imick-io/skills/pull/59) [`0c79c7c`](https://github.com/imick-io/skills/commit/0c79c7c961317356cf1951ecbcf67e2a6f168668) Thanks [@imick-io](https://github.com/imick-io)! - `/update-imick-skills` fix: a loop file whose template did not change between the installed version and the target is now left alone, whatever the project did to it; and the Dockerfile's block-only merge is used only when every project change sits inside the `# --- project additions ---` block. A Dockerfile customized outside the block (an extra apt package, a pinned Playwright version) is three-way merged instead, so those edits survive. Found on the first real run: the block merge had dropped two such lines. Also, an `.env.example` key brought over now comes with the comment lines that continue its note.

## 1.11.0

### Minor Changes

- [#57](https://github.com/imick-io/skills/pull/57) [`fceedde`](https://github.com/imick-io/skills/commit/fceeddede8010bc7b90a75a005a68574cf00dee5) Thanks [@imick-io](https://github.com/imick-io)! - A new skill, **`/update-imick-skills`**: upgrade a project to the latest release of these skills in one pass, with a plan first and a PR at the end. Until now `npx skills update` refreshed the skill folders and everything else in a release was copied by hand from the changelog's "Existing setups" lines.
  
  - **Skills**: reinstalls the ones that differ upstream in the layout the repo already uses (real folders or symlinks, never mixed), and offers the upstream skills the project doesn't have, each with its description; nothing new is added unasked.
  - **Agent loop files** (`.sandcastle/`): a file equal to the installed version's template is copied; a customized one is three-way merged (installed template, new template, the project's file) with conflicts left for the agent to resolve; the Dockerfile takes the new template with the `# --- project additions ---` block kept; `.env.example` only gains the lines you pick.
  - **Tracker** (`build.mjs`, the Vercel files when hosted), **new triage-label rows** (with `gh label create`), and the **release notes' steps** between the installed version and the target: the mechanical ones done, the rest listed for you (a new secret, an image rebuild offered, never run unasked).
  - **A version record**, `docs/agents/imick-skills.md` (`Version:`, `Layout:`), written by this skill and now by `/setup-imick-skills` on install; it is what makes the three-way merge and the changelog slice possible. On a project without it, the skill asks once which release you are on.
  - `/whats-next` now points its drift rung at `/update-imick-skills`.
  
  Existing projects: `npx skills add imick-io/skills --skill update-imick-skills` (add `--copy -a claude-code` in a repo that keeps skills as real folders), then run `/update-imick-skills`; it asks for your current version the first time.

## 1.10.1

### Patch Changes

- [#55](https://github.com/imick-io/skills/pull/55) [`4725474`](https://github.com/imick-io/skills/commit/4725474f1034f98f8765006e8c164f363eebf21c) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop fixes:
  
  - **A landed ticket's branch is now really deleted.** After merging a ticket into its epic branch, the loop deleted the ticket's branch without freeing the sandbox's worktree, and git refuses to delete a branch checked out in a worktree. The ticket was already closed and landed, so nothing was lost, but `land()` threw after landing (logging an error and releasing an already-closed ticket), and every ticket's branch and worktree stayed in `.sandcastle/worktrees` for good. The same fix as for a conflicting ticket ([#50](https://github.com/imick-io/skills/issues/50)): `freeBranch` first.
  - **The job that merges `main` into an epic branch gets 30 minutes to install,** up from 10. It keeps the bind mount even with `AGENTS_SANDBOX=isolated`, because patches can't carry its merge commit, and on Docker Desktop for Mac an install across the bind mount can outlast 10 minutes.
  
  Existing setups: copy the new `main.mts` into `.sandcastle/` (or add `freeBranch(t.branch);` before the `git branch -D` in `land()`'s success path, and pass a 30-minute install hook to the conflict job's `createSandbox`), then restart the loop. Worktrees already left behind can be removed with `git worktree remove` once no sandbox uses them.

## 1.10.0

### Minor Changes

- [#52](https://github.com/imick-io/skills/pull/52) [`006c61d`](https://github.com/imick-io/skills/commit/006c61de9b5baa58d57e585c105f6ad5120314e9) Thanks [@imick-io](https://github.com/imick-io)! - **Agent loop: an isolated Docker sandbox, opt-in with `AGENTS_SANDBOX=isolated`.** On Docker Desktop for Mac, a sandbox's dependency install writes `node_modules` across the worktree's bind mount, which can take over 10 minutes (one project measured 10 min 35 s for a pnpm install, 12 s natively) and hit the loop's install timeout. With `AGENTS_SANDBOX=isolated`, sandboxes on a branch get the repo copied in as a git bundle and send their commits back as patches, with nothing of the checkout mounted. The install runs on the container's own disk (about 15–25 s on a quiet machine), and a sandbox can't touch your checkout.
  
  - **`isolated-docker.mts`** (new, copy it into `.sandcastle/`): a Sandcastle isolated provider on the `docker` CLI, using Sandcastle's public API only. The package caches live in one Docker volume shared by every sandbox, at the same path as before, so install commands and environment don't change. Containers are labelled, and each pass removes those a failed or interrupted run left behind (Sandcastle doesn't close a sandbox whose setup failed).
  - **`main.mts`**: the `AGENTS_SANDBOX` switch, defaulting to the bind mount as before. The job that resolves `main` into an epic branch keeps the bind mount, because patches can't carry a merge commit. pnpm installs pass the store explicitly (`--store-dir`), matching the environment.
  - **Fix, either mode:** the unblock and follow-up jobs run on your own checkout and only read, but they carried the install hook. So they installed Linux dependencies into your host `node_modules`, several at once, breaking `npm run agents` (see mattpocock/sandcastle#745). They no longer install.
  - **Fix:** a type gap in `planJobs` from the `manual` label (`manual: false`, since manual epics are skipped just above).
  - **Prompts:** implement and bug agents are told not to merge other branches into theirs.
  - **Docs:** "Sandbox speed on a Mac" in `new-project.md`, a troubleshooting row, and the research behind it in `docs/research/` (Mac container runtimes, cloud sandboxes).
  
  Existing setups: copy `main.mts`, `isolated-docker.mts`, `implement-prompt.md` and `bug-prompt.md` into `.sandcastle/` (keeping your own changes), then set `AGENTS_SANDBOX=isolated` in `.sandcastle/.env` and restart the loop to try it.

## 1.9.0

### Minor Changes

- [#53](https://github.com/imick-io/skills/pull/53) [`87c0502`](https://github.com/imick-io/skills/commit/87c0502a0cbf167dfb2a4385a468b84441ecbe53) Thanks [@imick-io](https://github.com/imick-io)! - A new skill, **`/run-epic <epic>`**: build every ticket of one epic inside a Claude Code session, the way the agent loop would, without Docker. For an epic labelled `manual` (the loop never touches it) when you would rather watch it being built in a session than build each ticket by hand with `/claim`.
  
  - **The loop's pipeline, one ticket at a time.** Claim, `main` merged into the epic branch, `agent/issue-<n>` off it in its own worktree with dependencies installed, a subagent on the loop's own `implement-prompt.md` (or `bug-prompt.md`), a second on `review-prompt.md`, then landed on the epic branch and closed with the loop's wording. The frontier is re-read after each landing, so unblocked tickets follow. Tickets of a `manual` epic carry `ready-for-human`; the skill takes those as well as `ready-for-agent` and `ready-for-agent-debugging`.
  - **Unattended.** No questions once it starts: a build with no commits is handed to a person (label, comment with the reason, assignee removed) and the run goes on; a merge conflict at landing rebuilds the ticket once on the latest epic branch, as the loop does, then hands back. The tracker is rebuilt after each ticket, and the loop's Slack webhooks (`.sandcastle/.env`) get one message per landed or handed-back ticket.
  - **Refuses what the loop could also be building:** the epic must be `manual` (it asks you to add the label, and stops if you refuse); `--force` only when you say the loop is off. Before starting it asks whether the session's permissions let tool calls run unprompted, and whether to start the project's services if they aren't running.
  - **At the end** it opens the epic's PR to `main` when every ticket is closed, and reports what landed, what was handed back and why.
  
  Existing projects: `npx skills update -p -y` installs it (or `npx skills add imick-io/skills --skill run-epic`). It reads the project's `.sandcastle/*-prompt.md`; without them it uses this repo's templates.

### Patch Changes

- [#50](https://github.com/imick-io/skills/pull/50) [`620f266`](https://github.com/imick-io/skills/commit/620f2661a08dc9365738af8558ee25dce55160e8) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop fix: a ticket whose work conflicts with its epic branch is now actually retried on top of the latest epic branch. The loop meant to delete the ticket's branch and rebuild it, but the sandbox's worktree still held the branch, and git refuses to delete a branch checked out in a worktree (`cannot delete branch … used by worktree`). The stale branch survived, so every retry found the work "already done", added a review commit, and conflicted again, forever, spending tokens each round. The loop now frees the worktree first (`freeBranch`), as it already does before resetting a branch elsewhere.
  
  Existing setups: copy the new `main.mts` into `.sandcastle/` (or add `freeBranch(t.branch);` before `git(undefined, "branch", "-D", t.branch);` in `land()`), and restart the loop. A ticket already stuck this way is unstuck by its next landing attempt.

## 1.8.0

### Minor Changes

- [#49](https://github.com/imick-io/skills/pull/49) [`a1f893d`](https://github.com/imick-io/skills/commit/a1f893df62bb9dbc8655a795f61f5a5b07593a0f) Thanks [@imick-io](https://github.com/imick-io)! - A new skill, **`/claim`**: take a ticket out of the agent queue to build it yourself, with its branch set up the way the agent loop would. `/claim` takes the next available ticket (the loop's own queue, in build order, plus a `manual` epic's tickets); `/claim 42` takes [#42](https://github.com/imick-io/skills/issues/42).
  
  - **Claims it**: assigns you (the loop only takes unassigned tickets), re-reads, and backs off if the loop claimed it at the same moment.
  - **Branches like the loop.** Under an epic: merges `main` into the epic branch and pushes it, in a temporary worktree, since the loop may hold the epic branch in its own; then `agent/issue-<n>` off it. Otherwise `feat/<n>` (`fix/<n>` for a bug) off `main`. A branch the loop already started is reused.
  - **Switches you to it** and lists the next steps for that ticket: services, `/implement` or `/debug-and-fix`, `/code-review` against the right base, the checks, and the commands to land it.
  - **Says why when nothing is free**: how many tickets are in development, blocked, held back by their epic or left in a loop worktree, and the blockers that would free the most, with where each stands.
  - **Stops instead of guessing**: uncommitted changes, untracked files the branch would overwrite, a blocked ticket (`--force` to build it anyway), a ticket the loop looks to be building (it claims with your account), a merge conflict between `main` and the epic. `--dry-run` shows what it would do.
  
  **Building a ticket yourself** (`docs/build-a-ticket-yourself.md`) now starts with `/claim`, and its by-hand commands update and land on the epic branch without checking it out, which failed while the loop held that branch in a worktree. The handbook's *A ticket, by hand* flow and journey use `/claim`.
  
  Existing projects: `npx skills update -p -y` installs it.

- [#46](https://github.com/imick-io/skills/pull/46) [`ce53bdc`](https://github.com/imick-io/skills/commit/ce53bdc4194541b13e00afe91644a278f9b2abba) Thanks [@imick-io](https://github.com/imick-io)! - A `manual` label for epics a person plans **and** builds, with other tools or models: the agent loop never plans the epic, never queues or unblocks its tickets whatever they're labelled, and never opens or verifies its PR. Until now the only way to keep the loop off an epic was `backlog`, which means "parked", so the tracker showed the epic as dormant and anyone removing the label handed it to the loop. Also closes a gap: the loop's epic-PR step ran for a `backlog` epic once its milestone emptied.
  
  - **Agent loop (`main.mts`).** `LABEL.manual` (`AGENTS_LABEL_MANUAL`). A `manual` epic is skipped by planning, by the epic PR and verification pass (as is a `backlog` epic now), and by fast-mode unblocking; a ticket whose milestone belongs to a `manual` epic never enters the queue, even labelled `ready-for-agent`, and its `ready-for-human` questions are never answered by the loop.
  - **`/brief`** ends with a three-way choice: autopilot, manual (the label: you plan and build it), or neither (you plan it, the loop builds its tickets). **`/scope-decomposer`** asks once whether any epic is yours to run by hand and publishes it with `manual`. **`/wayfinder`** cuts a `manual` epic's tickets as `ready-for-human`. **`/whats-next`** names a `manual` epic's tickets as your moves.
  - **Tracker.** A `manual` epic shows a `manual` pill on the roadmap and in the epic table, with its statuses worded for you ("You are building it") in your colour instead of the agent's.
  - **Docs.** `triage-labels.md`, `workflow.md`, `new-project.md` and the setup skill's label list.
  
  Existing setups: copy the new `main.mts` into `.sandcastle/` and `tracker/build.mjs` into `tracker/`, add the `manual` row to `docs/agents/triage-labels.md`, and create the `manual` label (`gh label create manual --color 5319E7`).

### Patch Changes

- [#44](https://github.com/imick-io/skills/pull/44) [`4eb4c9a`](https://github.com/imick-io/skills/commit/4eb4c9af820f40f7f6c1f3b7558fff53a61cd55b) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop fix, pnpm projects: `pnpm <script>` in the sandbox no longer fails after the install. Since v1.6.0 the shared package store was passed only to the install (`--store-dir`). pnpm 11 checks the dependencies before every script, saw a different store, tried to reinstall, and stopped on a confirmation the sandbox can't give (`set "confirmModulesPurge" to "false"`). So `pnpm test`, `pnpm typecheck`, and the migrations in `sandbox-setup.sh` all failed. The store is now set in the sandbox's environment (`pnpm_config_store_dir` for pnpm 11, `npm_config_store_dir` for pnpm 9 and 10), so the install and every later command use the same one.
  
  Existing setups: copy the new `main.mts` into `.sandcastle/`, or make the same change there: drop `--store-dir …` from the pnpm install command, and add both variables to the `env` passed to `docker()`.

## 1.7.0

### Minor Changes

- [#42](https://github.com/imick-io/skills/pull/42) [`997868a`](https://github.com/imick-io/skills/commit/997868a5811c6a6ba16da29530cceae1306a391b) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop: more tickets at once, and the real fix for the idle-timeout failure.
  
  - **A rolling pool instead of batches.** The loop used to start a batch of tickets and wait for the slowest one, then run every epic check, before starting anything new. Now each ticket is its own job: when one lands, its slot is refilled at once, and epic checks run beside the tickets instead of in front of them. `npm run agents:stop` and `--once` still wait for running tickets and checks to land. The planner sees the tickets already building and fills only the free slots. It no longer installs dependencies, since it only reads.
  - **The planner holds fewer tickets back.** Small edits to a shared file (a route, an export, a config line) no longer keep two tickets apart. Only large overlapping rewrites, or a real dependency, do; a ticket whose merge does conflict is redone on top of the other, as before.
  - **Contract-first tickets.** `/to-tickets` now suggests cutting a thin first ticket that lands the shared shape (types, migration, stubbed routes), so the rest fan out from it instead of forming a chain.
  - **`AGENTS_EPIC_GATE=ticket` (opt-in).** By default an epic blocked by other epics holds back all its tickets. With `ticket`, only tickets with blockers of their own wait, and autopilot planning of a blocked epic goes ahead. `/to-tickets` now links each ticket that needs another epic to that epic, which is what makes this safe; use it for tickets cut that way.
  - **Only one loop per checkout** ([#33](https://github.com/imick-io/skills/issues/33)). The "finished run fails on the idle timeout" turned out to be two loops running in the same folder: one started an epic check the other was already running, and deleted the worktree the first one's agent was working in. That agent went silent until the idle timeout. A second loop started in the same folder now refuses to start (`.sandcastle/loop.pid`). Loops on other machines are still fine, and a check another loop is running (`verify-epic` pending, less than an hour old) is no longer started twice. v1.6.0's workaround, which counted an idle timeout as success when the run's log had the completion signal, is removed: two runs share a log file, so it could count a dead run as done.
  
  Existing setups: copy the new `main.mts`, `plan-prompt.md` and `.env.example` into `.sandcastle/`, and add `loop.pid` to `.sandcastle/.gitignore`. Before starting the new loop, stop every loop already running in that folder: loops started before this change don't write `loop.pid`, so the lock can't see them.

## 1.6.0

### Minor Changes

- [#41](https://github.com/imick-io/skills/pull/41) [`6166681`](https://github.com/imick-io/skills/commit/61666811ba45de4b6f5d050127695e6d3149c42a) Thanks [@imick-io](https://github.com/imick-io)! - Agent loop: faster, with less waiting between and inside tickets ([#40](https://github.com/imick-io/skills/issues/40)).
  
  - **A run that finished no longer counts as failed** ([#33](https://github.com/imick-io/skills/issues/33)). When an agent prints its completion signal and then hangs until the idle timeout (usually a server it left running), the loop counts the run as done and moves on. Agents are now told to stop every process they started before finishing. One ticket that can't land, or one epic check that fails, no longer stops the rest of the pass, and a failed check's leftover worktree is cleaned up.
  - **A failed pass is retried in 5 minutes, not 45** ([#34](https://github.com/imick-io/skills/issues/34)). The wait doubles with each failure in a row, up to `AGENTS_IDLE_MINUTES`; set it with `AGENTS_RETRY_MINUTES`.
  - **Fast installs in the sandbox** ([#35](https://github.com/imick-io/skills/issues/35)). The install command follows the lockfile (`pnpm install --frozen-lockfile`, `yarn install --immutable` or `npm ci`) with a 10-minute limit, and every sandbox shares one package store in `.sandcastle/cache/`, so a warm install only links packages. The host's `node_modules` is no longer copied in. The image moves to Node 24 with corepack enabled, so pnpm and yarn work without agents setting them up.
  - **Services ready before the agent starts** ([#36](https://github.com/imick-io/skills/issues/36)). A project whose tests need a database or a cache installs it in the Dockerfile's new `# --- project additions ---` block and starts it in `.sandcastle/sandbox-setup.sh`, which writes its exports to `.sandcastle/sandbox-env`. Agents source that file instead of installing their own Postgres or Redis. `/setup-imick-skills` now asks about this.
  - **No new check for loop or docs changes** ([#37](https://github.com/imick-io/skills/issues/37)). A new commit on a verified epic PR that only changes files matching `AGENTS_VERIFY_SKIP` (default `.sandcastle/**,.claude/**,docs/**,*.md,tracker/**`) keeps the green `verify-epic` status, without a 10–15 minute run.
  - **More tickets side by side** ([#38](https://github.com/imick-io/skills/issues/38)). `/to-tickets` prefers wide batches with few `blocked by` links, reports each batch's shape ("7 tickets, at most 4 at once, longest chain 3"), and suggests a wider split when one chain covers more than half the tickets. `/verify-epic` files its gaps as independent tickets. The planner says in its log why it picked fewer tickets than `AGENTS_MAX_PARALLEL` allows.
  
  Existing setups: copy the new `main.mts`, the prompts and the `Dockerfile` into `.sandcastle/` (keep your own Dockerfile changes inside the project-additions block), add `cache/` and `sandbox-env` to `.sandcastle/.gitignore`, and rebuild the image with `npx sandcastle docker build-image`. If you had replaced the install hook by hand (e.g. for pnpm), the new `main.mts` does that for you.

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

- [#31](https://github.com/imick-io/skills/pull/31) [`2ab4101`](https://github.com/imick-io/skills/commit/2ab4101f616a113bf7021a39e4577f2d909d8cce) Thanks [@imick-io](https://github.com/imick-io)! - The tracker page can be hosted on Vercel. Instead of a snapshot on your machine, it is built from GitHub on every visit, behind a password, so it's current even while the agent loop is off and anyone you give the login can follow the work. `/setup-imick-skills` now asks whether the tracker stays **local only** or is also hosted on **Vercel**, and the `tracker` skill walks through the setup: copy its `vercel/` folder into `tracker/`, link a Vercel project from `tracker/`, and add a read-only GitHub token (`GITHUB_TOKEN`) and a login (`TRACKER_USER`, `TRACKER_PASSWORD`) as Vercel environment variables.
  
  `tracker/build.mjs` works as before locally (`node tracker/build.mjs`, and the loop's rebuild every pass). It now also exports `render()`, which calls GitHub's GraphQL API directly when `GITHUB_TOKEN` is set, and reads an epic's open PR from one query instead of a `gh` call per finished epic.
  
  In a project that already has the tracker: copy `build.mjs` over `tracker/build.mjs`. To host it, ask for a hosted tracker or run the `tracker` skill's **Hosting on Vercel** steps.

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
