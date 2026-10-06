# TASK

These tickets are ready for agents in this repo:

{{TICKETS}}

Pick the ones that can be worked **at the same time** without stepping on each other, at most {{MAX_PARALLEL}}. Read each ticket (`gh issue view <number> --comments`) and the code it points at.

Two tickets must not run together when:

- one needs code, an API shape or a decision the other introduces,
- they change the same files or modules, so their branches would conflict.

Prefer tickets of the same epic, oldest first; bugs (`bug` kind) before builds when they conflict. Don't modify anything.

# OUTPUT

<plan>
{"issues": [{"number": 42}, {"number": 43}]}
</plan>

Always emit the `<plan>` tags. If nothing can be worked, output `<plan>{"issues": []}</plan>`.
