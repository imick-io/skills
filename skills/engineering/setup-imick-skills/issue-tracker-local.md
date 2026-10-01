# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` (the Notes / Decisions-so-far / Fog body).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.

## Initiatives and epics

Used by `/scope-decomposer`, and by every skill that creates an issue under an epic. An **initiative** is a big idea; its **epics** are the bounded scopes under it, each planned by one wayfinder map and shipped as one PR from its own branch.

- **Initiative**: `.scratch/<initiative>/index.md`.
- **Epic**: `.scratch/<initiative>/epics/NN-<slug>/epic.md`. The epic folder is the epic's effort folder: its wayfinder map (`map.md`), tickets (`issues/`) and spec live in it. Its branch is `epic/NN-<slug>`, recorded in its body.
- **Epic order**: a `Blocked by: NN, NN` line near the top of `epic.md`.
- **Milestone**: a `Milestone: NN: <Initiative> / <Epic>` line near the top of `epic.md`. `NN` is unique across every `.scratch/*/epics/`, never reused.
- **Status**: a `Status: open` / `Status: closed` line near the top of `index.md` and each `epic.md`.

**Inheritance.** Every file created under an epic folder carries the epic's `Milestone:` and `Area:` lines (see `docs/agents/team.md`; skip `Area:` when the repo has a single area).

**Assignment.** An `Assignee:` line means *claimed*: someone is working on it now. Initiatives and epics carry their owner; `ready-for-human` work carries the person who will do it; map tickets and `ready-for-agent` tickets carry none until claimed.
