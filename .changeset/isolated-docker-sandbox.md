---
"imick-skills": minor
---

**Agent loop: an isolated Docker sandbox, opt-in with `AGENTS_SANDBOX=isolated`.** On Docker Desktop for Mac, a sandbox's dependency install writes `node_modules` across the worktree's bind mount, which can take over 10 minutes (one project measured 10 min 35 s for a pnpm install, 12 s natively) and hit the loop's install timeout. With `AGENTS_SANDBOX=isolated`, sandboxes on a branch get the repo copied in as a git bundle and send their commits back as patches, with nothing of the checkout mounted. The install runs on the container's own disk (about 15–25 s on a quiet machine), and a sandbox can't touch your checkout.

- **`isolated-docker.mts`** (new, copy it into `.sandcastle/`): a Sandcastle isolated provider on the `docker` CLI, using Sandcastle's public API only. The package caches live in one Docker volume shared by every sandbox, at the same path as before, so install commands and environment don't change. Containers are labelled, and each pass removes those a failed or interrupted run left behind (Sandcastle doesn't close a sandbox whose setup failed).
- **`main.mts`**: the `AGENTS_SANDBOX` switch, defaulting to the bind mount as before. The job that resolves `main` into an epic branch keeps the bind mount, because patches can't carry a merge commit. pnpm installs pass the store explicitly (`--store-dir`), matching the environment.
- **Fix, either mode:** the unblock and follow-up jobs run on your own checkout and only read, but they carried the install hook. So they installed Linux dependencies into your host `node_modules`, several at once, breaking `npm run agents` (see mattpocock/sandcastle#745). They no longer install.
- **Fix:** a type gap in `planJobs` from the `manual` label (`manual: false`, since manual epics are skipped just above).
- **Prompts:** implement and bug agents are told not to merge other branches into theirs.
- **Docs:** "Sandbox speed on a Mac" in `new-project.md`, a troubleshooting row, and the research behind it in `docs/research/` (Mac container runtimes, cloud sandboxes).

Existing setups: copy `main.mts`, `isolated-docker.mts`, `implement-prompt.md` and `bug-prompt.md` into `.sandcastle/` (keeping your own changes), then set `AGENTS_SANDBOX=isolated` in `.sandcastle/.env` and restart the loop to try it.
