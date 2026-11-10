---
"imick-skills": patch
---

**The tracker no longer renders empty.** Since 1.20.0, the page's script called the version comparison from the Progress table before defining it, so the first render threw `Cannot access 'verCmp' before initialization` and every tab stayed blank, locally and on Vercel. Existing setups: copy `skills/engineering/tracker/build.mjs` to `tracker/build.mjs` (`/update-imick-skills` does it), then rebuild the page or redeploy the hosted tracker.
