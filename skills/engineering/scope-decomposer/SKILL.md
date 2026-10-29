---
name: scope-decomposer
description: Break a big idea, product, feature, existing project or broad issue into an initiative of epics on the issue tracker, each one ready for /brief and then /wayfinder.
disable-model-invocation: true
---

# Scope decomposer

A big idea has arrived, too big for one wayfinder map. Decompose it into an **initiative** of **epics**: each epic is a bounded scope that one `/wayfinder` map plans and one PR ships. You set boundaries and order; you never plan inside an epic, which is wayfinder's job.

The tracker operations (labels, sub-issues, milestones, blocking, local-markdown layout) are in the tracker doc's **Initiatives and epics** section. The issue tracker should have been provided to you; if not, tell the user to run `/setup-imick-skills`. On GitLab, say initiatives aren't supported there yet and stop. Areas, owners and teams are in `docs/agents/team.md`.

## The epic

An epic passes all four tests:

- **One destination**: a sentence or two saying what exists when it ships.
- **One owner**: exactly one area from `team.md`. Needing two owners means two epics.
- **Plannable alone**: its map can run without waiting on another epic's undecided questions. Ordering dependencies are fine; they become blocking edges.
- **One PR**: it ships as a coherent whole from its own branch.

There is no cap on the number of epics. Fog applies here as in wayfinder: an epic is created only when its destination can be stated sharply now. A part of the idea you can see but not yet bound goes into the initiative's **Not yet scoped** section, and graduates to an epic on a later run.

## Local first

A new product's first version is built to be tried, not hosted: the human wants to use it and decide whether they like it before paying for, signing up to or wiring any infrastructure. So by default **v1 runs entirely on the developer's machine**, and going live comes last.

Infrastructure splits by **who can do it**:

- **The agent alone**: a local database (SQLite, or Postgres in Docker Compose), migrations, seed data, local file storage, a dev login, email printed to the console, payments in test mode or mocked. This belongs inside the product epics that need it, each behind a seam the real service will slot into later.
- **Only the human**: cloud accounts, billing, domains and DNS, production secrets, deploy keys. This is the **Go live** epic, last in build order, blocking nothing. When the human hasn't yet decided to go live, it stays in **Not yet scoped** instead.

No product epic is ever blocked by Go live, and no product epic needs a human-only step to ship: work that can't be done without one is the agent loop's most common stall.

The exception is a product whose core **is** the integration (a Stripe Connect marketplace, sign-in with one particular provider as the main flow): faking it would defeat trying it. Then that one service gets a narrow human task in the epic that needs it ("create a Stripe sandbox, put its keys in `.env`"), never a whole infrastructure epic up front.

The human can opt out (the product already runs somewhere, or hosting is the point); record it in the initiative's Destination.

## Supersonic: one interview

When the project's loop runs supersonic (`AGENTS_MODE=supersonic` in `.sandcastle/.env`), or the user asks for it, this interview also **briefs every epic**, so no `/brief` session follows and the loop starts planning straight away. Say so at the start of the interview.

