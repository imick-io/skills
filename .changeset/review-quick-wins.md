---
"imick-skills": patch
---

**Fixes from a review of the whole repo.**

- **`/update-imick-skills` no longer deletes a project's `.agents` folder.** Its cleanup of a stray `.agents` (left by the skills CLI in a project that keeps copies in `.claude/skills`) also fired in projects whose skills live in `.agents/skills`, removing the skills it had just installed, and could stop the update halfway. It now removes only a folder that this run created and that holds nothing but skills already copied into `.claude/skills`.
- **`epic-gate` survives any milestone title.** An apostrophe in an epic's name ("User's profile") broke the check on every ticket close; the title now reaches the script as a variable.
- **Agents' hand-back comments are recognised as theirs.** The loop's build, bug and suite prompts had the agent open a hand-back with `**Needs you:**`, without the AI disclaimer the loop uses to tell its own comments from yours, so such a comment could count as your answer. They now open with the disclaimer, then the `**Needs you:**` line; the tracker still shows that line.
- **Setup copies `isolated-docker.mts`.** `/setup-imick-skills` and the README's by-hand steps left it out of the list of loop files, though `main.mts` imports it.
- The README, `mac-setup.md` and the plugin's descriptions say what is there now: the full `GH_TOKEN` permissions `verify-epic` needs, every loop file, and what the plugin contains.

**Existing setups.** Run `/update-imick-skills`: it brings the three prompts over. Nothing else to do.
