# Triage Labels

The skills speak in terms of canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

A triaged issue carries one **what** role and one **who** role; `needs-triage` marks one triage hasn't finished.

| Role | Axis | Label in our tracker | Meaning |
| --- | --- | --- | --- |
| `bug` | what | `bug` | Something is broken |
| `enhancement` | what | `enhancement` | A small improvement, one brief's worth |
| `needs-scoping` | what | `needs-scoping` | Too big for one brief; goes to `/scope-decomposer` |
| `needs-info` | what | `needs-info` | Waiting on the reporter |
| `wontfix` | what | `wontfix` | Already built, duplicate or rejected; a person closes it |
| `ready-for-agent-debugging` | who | `ready-for-agent-debugging` | An agent reproduces the bug next |
| `ready-for-agent` | who | `ready-for-agent` | An agent builds it from the brief |
| `ready-for-human` | who | `ready-for-human` | A person acts next |
| `ready-for-review` | who | `ready-for-review` | A fix PR waits for a person's review |
| `needs-briefing` | (planning) | `needs-briefing` | An epic waiting for its `/brief` |
| `autopilot` | (planning) | `autopilot` | An epic the agent loop may plan by itself |
| `spec` | (planning) | `spec` | A spec, read by `/to-tickets`, never built directly |
| `spec-approved` | (planning) | `spec-approved` | A person approved an autopilot spec; tickets can be cut |
| `needs-triage` | (transient) | `needs-triage` | Triage hasn't finished |

When a skill mentions a role, use the label string from this table. Edit the third column to match whatever vocabulary you actually use.
