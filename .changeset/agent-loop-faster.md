---
"imick-skills": minor
---

Agent loop: faster, with less waiting between and inside tickets (#40).

- **A run that finished no longer counts as failed** (#33). When an agent prints its completion signal and then hangs until the idle timeout (usually a server it left running), the loop counts the run as done and moves on. Agents are now told to stop every process they started before finishing. One ticket that can't land, or one epic check that fails, no longer stops the rest of the pass, and a failed check's leftover worktree is cleaned up.
- **A failed pass is retried in 5 minutes, not 45** (#34). The wait doubles with each failure in a row, up to `AGENTS_IDLE_MINUTES`; set it with `AGENTS_RETRY_MINUTES`.
- **Fast installs in the sandbox** (#35). The install command follows the lockfile (`pnpm install --frozen-lockfile`, `yarn install --immutable` or `npm ci`) with a 10-minute limit, and every sandbox shares one package store in `.sandcastle/cache/`, so a warm install only links packages. The host's `node_modules` is no longer copied in. The image moves to Node 24 with corepack enabled, so pnpm and yarn work without agents setting them up.
- **Services ready before the agent starts** (#36). A project whose tests need a database or a cache installs it in the Dockerfile's new `# --- project additions ---` block and starts it in `.sandcastle/sandbox-setup.sh`, which writes its exports to `.sandcastle/sandbox-env`. Agents source that file instead of installing their own Postgres or Redis. `/setup-imick-skills` now asks about this.
- **No new check for loop or docs changes** (#37). A new commit on a verified epic PR that only changes files matching `AGENTS_VERIFY_SKIP` (default `.sandcastle/**,.claude/**,docs/**,*.md,tracker/**`) keeps the green `verify-epic` status, without a 10–15 minute run.
- **More tickets side by side** (#38). `/to-tickets` prefers wide batches with few `blocked by` links, reports each batch's shape ("7 tickets, at most 4 at once, longest chain 3"), and suggests a wider split when one chain covers more than half the tickets. `/verify-epic` files its gaps as independent tickets. The planner says in its log why it picked fewer tickets than `AGENTS_MAX_PARALLEL` allows.

Existing setups: copy the new `main.mts`, the prompts and the `Dockerfile` into `.sandcastle/` (keep your own Dockerfile changes inside the project-additions block), add `cache/` and `sandbox-env` to `.sandcastle/.gitignore`, and rebuild the image with `npx sandcastle docker build-image`. If you had replaced the install hook by hand (e.g. for pnpm), the new `main.mts` does that for you.
