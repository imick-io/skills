# TASK

These tickets are ready for agents in this repo:

{{TICKETS}}

These are already being built, each in its own sandbox:

{{RUNNING}}

Pick the ready tickets that can be worked **at the same time**, beside each other and beside the ones already building, at most {{MAX_PARALLEL}}. Read each ticket (`gh issue view <number> --comments`) and the code it points at.

Two tickets must not run together when:

- one needs code, an API shape or a decision the other introduces,
- they'd edit the same files beyond the small edits below: the same functions, components, forms or schema.

Small edits to a shared file are fine side by side: a route registered, an export or a list entry added, a line in the same config. Anything more is not. When two branches conflict, the loop sends the later one back to be rebuilt from scratch on top of the first, build and review again, which costs hours. So hold a ticket back when it would edit the same files as another one picked or building, beyond those small edits, even if the two edits look separate (two handlers added to the same listener, two sections added to the same page or form). One ticket held back for a pass costs less than one rebuilt.

Prefer tickets of the same epic, oldest first; bugs (`bug` kind) before builds when they conflict. A `suite` ticket runs a test suite and edits nothing: it can always run beside the others. Don't modify anything.

When you pick fewer than {{MAX_PARALLEL}} while more tickets are listed, say why in one line per ticket left out, before the plan (e.g. "#121: needs the API #120 adds", "#124: rewrites the same checkout form as #123"). It stays in the planner's log, so a chain of tickets holding the loop back is visible.

# OUTPUT

<plan>
{"issues": [{"number": 42}, {"number": 43}]}
</plan>

Always emit the `<plan>` tags. If nothing can be worked, output `<plan>{"issues": []}</plan>`.
