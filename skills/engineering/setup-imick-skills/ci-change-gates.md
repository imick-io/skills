# CI that skips what didn't change

A PR to `main` that touches one app shouldn't pay for every app's database setup, Playwright install and end-to-end run. What makes CI long is rarely the cached tasks (lint, types, build, unit tests: Turbo replays a hit in seconds) but the steps around them, which no cache covers: starting services, seeding a database, installing browsers, running e2e, building an Android app. Those are skipped by deciding first, in a small job, what changed, and gating each expensive **step** on that answer.

## The shape

```yaml
on:
  pull_request: { branches: [main] }
  push: { branches: [main] }
concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }

env:
  # The commit `--affected` compares against. Without it Turbo can't resolve
  # `main` on a PR checkout and errors out.
  TURBO_SCM_BASE: ${{ github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event.before }}

jobs:
  changes:                     # always runs, decides the rest
    runs-on: ubuntu-latest
    outputs:
      db: ${{ steps.filter.outputs.db }}
      e2e: ${{ steps.filter.outputs.e2e }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0, filter: blob:none }   # a shallow checkout makes everything "changed"
      - id: filter
        uses: dorny/paths-filter@v3
        with:
          filters: .github/ci-filters.yml

  ci:                          # always runs, so its name always reports
    needs: changes
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0, filter: blob:none }
      - uses: ./.github/actions/setup
      - run: pnpm turbo run lint check-types build test ${{ github.event_name == 'pull_request' && '--affected' || '' }}
      - if: needs.changes.outputs.db != 'false'              # "run" when `changes` failed
        run: pnpm db:setup && pnpm check:drift
      - if: github.event_name == 'pull_request' && needs.changes.outputs.e2e != 'false'
        run: pnpm exec playwright install --with-deps chromium && pnpm e2e

  ci-ok:                       # the one required check
    if: always()
    needs: [changes, ci]
    runs-on: ubuntu-latest
    steps:
      - run: '[[ "${{ contains(needs.*.result, ''failure'') || contains(needs.*.result, ''cancelled'') }}" == "false" ]]'
```

`.github/ci-filters.yml` lists what each gate **covers**, the way a test suite file does, not what it excludes: an exclusion list lets every new folder through until someone adds it.

```yaml
db:
  - 'apps/api/src/db/**'
  - 'apps/pricing/**'
  - '.github/workflows/ci.yml'
e2e:
  - 'apps/**'
  - 'packages/**'
  - 'pnpm-lock.yaml'
  - 'turbo.json'
  - 'scripts/e2e.mjs'
  - '.github/workflows/ci.yml'
```

## Why each piece

- **Turbo's own graph for the Turbo tasks.** `turbo run <task> --affected` runs the packages a PR changed **and the packages that depend on them**, from the workspace graph: no list to keep up to date. It needs the full history (`fetch-depth: 0`) and `TURBO_SCM_BASE`; with a shallow checkout or an unresolved base it silently runs everything (safe, no savings). A change to the root `package.json`, `turbo.json` or a global dependency runs everything.
- **The graph must be true.** `--affected` and the cache both trust it. A test that spawns another package's process or reads another package's migrations, with no `workspace:*` dependency between them, is skipped or replayed from cache when only that other package changed. Declare such links: a `workspace:*` devDependency, or that package's files in the task's `inputs` (`$TURBO_ROOT$/apps/api/src/db/migrations/**`).
- **Path filters for what Turbo can't see.** Root scripts, services, browser installs and e2e aren't Turbo tasks. `dorny/paths-filter` reads the PR's changed files from the API (no checkout needed) and the push's from git. Put the workflow file and root scripts in every filter, or a CI change won't test itself.
- **Gate steps, not jobs, and keep one aggregator.** GitHub counts a job skipped by `if:` as passing, but a workflow skipped by a workflow-level `paths:` filter leaves its required check **pending forever**, and a merge gate of your own (the agent loop's `merge-gate.mts` in some projects) may read a skipped job as a failure. Steps skipped inside an always-running job avoid both, and `ci-ok` gives branch protection and the loop one name to require, whatever jobs come and go.
- **Default to "run".** Gates compare with `!= 'false'`, so a failed `changes` job runs everything, and `ci-ok` fails on a failed `changes`.
- **Push to `main` runs the Turbo tasks in full**, without `--affected`, so `main`'s cache is complete for the PRs that restore from it (a PR can only read caches from its own ref or `main`'s). The uncached steps (services, e2e, Android) don't run on push: the PR just passed them.

## What stays out

Suites that take tens of minutes, or need an emulator or a device, don't belong behind a gate on every PR either: they go in `test-suites/` and run through **Run \<suite\>** tickets when an epic touches what they cover (see `test-suites/README.md`).
