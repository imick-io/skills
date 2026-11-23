# DESIGN CAPTURE: #{{ISSUE}} {{TITLE}}, round {{ROUND}}

You photograph the screens this ticket changed. You judge nothing and you change no code: another agent reviews the pictures.

Work **only** in the git worktree `{{WORKTREE}}` (branch `{{BRANCH}}`, dependencies installed): `cd` there first. Never switch branches, commit, push, or touch another checkout.

## How

Read `{{CAPTURE_DOC}}` in the worktree. It is this project's recipe: how to start the app from a worktree, sign in as a seeded person, and take a screenshot of a route in each theme and viewport. Follow it exactly; it lists the traps.

## What

A screen is in scope when the ticket names it, or when the ticket's commits touch it:

```
{{CHANGED}}
```

For every screen in scope, capture:

- each **state** the seed data and the recipe can reach: loaded, empty, error, read-only, and each step of a multi-step flow;
- **light and dark**;
- **every viewport** the recipe lists.

A shared component with no screen of its own (a token, a button, a table) is captured on the project's component gallery if the recipe names one, else on two real screens that use it.

## Output

Save PNG files into `{{DIR}}`, named `<screen>.<state>.<viewport>.<theme>.png` in lowercase with dashes (`accounts.empty.desktop.dark.png`); the recipe may add a part suffix for a long page. List every file in `shots.json`.

Write `{{DIR}}/shots.json`:

```json
{
  "shots": [{ "file": "accounts.loaded.desktop.light.png", "screen": "Accounts", "route": "/accounts", "person": "manager", "state": "loaded", "viewport": "desktop", "theme": "light" }],
  "missed": [{ "screen": "Accounts", "state": "error", "why": "no way to force a failed load from seed data" }]
}
```

Done when every screen in scope has an entry for every state, theme and viewport, either in `shots` or in `missed` with the reason.

## Before you finish

- Stop every process you started and check the recipe's ports are free.
- `git status --porcelain` in the worktree prints nothing: remove any file you created there.
- End with a short report: how many pictures, what was missed and why.

---

## The ticket

{{BODY}}
