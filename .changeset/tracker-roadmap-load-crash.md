---
"imick-skills": patch
---

The tracker page loads again. Since v1.22.0 it stopped on load with `ReferenceError: Cannot access 'outsideTickets' before initialization`, so the roadmap never rendered. Copy the new `tracker/build.mjs` into your project to pick up the fix (#103).