Don't run `/brief`'s interview once per epic. By the time the epics pass the four tests, the interview has covered most of what a brief holds: who it's for, the must-haves, the no-gos, the calls already made. **Draft** each epic's Brief from that, in `/brief`'s template (`.claude/skills/brief/SKILL.md`, step 4), ask only what a draft is missing, and apply `/brief`'s scope check (a must-have that doesn't fit its epic is a new epic). Show the drafts with the proposal; with many epics, confirm them three or four at a time, in build order. End with `/brief`'s last question: "Anything else you already know you want or don't want, on any epic?"

An epic the user wants to brief later, or can't yet, is published the usual way (`needs-briefing`); the others don't wait for it.

An epic the user will plan **and build** by hand (with other tools or models) gets the `manual` label instead of a brief and `autopilot`: the loop never plans it, never queues or unblocks its tickets, and never opens its PR. Ask once, for the whole set, whether any epic is theirs to run that way.

## Run

The input is an idea in prose, an issue (often labelled `needs-scoping` by triage), or an existing initiative. An existing initiative means a **re-run**: see below.

1. **Survey the code.** If the repo already has an app, dispatch a subagent to map what exists in the areas the idea touches, using the domain glossary. Epics cover only what's missing, named with the code's terms. Wait for its report before step 2.

2. **Interview.** Call the Skill tool twice, for "grilling" and "domain-modeling". Grill **breadth-first and high-level**: the initiative's destination, the whole product surface, the boundaries between parts, which area owns each part, what comes first, and what is ruled out. For a new product, ask once whether v1 is **local first** (see above), recommending yes, and which services, if any, are the core integration. Stop at boundaries; a question about how one part works belongs to that epic's map. Done when every part of the idea is either an epic that passes the four tests, a Not-yet-scoped entry, or out of scope.

3. **Propose** the decomposition in one message: the initiative's destination, saying whether v1 is local first; the epics in build order, each with destination, area, what it covers, its blockers, and any human-only step it needs; Not yet scoped (Go live, until the human decides to go live); Out of scope. On a local-first initiative, a product epic blocked by infrastructure or needing a human-only step is a decomposition error: move that work to Go live or to a local stand-in before proposing. Revise with the user until they confirm.

4. **Publish**, in this order:
   1. The **initiative**. From an existing issue, keep its text, append the sections below, and swap any triage labels (`needs-scoping`, `ready-for-human`) for `initiative`. Label it with every area its epics use, and assign the owner the user named.
   2. Each **epic**, in build order: its milestone (next free repo-wide number), the issue (labels `epic`, `needs-briefing` and `ready-for-human` + its area, in its milestone, assigned to the area's default person, linked under the initiative). On **supersonic**, a briefed epic carries its `## Brief` after the Destination and the labels `epic`, `autopilot` + its area (plus `supersonic` when the project isn't supersonic as a whole), without `needs-briefing` or `ready-for-human`. An epic the user runs by hand carries `epic`, `manual`, `needs-briefing`, `ready-for-human` + its area, and its body says so under the Destination; its tickets, when cut, get `ready-for-human`.
   3. Blocking edges between epics, in a second pass once every epic has an id.

5. **Hand off.** Report what was created, by name with links. On supersonic: "The agent loop plans the briefed epics in build order, starting with <first epic nothing blocks>; you'll hear from it only for what can't be undone, and in its daily digest." Otherwise every epic waits for its brief: "Next, run `/brief` to brief the epics, starting with <first epic nothing blocks> (<milestone title>); each brief ends by choosing manual or autopilot planning."

## Bodies

Initiative:

```markdown
## Destination

<what exists when the whole initiative is done>

**V1:** local first: runs on the developer's machine; hosting and accounts wait for Go live. <or: not local first, and why>

## Not yet scoped

<parts you can see but can't yet bound as epics; each graduates on a later run>

## Out of scope

<what this initiative has ruled out>
```

Epic:

```markdown
**Initiative:** <initiative, linked> · **Branch:** `epic/NN-<slug>`

## Destination

<what exists when this epic ships>

## Notes

<what it covers; neighbouring epics it touches and how; skills its map should consult; on a local-first initiative, the local stand-ins it uses (and the human-only step, for a core integration)>

## Not yet specified

<open questions already visible, for the map to chart>

## Out of scope

<neighbouring epics' territory, each linked; anything else ruled out>
```

## Re-run

Given an existing initiative, load it and its epics, then interview on what changed. A re-run may add epics, split or merge epics, and graduate Not-yet-scoped entries into epics, but only touches epics that have **no map yet**: once a map exists, scope changes go through wayfinder's out-of-scope rules. A merged or dropped epic is closed with a comment pointing to its successor; its number and milestone stay retired, never reused.

On the local-markdown tracker, also check for finished work: offer to close an epic whose tickets are all resolved, and the initiative once every epic is closed and Not yet scoped is empty.
