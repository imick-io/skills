---
"imick-skills": minor
---

A new skill, **`/update-imick-skills`**: upgrade a project to the latest release of these skills in one pass, with a plan first and a PR at the end. Until now `npx skills update` refreshed the skill folders and everything else in a release was copied by hand from the changelog's "Existing setups" lines.

- **Skills**: reinstalls the ones that differ upstream in the layout the repo already uses (real folders or symlinks, never mixed), and offers the upstream skills the project doesn't have, each with its description; nothing new is added unasked.
- **Agent loop files** (`.sandcastle/`): a file equal to the installed version's template is copied; a customized one is three-way merged (installed template, new template, the project's file) with conflicts left for the agent to resolve; the Dockerfile takes the new template with the `# --- project additions ---` block kept; `.env.example` only gains the lines you pick.
- **Tracker** (`build.mjs`, the Vercel files when hosted), **new triage-label rows** (with `gh label create`), and the **release notes' steps** between the installed version and the target: the mechanical ones done, the rest listed for you (a new secret, an image rebuild offered, never run unasked).
- **A version record**, `docs/agents/imick-skills.md` (`Version:`, `Layout:`), written by this skill and now by `/setup-imick-skills` on install; it is what makes the three-way merge and the changelog slice possible. On a project without it, the skill asks once which release you are on.
- `/whats-next` now points its drift rung at `/update-imick-skills`.

Existing projects: `npx skills add imick-io/skills --skill update-imick-skills` (add `--copy -a claude-code` in a repo that keeps skills as real folders), then run `/update-imick-skills`; it asks for your current version the first time.
