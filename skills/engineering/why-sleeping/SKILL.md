---
name: why-sleeping
description: Why is the agent loop sleeping? Names what you must do so the agents have work again - the merge, approval, answer or brief that each piece of held work waits on, ranked by how much it frees. Use when the user asks why the agents or the loop are sleeping, idle or stuck, or what unblocks them.
---

# Why sleeping

The loop sleeps when it has nothing it's allowed to do. The user knows that already. Their question is **what do I do so the agents have work again?** Answer only that.

`/whats-next` covers the whole project (setup, drift, reviews, the next step in the flow). This skill covers one thing: the person's actions that stand between the agents and their next piece of work. It only reads.

## 1. Read

Run [scripts/blockers.mjs](./scripts/blockers.mjs) from the repo root: `node <this skill>/scripts/blockers.mjs`. It takes every held piece of work (each `ready-for-agent` ticket and each autopilot epic) and follows its blocked-by chain down to the action only a person can take: merge a verified epic PR, approve a spec, answer an `agent:asked` question, decide a `ready-for-human` item, brief an epic, triage. It ranks those actions by how many held items each frees. Fast and supersonic modes are taken into account, so what the loop handles itself isn't listed.

Read a line further only when the script can't settle it, such as a failing check whose cause you need to name.

## 2. Answer

Reply in this shape and nothing else. No recap of the loop, no "it has nothing to do".

```markdown
1. **<action>** → <link or `command`>. Frees <what, by number>.
2. ...
```

- Put loop problems first (Docker down, the loop not running, a stuck label).
- Then your moves, most freed first. Give three at most, one line each.
- When nothing waits on a person, say so in one line: either the agents' next pass picks the work up on its own (name it), or the queue is truly empty and the next brief is the way to give them work (`/brief <n>`).
- When an agent can do the first move itself (remove a stuck label, start the loop), offer it in one line and wait for a yes.
