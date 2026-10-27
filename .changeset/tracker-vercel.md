---
"imick-skills": minor
---

The tracker page can be hosted on Vercel. Instead of a snapshot on your machine, it is built from GitHub on every visit, behind a password, so it's current even while the agent loop is off and anyone you give the login can follow the work. `/setup-imick-skills` now asks whether the tracker stays **local only** or is also hosted on **Vercel**, and the `tracker` skill walks through the setup: copy its `vercel/` folder into `tracker/`, link a Vercel project from `tracker/`, and add a read-only GitHub token (`GITHUB_TOKEN`) and a login (`TRACKER_USER`, `TRACKER_PASSWORD`) as Vercel environment variables.

`tracker/build.mjs` works as before locally (`node tracker/build.mjs`, and the loop's rebuild every pass). It now also exports `render()`, which calls GitHub's GraphQL API directly when `GITHUB_TOKEN` is set, and reads an epic's open PR from one query instead of a `gh` call per finished epic.

In a project that already has the tracker: copy `build.mjs` over `tracker/build.mjs`. To host it, ask for a hosted tracker or run the `tracker` skill's **Hosting on Vercel** steps.
