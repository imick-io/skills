# imick-skills

My agent skills. `sources.json` maps every skill to where it comes from (my own, or an upstream source and the commit last synced); `/update-from-upstream` syncs upstream skills, and runs only in this repo.

## Changing anything

1. **Work on a branch and open a pull request**; `main` only moves through merged PRs.
2. **Add a changeset** in the same PR for any change to a skill, a shared workflow, or the setup templates: `npx changeset`, then write the changelog entry for someone using the skills, not for someone reading the diff. Pick the bump:
   - **patch**: a fix or wording change that doesn't change what the skill does
   - **minor**: a new skill, or new behaviour in an existing one
   - **major**: anything that breaks an existing setup: a new required secret, a renamed label, a changed caller workflow, a removed or renamed skill. Projects pinned to `@v1` stay on v1 until moved by hand.
   Repo plumbing (this file, CI, scripts) needs no changeset.
3. **Regenerate** after adding, removing or moving a skill: `python3 skills/misc/update-from-upstream/scripts/sync.py regen` rebuilds the README tables, `plugin.json`'s skill list and `THIRD_PARTY_NOTICES.md` from `sources.json`. Never edit those by hand.

## Releasing

Merging a PR with changesets makes the release workflow open (or update) the **"chore: version skills"** PR: it bumps the version, writes `CHANGELOG.md`, and syncs `plugin.json`. Merging that PR is the release: the workflow tags `vX.Y.Z`, publishes a GitHub Release, and moves the major tag (`v1`) that projects pin to.
