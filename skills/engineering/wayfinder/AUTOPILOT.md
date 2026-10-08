# Autopilot

Wayfinding without the human in every decision. The agent charts the map and resolves its decisions on its own, using confidence to decide what it can settle alone and research to settle the rest. The human's one checkpoint is the **spec**: every decision taken on autopilot is listed there, least confident first, for them to approve or correct.

Autopilot is a property of the **epic**: its `autopilot` label, usually set at the end of its `/brief`. Invoking `/wayfinder <epic> autopilot` adds the label. Every session on the epic's map, a person's or the agent loop's, follows it. The threshold is 75 unless the map's Notes say otherwise (`Threshold: 80`); an older map whose Notes say `Mode: autopilot` counts too. Everything in the main skill still holds (the map, tickets, fog, out of scope, blocking, the tracker operations) except what this file overrides.

## Chart

As in "Chart the map", but without the grilling: take the destination, Notes, Out of scope and **Brief** from the epic as given, every Brief line as a decision already made at 100% (an epic is required; without one, ask for the destination and stop there), survey the code with a subagent, and map the frontier yourself. Create the map (its Notes link the Brief), its tickets, and their blocking edges. A question the Brief already answers is no ticket: record it in Decisions so far as "From the brief". Then carry on working through it in the same session.

## Work through the map

Override: **resolve every ticket on the frontier, then the new frontier, until no tickets remain.** Each ticket is resolved by **its own subagent** with a self-contained prompt (the map's Destination and Notes, the Decisions so far, the ticket), so every decision starts from clean context; you only coordinate. Claim each ticket before dispatching it, as usual.

A subagent resolves a ticket by type:

- **Grilling**: draft the answer the way the grilling skill would, with its **confidence** (the likelihood the human accepts it as is).
  1. At or above the map's threshold: decide it.
  2. Below: dig into the question: read the `dig` skill (`.claude/skills/dig/SKILL.md`, or wherever skills live here) and follow it, then re-score with what it found.
  3. Still below: decide anyway on the best answer, marked **assumed**.
- **Research**: as in the main skill.
- **Prototype**: build the prototype (call the Skill tool with "prototype"), judge it against the destination yourself, and decide, marked **assumed**.
- **Task**: work that needs the human (an account, access, data only they have) can't be done here. Label it `ready-for-human`, assign the epic's owner, and treat everything it blocks as blocked.

Record each resolution as in the main skill, with the confidence on the first line of the resolution comment:

```markdown
**Decided on autopilot** (82%): <the answer>
```

or `**Assumed on autopilot** (55%, after dig): <the answer>`, then the reasoning and, for assumed answers, what would change the call. The map's Decisions-so-far line carries the same percentage.

Done when the map has no open tickets except parked tasks. If parked tasks block what's left, stop there: report which tasks need the human.

## Hand off: the spec

When the way is clear, read the `to-spec` skill's SKILL.md and follow it, then shape what it published:

- Append a **Decided on autopilot** section: every decision the agent took (the Brief's are the human's, and stay out of it), **lowest confidence first**, one line each with its percentage, `assumed` where it applies, and a link to its ticket.
- Labels: add `spec` and `ready-for-human`, remove `ready-for-agent`. Put it in the epic's milestone and assign the epic's owner.
- Comment, starting with the AI disclaimer, asking for review: approve by adding the `spec-approved` label, or comment what to change.

Close the map: its destination is reached.

## Revise

When the spec has a human comment newer than the last AI comment and no `spec-approved` label, the human asked for changes. Apply them: re-decide the affected decisions (the human's answer wins, at 100%), update their tickets' resolutions and the Decisions so far, edit the spec in place (the **Decided on autopilot** section included), and comment what changed, again asking for approval.
