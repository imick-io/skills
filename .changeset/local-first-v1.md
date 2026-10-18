---
"imick-skills": minor
---

Local-first v1: build the product before the infrastructure, so the agent loop stops stalling on accounts and secrets only you can set up.

- `/scope-decomposer` now asks, for a new product, whether v1 is **local first**, recommending yes. Every product epic then runs on your machine with local stand-ins: SQLite or Docker Postgres, local storage, a dev login, console email, test-mode payments. Cloud accounts, domains, secrets and deploys go into one **Go live** epic, last and blocking nothing, or stay in Not yet scoped until you decide to go live. The exception is a product whose core is an integration (e.g. Stripe Connect): it gets one narrow human task for that service, not an infrastructure epic up front.
- `/brief` records local first as an already-decided line in the epic's brief.
- Wayfinder on autopilot, on a local-first epic, uses a local stand-in instead of parking a human task, and notes the real service for Go live.

Existing initiatives keep their current order. To move one to local first, re-run `/scope-decomposer <initiative>`: it can only change epics that have no map yet.
