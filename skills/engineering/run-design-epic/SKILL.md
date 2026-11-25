---
name: run-design-epic
description: Build every ticket of one UX/UI epic inside this Claude Code session, like /run-epic, with design rounds on each ticket (screenshots, an independent design review, fixes) and a pause for approval on checkpoint tickets.
disable-model-invocation: true
argument-hint: "<epic number> [--force]"
---

# Run design epic

`/run-epic` for an epic whose tickets change what people see. The pipeline, the rules and the script are `/run-epic`'s: read [../run-epic/SKILL.md](../run-epic/SKILL.md) first and follow it. This file only says what differs: each ticket goes through **design rounds** between its build and its code review, and a **checkpoint** ticket waits for the user before it lands.

A **design round** is: capture the screens, have a fresh reviewer judge the pictures, fix what it found. The builder never grades its own screens.

Two scripts, both run from the repo root:

- `run-epic` means `node <this skill>/../run-epic/scripts/run-epic.mjs`.
- `design` means `node <this skill>/scripts/design.mjs`.

## 0. Before the first ticket

Do `/run-epic`'s section 0, then:

1. **`design check <epic>`.** Read the JSON:
   - `captureDoc: null`: the project has no capture recipe. Stop and write `docs/agents/design-capture.md` with the user (how to run the app from a worktree, sign in as a seeded person, and screenshot a route in each theme and viewport), prove it on one screen, then start again.
   - `tools`: what the recipe needs must be there (a booted simulator for a mobile epic). If not, ask the user to start it.
   - `checkpoints`: the tickets that will pause for approval.
   - `lanes`: `true` when the recipe has a `Lanes` section, a second copy of the app's whole stack (its own ports, database and queue) proven to run beside the first. Then the run may take two tickets at once (section 3).
2. Add to the three-line plan: the run pauses at each checkpoint, the review page is at `page`, and whether tickets run two at a time.

## 1. One ticket, start to finish

`/run-epic`'s section 1, with steps 3 and 4 replaced by this:

1. `run-epic prepare <ticket>`, then build with `run-epic prompt implement <ticket>`, as there.
2. `run-epic commits <ticket>`: `0` is a hand-back, as there.
3. **Design round 1.**
   1. `design round <ticket> 1` makes the round's folder.
   2. **Capture.** Dispatch one subagent with `design prompt capture <ticket> 1`. Then `design captured <ticket> 1`: `images: 0` means nothing could be photographed. Note "not captured" with the agent's reason for the final report, skip to step 5, and go on. A dirty worktree is listed in `worktreeDirty`: have the subagent clean it before continuing.
   3. **Review.** Dispatch a **new** subagent with `design prompt review <ticket> 1`. It writes `review.json`. Never give it the builder's report.
   4. `design verdict <ticket> 1`: `pass: true` (no `must` finding) ends the rounds. A non-empty `unseen` means the reviewer skipped pictures: dispatch the review again, once.
4. **Fix, then round 2, then round 3.** While the verdict is `pass: false` and the round is below 3: dispatch one subagent with `design prompt fix <ticket> <round>`, then run the next round (capture, review, verdict) the same way. A later round is a **re-check**: its capture prompt re-photographs only the pictures the findings named and the screens the fixes changed (every screen again when a fix reaches shared components), and its reviewer judges those in full, with the earlier round's other pictures standing. Three rounds is the cap: `pass: false` after round 3 is a hand-back, `run-epic handback <ticket> "design review: <the open must findings, one line>"`, after `design publish <ticket>` so the findings are on the issue.
5. **Code review.** `run-epic prompt review <ticket>`, one subagent, as there. This is where the project's slow suites (the whole browser suite) run, once for the ticket: the fix subagents run only the tests their change reaches.
6. **Checkpoint.** `design checkpoint <ticket>` prints `true` for a ticket whose body has a `Design checkpoint` heading. Then: `design page <epic>`, open the page for the user, say in three lines what was built and what the reviewer still lists, and **wait for their answer**. Changes they ask for are one more fix: write them to the round's `review.json` as `must` findings, dispatch the fix prompt, capture again, and ask again. Land only on their yes.
7. `design publish <ticket>`, then `run-epic land <ticket>`.
8. One line for the final report: landed, in how many rounds, with how many `should` findings left; or handed back, and why.

## 2. When the frontier is empty

`run-epic finish <epic>`, as there. Then `design page <epic>` and give its path in the report.

## 3. Two tickets at once

Only when `design check` shows `lanes: true`. A ticket spends most of its hours waiting on captures, reviews and test runs; a second ticket in a second **lane** fills that time.

- **Pick a pair that won't collide.** The second ticket must touch other screens and, as far as both bodies say, other shared components than the first. Skip down `frontier.ready` for one that fits; when none does, run one at a time.
- **Name the lane in every prompt for the ticket:** put one line before each prompt you dispatch, build to keyboard check: "Use lane `<name>` from `docs/agents/design-capture.md`: its ports, database and queue, never the default ones, and stop only the processes you started, by PID." The default lane needs no line.
- **Never more than two**, and each lane runs one step at a time: its own capture, fix or test run, never two in the same lane.
- **Land one at a time.** When the second ticket's `land` exits 3 (a conflict with the first's work), dispatch one subagent in its worktree to merge the epic branch in, resolve, rerun the tests the conflict reached and commit; then `land` again. A second conflict is `/run-epic`'s rebuild (`prepare --retry`).
- A lane freed by a landing takes the next ticket that fits beside the one still running.

## Rules

`/run-epic`'s rules hold, with these changes:

- **Up to three rounds per ticket**, where `/run-epic` gives one attempt. A merge conflict at landing still gets one rebuild.
- **The run asks questions only at checkpoints.** Everything else is a hand-back.
- **Capture and review change no code.** Only the build and fix subagents commit.
- **Pictures stay on this machine**, under `.claude/design-runs/`, never committed. The issue gets the reviewer's findings as text.
- **One app per lane.** Capture starts the project's app and stops it. Without lanes, that means one ticket at a time, as `/run-epic` says; with lanes, two tickets, one in each (section 3).
