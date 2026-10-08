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

## Run

The input is an idea in prose, an issue (often labelled `needs-scoping` by triage), or an existing initiative. An existing initiative means a **re-run**: see below.

1. **Survey the code.** If the repo already has an app, dispatch a subagent to map what exists in the areas the idea touches, using the domain glossary. Epics cover only what's missing, named with the code's terms. Wait for its report before step 2.

2. **Interview.** Call the Skill tool twice, for "grilling" and "domain-modeling". Grill **breadth-first and high-level**: the initiative's destination, the whole product surface, the boundaries between parts, which area owns each part, what comes first, and what is ruled out. Stop at boundaries; a question about how one part works belongs to that epic's map. Done when every part of the idea is either an epic that passes the four tests, a Not-yet-scoped entry, or out of scope.

3. **Propose** the decomposition in one message: the initiative's destination; the epics in build order, each with destination, area, what it covers, and its blockers; Not yet scoped; Out of scope. Revise with the user until they confirm.

4. **Publish**, in this order:
   1. The **initiative**. From an existing issue, keep its text, append the sections below, and swap any triage labels (`needs-scoping`, `ready-for-human`) for `initiative`. Label it with every area its epics use, and assign the owner the user named.
   2. Each **epic**, in build order: its milestone (next free repo-wide number), the issue (labels `epic`, `needs-briefing` and `ready-for-human` + its area, in its milestone, assigned to the area's default person, linked under the initiative).
   3. Blocking edges between epics, in a second pass once every epic has an id.

5. **Hand off.** Report what was created, by name with links. Every epic waits for its brief: "Next, run `/brief` to brief the epics, starting with <first epic nothing blocks> (<milestone title>); each brief ends by choosing manual or autopilot planning."

## Bodies

Initiative:

```markdown
## Destination

<what exists when the whole initiative is done>

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

<what it covers; neighbouring epics it touches and how; skills its map should consult>

## Not yet specified

<open questions already visible, for the map to chart>

## Out of scope

<neighbouring epics' territory, each linked; anything else ruled out>
```

## Re-run

Given an existing initiative, load it and its epics, then interview on what changed. A re-run may add epics, split or merge epics, and graduate Not-yet-scoped entries into epics, but only touches epics that have **no map yet**: once a map exists, scope changes go through wayfinder's out-of-scope rules. A merged or dropped epic is closed with a comment pointing to its successor; its number and milestone stay retired, never reused.

On the local-markdown tracker, also check for finished work: offer to close an epic whose tickets are all resolved, and the initiative once every epic is closed and Not yet scoped is empty.
