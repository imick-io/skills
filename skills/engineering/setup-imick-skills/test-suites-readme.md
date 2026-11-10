# Test suites

The slow or special test suites of this repo, one file each. They don't run on every PR: an epic that touches what a suite covers gets a **Run \<suite\>** ticket (cut by `/to-tickets`, or by the agent loop from the epic's diff before it opens the PR), and the tracker's **Test suites** tab shows which suites are stale since their last run.

A suite belongs here, not in the per-PR CI, when it takes more than about 5 minutes, needs a device, an emulator or a service CI doesn't have, or burns Actions minutes out of proportion with what it catches. Fast tests that cover the same code stay in CI; a suite here is the final check, not the only one.

## A suite file

`test-suites/<name>.md`, frontmatter first, then a paragraph for people:

```md
---
name: android-e2e
command: pnpm mobile:e2e:android
covers:
  - apps/mobile/**
  - packages/schema/**
  - packages/ui/**
takes: 40m
runs-via: workflow mobile-e2e.yml
---
Maestro flows on an Android 34 emulator: navigation, offline sync and the
camera flows that unit tests can't see.
```

- **name**: the file's name without `.md`; a Run ticket is titled `Run <name>`.
- **command**: what runs the suite, from the repo root.
- **covers**: path globs (`**` crosses folders). A change to any of them makes the suite worth running; a Run ticket is cut when an epic touches one, and the tracker marks the suite stale when `main` moved on one since its last run. List what the suite depends on, not only what it tests: a schema package the app imports belongs here too.
- **takes**: how long a run takes, measured. For people and for the planner.
- **runs-via**: who can run it.
  - `sandbox`: an agent runs `command` in its sandbox and reads the result.
  - `workflow <file>`: an agent starts that GitHub Actions workflow on the branch under test (`gh workflow run <file> --ref <branch>`) and waits for it. For suites that need an emulator, KVM or hardware the sandbox lacks. The workflow needs a `workflow_dispatch` trigger, and the loop's `GH_TOKEN` needs **Actions: read and write**.
  - `human`: a person runs it. The Run ticket is labelled `ready-for-human`.

## A Run ticket

Title `Run <name>`, labels `suite-run` plus `ready-for-agent` (or `ready-for-human`), in the epic's milestone when it belongs to one, blocked by every other ticket of the epic so it runs last, on the finished branch. The agent (or person) runs the suite:

- **green**: closes the ticket with a comment naming the commit tested and linking the run (`Ran <name> on <sha>: green. <link>`). The tracker reads that commit to tell when the suite goes stale.
- **red**: files one `bug` + `ready-for-agent-debugging` ticket per failure, in the same milestone, and marks the Run ticket blocked by each. It stays open and runs again once they're fixed.

An epic's PR to `main` only opens once no ticket in its milestone is open, so the epic ships only after its suites passed. A Run ticket outside an epic (started from the tracker when a suite is stale) runs against `main`, and its failures become standalone bugs.
