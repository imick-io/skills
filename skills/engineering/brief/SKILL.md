---
name: brief
description: Brief an epic before it's planned - a short, high-level grill-with-docs session that captures what you already have in mind, then choose whether wayfinder runs on it manually or on autopilot.
disable-model-invocation: true
---

# Brief

`/scope-decomposer` sets an epic's boundaries; it doesn't know what's in the human's head about it: the must-haves they take for granted, the things they'd never want, the product calls they've already made. A **brief** gets that out before planning starts, so `/wayfinder` (manual or autopilot) starts from the human's intent instead of guessing it.

Every epic `/scope-decomposer` creates carries `needs-briefing` and `ready-for-human`. A brief removes both, and leaves the epic on **autopilot** (the `autopilot` label), **manual** (the `manual` label: a person plans and builds it, the loop stays out), or neither (a person plans it, the loop builds its tickets). On a supersonic project, `/scope-decomposer` writes the briefs itself in its one interview; `/brief` is then only for an epic it left with `needs-briefing`.

The tracker operations are in the tracker doc's **Initiatives and epics** section; the label strings are in `docs/agents/triage-labels.md`. If they don't exist, tell the user to run `/setup-imick-skills`.

## Run

1. **Pick the epic.** `/brief <epic>` is that epic. A bare `/brief` takes the next open epic labelled `needs-briefing`, in build order (its milestone number), skipping any still blocked by an unbriefed one. Read it with its initiative, and the epics it touches.

2. **Grill, high level.** Call the Skill tool twice, for "grilling" and "domain-modeling", and run a short session on this epic only, working in `GLOSSARY.md` and ADRs as `grill-with-docs` does. Stay at the level that changes the product:
   - who it's for, and the job it does for them,
   - the **must-haves** ("invite a partner by email to a shared budget"),
   - the **no-gos** ("no bank connections in v1"),
   - the **big product calls** ("shared or single-user?", "monthly or weekly first?"),
   - anything **already decided** (a service, a stack choice, a reference product),
   - on a **local-first** initiative (its Destination says so), any real service this epic can't fake. By default it uses local stand-ins only; carry that into **Already decided** as "Local first: no hosted services or accounts; local stand-ins only", naming any core integration that is the exception.

   Leave everything an agent can decide alone (which date picker, the empty-state copy) to wayfinder. A few rounds is the norm. Done when nothing the human has in mind about this epic is left unsaid: ask "anything else you already know you want or don't want here?" before moving on.

3. **Check the scope.** A must-have that doesn't fit this epic's destination ("invitations" with roles, permissions and emails, inside a "Monthly view" epic) is a new epic, not a bullet. Say so, and suggest `/scope-decomposer <initiative>` to add it; note it under the brief's **Not here** list rather than stretching this epic.

4. **Write the Brief**, as a section of the epic's body, after the Destination:

   ```markdown
   ## Brief

   **Must have**
   - <...>

   **Must not**
   - <...>

   **Preferences**
   - <...>

   **Already decided**
   - <decision> (ADR: <link>)

   **Not here**
   - <must-have that belongs to another epic, and where it goes>
   ```

   Omit empty headings. Each line is the human's decision: wayfinder takes it as settled, at 100%, in either mode.

5. **Choose the mode.** Ask, as the last question:

   > **Autopilot or manual** for this epic? On autopilot, the agent loop runs wayfinder on it by itself, decides what the brief leaves open (researching what it's unsure of), and stops at the spec for your approval. On manual, you run `/wayfinder` on it; then, do you also build it yourself (with other tools or models), or does the loop build its tickets?

   Then remove `needs-briefing` and `ready-for-human`, and add `autopilot` when chosen, or `manual` when they plan and build it themselves: the loop then never plans it, never queues or unblocks its tickets whatever they're labelled, and never opens its PR. With neither label, they plan it and the loop builds its `ready-for-agent` tickets. On autopilot, in a project whose loop isn't already in fast mode, mention **fast** too: with the `fast` label the loop also answers what would wait on them when it's confident enough, approves a confident spec and merges the verified epic, pinging them in Slack only for what it can't settle. **Supersonic** (the `supersonic` label) goes further for throwaway work: below the threshold it assumes reversible calls instead of asking, always approves the spec, and reports its assumptions in a daily digest.

6. **Hand off.** Report the brief and the mode, then the next step: "The agent loop will plan it" (autopilot) or "Run `/wayfinder <epic>` when you're ready" (manual; with the `manual` label, add that its tickets are theirs to build, labelled `ready-for-human`). If more epics still need briefing, name the next one.
