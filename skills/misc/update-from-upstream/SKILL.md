---
name: update-from-upstream
description: Sync the skills in this repo with their upstream sources, merging upstream changes with local customizations; or `add <github-repo> <skill-path>` to import a skill from a new source.
disable-model-invocation: true
---

# Update from upstream

`sources.json` at the repo root is the **map**: every skill folder, the source it comes from (or `own`), its upstream path and name, and the upstream commit it was last synced at. `scripts/sync.py` (relative to this skill) does the mechanical work; you do the judgement: resolving conflicts and asking the user.

Run every command as `python3 <this skill>/scripts/sync.py <command>` from the repo root.

## Sync (no arguments)

1. **Gate.** Run `check`. If it fails on uncommitted changes, stop and ask the user to commit or stash first. If it fails on a skill folder missing from the map, ask the user where it came from and add its entry to `sources.json` before continuing.

2. **Structural changes.** Run `prepare`. It fetches every source and reports, per source:
   - `added`: new upstream skills in sources that follow the whole repo.
   - `moved`: a tracked skill found at a new upstream path (e.g. promoted from `in-progress/` to `engineering/`).
   - `deleted`: a tracked skill gone upstream.

   For a source that keeps a changelog (`changelog_path` in `sources.json`), `prepare` also prints the entries added since the last sync. Use them: they give the source's own reasons for each change, so quote the relevant entry with every structural question, and when resolving conflicts in step 4.

   Put all of them to the user in **one** round of questions, each with the skill's description, the source's changelog entry when there is one, and your recommendation:
   - added → `accept-new <source> <upstream_path>` (lands at the same category path, `--local-path` to override), or `decline <source> <upstream_path>` (remembered, never offered again).
   - moved → `move <local_path> <new_upstream_path>`, adding `--new-local-path` if the user wants the local folder to follow the new category.
   - deleted → `remove <local_path>`, or `detach <local_path>` to keep it as the user's own.

   Nothing structural is decided without the user. If the report is empty, skip straight to step 3.

3. **Content.** Run `merge`. For each file of each tracked skill it compares three versions: **base** (upstream at the last sync), **theirs** (upstream now) and **yours** (the repo). Upstream text is rewritten with the user's skill renames first, so a renamed skill never shows up as a change. It then:
   - `take`: only upstream changed. Written.
   - `merged`: both changed, and the text merge was clean. Written.
   - `conflict`: both changed the same passage. Staged under `.git/update-from-upstream/conflicts/<path>.{base,theirs,yours,merge-attempt}`; the repo file is untouched.

4. **Resolve conflicts.** For each conflict, read the staged versions and write the merged file into the repo: upstream's latest with the user's customization carried over. Work out what each side _intended_ from base→theirs and base→yours, and merge the intents, not just the lines. Ask the user only on a **collision**:
   - both sides changed the same passage to say different things,
   - an upstream change contradicts or undoes a customization,
   - or upstream restructured the file so the customization has no obvious home.

   Batch every collision into one round, showing theirs and yours side by side with your recommended resolution. Every other conflict you resolve yourself. Also re-read each `merged` file: a clean text merge can still read wrong (a customization now referring to a step upstream removed); fix those or raise them as collisions.

5. **Finalize.** Run `finalize`. It refuses while conflict markers or undecided moves remain. It bumps every synced skill to the source's current commit and regenerates `.claude-plugin/plugin.json`, the README skills tables and `THIRD_PARTY_NOTICES.md`.

6. **Report**, and leave everything uncommitted. The summary lists:
   - taken from upstream (per source),
   - merged both sides, flagged for review in the diff,
   - the user's decisions (accepted, declined, moved, removed, detached, collisions),
   - and a suggested commit message naming each source's new short commit, e.g. `Sync upstream: mattpocock/skills@abc1234, cursor/plugins@def5678`.

   `git checkout . && git clean -fd` discards the whole sync.

## Add a source (`add <github-repo> <skill-path>`)

Run `add <github-repo> <skill-path> --category <category>`, where `<category>` is the folder under `skills/` (`engineering`, `productivity`, `misc`, `in-progress`). Ask the user which category if they didn't say. Optional flags:
- `--name <local-name>` to import it under a different name,
- `--display "<Author>"` for the Source column,
- `--license-path <path>` when the license isn't at the repo root (the command refuses without a license),
- `--source-id <id>` to reuse a known source.

A new source follows only the skills imported from it. To follow a whole repo instead, set its `track` to `all` and its `skills_root` in `sources.json`. Leave the import uncommitted and report what was added.
