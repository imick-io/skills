---
"imick-skills": patch
---

Agent loop fix: finished work interrupted before it landed is now reviewed and landed on the next pass, instead of being handed to a person. If the loop stopped or restarted between a ticket's build and its landing, the rerun found the work already committed, made no new commits, and the loop moved the ticket to `ready-for-human` with no comment. The loop now checks for commits on the ticket's branch that its base doesn't have yet, not just the latest run's commits.

In a project already running the loop, port the change to `.sandcastle/main.mts`, or copy `agent-loop/main.mts` over it while keeping any local changes, and restart the loop.
