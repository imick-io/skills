---
name: update-imick-skills
description: Upgrade a project to the latest release of imick-io/skills in one pass - the installed skills, new skills on offer, the agent loop's files in .sandcastle/ (merged with the project's own changes), the tracker, new triage labels, and every "Existing setups" step the release notes ask for - then a branch and a PR. Use when the user wants to update, upgrade or sync the imick skills, or /whats-next reports skills or loop files behind upstream.
disable-model-invocation: true
argument-hint: "[--to vX.Y.Z] [--yes] [--dry-run]"
---

# Update imick-skills

One command to take a project from the release of [imick-io/skills](https://github.com/imick-io/skills) it is on to the newest one. The skills CLI updates the skill folders but nothing else: the agent loop's files, the tracker, new labels and the manual steps in each release's notes have always been copied by hand from the changelog. This skill does all of it, shows the plan first, and lands it as a PR.

[scripts/update-imick-skills.mjs](./scripts/update-imick-skills.mjs) does the deterministic half; run it from the project's repo root as `node <this skill>/scripts/update-imick-skills.mjs <command>`. Below, `update` means that.

## 1. Where the project stands

`update plan` (add `--to vX.Y.Z` for a release other than the newest) prints JSON and changes nothing.

- **`installed: null`**: the project has no `docs/agents/imick-skills.md` yet. Ask the person which release they are on. A good answer is the newest release whose "Existing setups" steps are all already applied; show them the changelog's version list if they are unsure. Then `update record --version X.Y.Z` and plan again. Without a version, customized loop files can only be copied or merged by hand, since there is no old template to merge from.
- **`upToDate: true`**: say so and stop.

## 2. Show the plan, ask once

Read the plan and present it as one message, in this order:

1. **Skills.** `skills.changed`: reinstalled in the layout the repo uses (`layout`: `copies` or `symlinks`, never mixed). `skills.new`: list each with its description and ask which to add; mark the ones an installed skill names (grep the installed `SKILL.md`s for the name). Nothing new is added unasked. `skills.goneUpstream`: say they stay as they are.
2. **Loop files** (`loop`): per file, the state and the action: `copy` (missing, or equal to the installed version's template, so it carries no project change), `merge3` (customized: a three-way merge between the installed template, the new template and the project's file), `merge-outside-block` (the Dockerfile: the new template with the project's `# --- project additions ---` block kept), `ask` (`.env.example`: list `newKeys` and ask which lines to bring over; typically the generic ones, never project secrets' names the project already has), `by-hand` (customized and no installed version to merge from: you diff and port the change yourself after `apply`).
3. **Tracker** files to copy, **labels** to add (row plus `gh label create`), and the **changelog steps** (`changelog.steps`): say which the script does itself (copies, labels, record) and which stay for the person (a new secret, an env flag, an image rebuild).
4. If `loopRunning`, say the loop picks `main.mts` up on its next start; never stop it.

Then ask once: proceed? `--yes` on the invocation skips the question; `--dry-run` stops here.

## 3. Apply

Save the plan to a file and run `update apply <plan.json> --skills <chosen,new,skills> --env-keys <chosen,keys>` (`--no-labels` to skip the GitHub side). Read the result:

- **`conflicts`**: files where the three-way merge left markers (`<<<<<<< project`). Resolve each by hand: keep the project's customization and take the template's change, as a careful maintainer would; then re-read the file top to bottom. The loop's `main.mts` must stay valid TypeScript: `node --check` won't parse `.mts` with types, so run the project's typecheck if it covers `.sandcastle/`, else read carefully.
- **`manual`**: things the script couldn't do; do them or list them.
- **`imageRebuild`**: the Dockerfile changed. Offer `npx sandcastle docker build-image`; run it only on a yes (it takes minutes and needs Docker).
- **`steps`**: the changelog's manual steps; tick off what `done` covers and list the rest for the person.

## 4. Land

On a branch `chore/imick-skills-<version>`: commit everything the apply touched (`.claude/skills` or `.agents/skills`, `skills-lock.json`, `.sandcastle/`, `tracker/`, `docs/agents/`), push, and open a PR whose body is the changelog entries between the versions (from the plan's `changelog.versions`, read in the release's `CHANGELOG.md`) plus what was merged by hand and what the person still has to do. If the loop runs, say in the PR that it picks the new `main.mts` up on restart.

## Rules

- **Never overwrite a customization.** A loop file that differs from the installed version's template is merged, never replaced; the Dockerfile's project block is kept verbatim; `.env.example` only gains lines the person chose.
- **One layout.** Copies stay copies, symlinks stay symlinks; the bare CLI's default (symlinks into `.agents/skills/`) is applied only to a repo already on it.
- **The record is the truth.** `docs/agents/imick-skills.md` names the version; the skill updates it at the end of every apply, and `/setup-imick-skills` writes it on install.
- **No commits by the script, no loop stops, no image builds** without the person's yes.
