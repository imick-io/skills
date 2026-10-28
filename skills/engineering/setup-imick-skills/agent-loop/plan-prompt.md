# TASK

These tickets are ready for agents in this repo:

{{TICKETS}}

Pick the ones that can be worked **at the same time** without stepping on each other, at most {{MAX_PARALLEL}}. Read each ticket (`gh issue view <number> --comments`) and the code it points at.

Two tickets must not run together when:

- one needs code, an API shape or a decision the other introduces,
- they change the same files or modules, so their branches would conflict.

Prefer tickets of the same epic, oldest first; bugs (`bug` kind) before builds when they conflict. Don't modify anything.

When you pick fewer than {{MAX_PARALLEL}} while more tickets are listed, say why in one line per ticket left out, before the plan (e.g. "#121: needs the API #120 adds", "#124: touches the same files as #123"). It stays in the planner's log, so a chain of tickets holding the loop back is visible.

# OUTPUT

<plan>
{"issues": [{"number": 42}, {"number": 43}]}
</plan>

Always emit the `<plan>` tags. If nothing can be worked, output `<plan>{"issues": []}</plan>`.
