---
"imick-skills": minor
---

Sync Matt Pocock's skills up to his 1.3.1 (and later unreleased fixes).

- **`implement-spec`**, **`pr`** and **`retro`** graduate from `in-progress` to `engineering`, so they ship in the plugin. `ask-imick` routes them: `/implement-spec` builds a whole spec in one run on an integration branch, `/pr` shapes PR bodies, `/retro` closes the main flow.
- **`resolving-merge-conflicts` is removed**, as upstream: the agent works through conflicts without a dedicated skill.
- **`CONTEXT.md` is now `GLOSSARY.md`** (and `CONTEXT-MAP.md` is `GLOSSARY-MAP.md`) in every skill that reads or writes it, including `product-design` and `setup-imick-skills`. In a project set up before this, run `git mv CONTEXT.md GLOSSARY.md` (and the same for `CONTEXT-MAP.md`).
- `diagnosing-bugs` no longer hands off to `improve-codebase-architecture` from its post-mortem; cross-skill calls use the more reliable "Call the Skill tool" wording.
- `update-from-upstream`: detaching a skill now declines its upstream original, so it never comes back as a "new" skill.
