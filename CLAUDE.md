# imick-skills

My agent skills. `sources.json` maps every skill to where it comes from (my own, or an upstream source and the commit last synced); `/update-from-upstream` syncs upstream skills, and runs only in this repo.

## Changing anything

1. **Work on a branch and open a pull request**; `main` only moves through merged PRs.
2. **Add a changeset** in the same PR for any change to a skill, a shared workflow, or the setup templates: `npx changeset`, then write the changelog entry for someone using the skills, not for someone reading the diff. Pick the bump:
   - **patch**: a fix or wording change that doesn't change what the skill does
   - **minor**: a new skill, new behaviour in an existing one, or a removed or renamed skill (say how to migrate in the changeset, e.g. a file to `git mv`)
   - **major**: only a change that breaks the pinned workflows or their setup: a new required secret, renamed triage labels, a changed caller workflow. Projects pinned to `@v1` stay on v1 until moved by hand, so a major is reserved for what would break them.
   Repo plumbing (this file, CI, scripts) needs no changeset.
3. **Regenerate** after adding, removing or moving a skill, or changing a description or `docs/handbook.curated.json`: `python3 skills/misc/update-from-upstream/scripts/sync.py regen` rebuilds the README tables, `plugin.json`'s skill list, `THIRD_PARTY_NOTICES.md` and `docs/handbook.json` from `sources.json`. Never edit those by hand.

## The handbook page

[imick.io/skills](https://imick.io/skills) reads `docs/handbook.json` from `main` once a day. Its skill lines come from each `SKILL.md` description, cut before "Use when"; everything else (labels, stages, modes, the three flowcharts, which skill uses which, and an optional `summary` for a skill whose description reads badly) is hand-written in `docs/handbook.curated.json`. A new skill appears on its own, under its folder's group; give it an entry there to place it and draw its links. When a change moves the workflow (a new label, mode or step), update the curated file in the same PR.

## Releasing

Merging a PR with changesets makes the release workflow open (or update) the **"chore: version skills"** PR: it bumps the version, writes `CHANGELOG.md`, and syncs `plugin.json`. Merging that PR is the release: the workflow tags `vX.Y.Z`, publishes a GitHub Release, and moves the major tag (`v1`) that projects pin to.
