---
"imick-skills": patch
---

**`/update-imick-skills` keeps a symlinks repo's layout.** In a repo whose `.claude/skills` holds links into `.agents/skills`, the update reinstalled each changed or new skill as a plain folder in `.claude/skills`, over its link, and left the old version in `.agents/skills`. It now moves the new folder into `.agents/skills` and puts the link back. Existing setups updated by an earlier version: for each skill that is a plain folder in `.claude/skills` but a link in the rest of the repo, move it over the old copy in `.agents/skills` and link it back (`ln -s ../../.agents/skills/<name> .claude/skills/<name>`).
