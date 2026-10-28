---
"imick-skills": patch
---

Agent loop fix, pnpm projects: `pnpm <script>` in the sandbox no longer fails after the install. Since v1.6.0 the shared package store was passed only to the install (`--store-dir`). pnpm 11 checks the dependencies before every script, saw a different store, tried to reinstall, and stopped on a confirmation the sandbox can't give (`set "confirmModulesPurge" to "false"`). So `pnpm test`, `pnpm typecheck`, and the migrations in `sandbox-setup.sh` all failed. The store is now set in the sandbox's environment (`pnpm_config_store_dir` for pnpm 11, `npm_config_store_dir` for pnpm 9 and 10), so the install and every later command use the same one.

Existing setups: copy the new `main.mts` into `.sandcastle/`, or make the same change there: drop `--store-dir …` from the pnpm install command, and add both variables to the `env` passed to `docker()`.
