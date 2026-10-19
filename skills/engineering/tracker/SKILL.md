---
name: tracker
description: Build and open the issue tracker page, a snapshot of the repo's GitHub issues showing what you act on next, the epics' roadmap and each epic's board and blocking graph. Use when the user wants to see the tracker, what's waiting on them, or where the epics stand.
---

# Tracker

[build.mjs](./build.mjs) pulls every issue of the current repo with `gh` and writes `tracker/index.html`, one self-contained page with four tabs:

- **Action items**: everything waiting on a person (`ready-for-human`, `ready-for-review`, epics to brief, specs to approve, finished epics whose PR waits for a merge), with each issue's acceptance-criteria checklist and how many open issues it holds up, directly or down the chain.
- **Specs**: each spec, whether it's approved, and the decisions it lists.
- **Roadmap**: the epics in dependency order with their status and progress, and a progress table per ticket status.
- **Epic board**: one epic's tickets by status, and a diagram of what blocks what.

It reads the conventions set up by `/setup-imick-skills` and used by `/scope-decomposer`, `/wayfinder` and `/triage`: the triage labels, `epic` and `spec` labels, one milestone per epic, and GitHub's native issue dependencies for blocking. GitHub only.

## Steps

1. **Install it in the repo** if `tracker/build.mjs` doesn't exist yet: copy [build.mjs](./build.mjs) to `tracker/build.mjs`, and add `tracker/index.html` to `.gitignore`. The script lives in the repo so the agent loop and anyone without these skills can rebuild the page.
2. **Build and open**: `node tracker/build.mjs` from the repo root. It needs `gh` logged in with read access to the repo's issues. Use `--no-open` to only write the file.
3. Tell the user how many issues it read (the script prints it) and give the page's path.

The agent loop rebuilds the page before and after every pass when `tracker/build.mjs` exists, so a tab left open follows the loop after a reload.

When this skill's `build.mjs` is newer than the repo's copy, offer to copy it over.
