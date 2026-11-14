// Agent loop: works this repo's agent queue with Sandcastle, forever or once.
//
//   npm run agents                    loop: plan autopilot epics, work every
//                                     ready ticket, sleep when idle
//   npm run agents -- --once          one pass, then exit
//   npm run agents -- --no-planning   build only: leave epic planning to others
//   npm run agents -- --dry-run       what the next pass would do, changing
//                                     nothing; safe beside a running loop
//                                     (--json for scripts: /why-sleeping)
//   npm run agents -- --epic=1,2      only these epics: their planning,
//                                     tickets, conflicts with main and PR;
//                                     exits once every one is closed
//   npm run agents -- --tickets=3,4   only these tickets; exits once none is
//                                     left to build (landed, in a PR, or
//                                     handed to a person). Both flags
//                                     combine, with each other and with the
//                                     ones above; a scoped run never triages
//   npm run agents -- --area=mobile   only epics labelled area:mobile (or
//                                     area:mobile:<part>) and the tickets
//                                     outside epics labelled so; `none` is
//                                     what has no area label. Runs on like
//                                     an unscoped loop. Give each machine its
//                                     own areas and their loops never touch
//                                     the same epic branch or ticket
//   npm run agents:awake              the loop under `caffeinate -i`: the Mac
//                                     doesn't idle-sleep while it runs (macOS)
//   npm run agents:stop               ask a running loop to stop nicely: it
//                                     starts nothing new, lets in-flight
//                                     tickets land, then exits. Ctrl-C quits
//                                     at once instead (Sandcastle tears the
//                                     sandboxes down and exits), but releases
//                                     the loop's claims first so the next run
//                                     starts clean
//
// Runs on Node directly (type stripping), not through tsx: tsx runs the script
// in a child process and, on Ctrl-C, SIGKILLs that child when it doesn't
// acknowledge the signal within a few ms, which is whenever the loop is inside
// a `gh` or `git` call. The SIGINT handler below then never runs and tickets
// stay claimed. Keep the syntax erasable (no enums, parameter properties or
// decorators) so Node keeps accepting it.
//
// Planning only touches epics labelled `autopilot` (chosen at the end of their
// /brief): chart and resolve their wayfinder map, write the spec for your
// review, and cut tickets once you approve it. Other epics are planned by hand.
// An epic labelled `manual` is planned AND built by hand: the loop never
// plans it, never queues or unblocks its tickets whatever they're labelled,
// and never opens or verifies its PR.
//
// One pass:
//   0. Triage (AGENTS_TRIAGE=1, in place of the GitHub triage workflow): new
//      issues with no triage label, `needs-info` issues the reporter answered
//      since the last triage note, and anything left on `needs-triage` get an
//      unattended /triage run each, after the tickets have started; what
//      comes out ready-for-agent is picked up by the next pass, at once.
//   1. Queue: open, unassigned, unblocked issues labelled ready-for-agent or
//      ready-for-agent-debugging. Specs are skipped (they're read by
//      /to-tickets, never built directly). A `suite-run` ticket ("Run
//      <suite>", for a slow suite in test-suites/) is run, not built: green
//      closes it, red files bugs it then waits on.
//   2. Plan: an agent picks the tickets that can safely run in parallel,
//      beside the ones already building, to fill the free slots.
//   3. Claim each one (assignee = claimed), prepare its branch: tickets under
//      an epic branch off the epic branch, after `main` is merged into it;
//      the others branch off `main`.
//   4. Execute + review: one Docker sandbox per ticket, running /implement or
//      /debug-and-fix, then a review pass. Each ticket is its own job: the
//      pass doesn't wait for it, and the loop passes again as soon as one
//      lands, so a free slot is refilled without waiting for a whole batch.
//   5. Land: epic tickets merge into the epic branch and close; the others
//      get a PR with "Fixes #n". An epic with no open tickets left gets its
//      PR to main ("Closes #epic"), unless its diff touches what a suite in
//      test-suites/ covers and no "Run <suite>" ticket ran: that ticket is
//      filed first, and the PR waits for it.
//   6. Verify: an epic PR whose milestone is empty is checked with
//      /verify-epic, once per commit, beside the tickets; its failures become tickets that the
//      next pass picks up, and its status feeds the epic-gate merge check. A
//      commit that only changes loop or docs files (AGENTS_VERIFY_SKIP) keeps
//      the last green status instead of running the check again.
//
// Fast mode (AGENTS_MODE=fast for the whole project, or the `fast` label on
// one epic) is for projects that value speed over review: personal projects,
// MVPs. The loop unblocks what would wait on you:
//   - a `ready-for-human` issue gets an agent that answers it when it's
//     confident enough (AGENTS_THRESHOLD, 70 by default) and sends it
//     back to the agents, or asks you on the issue and pings you in Slack;
//     your comment there is the answer, applied on the next pass,
//   - an autopilot spec is approved when no decision is below the threshold;
//     otherwise you're asked about the ones that are,
//   - an epic PR whose verification passed is merged to main.
//
// Supersonic mode (AGENTS_MODE=supersonic, or the `supersonic` label) goes
// further for throwaway MVPs: /scope-decomposer writes every epic's brief in
// its one interview, a call below the threshold that can be undone is
// assumed instead of asked (`agent:assumed`), specs are always approved, and
// the assumptions reach you in one Slack digest a day. Your comment on an
// assumed issue becomes a follow-up ticket when it differs. What can't be
// undone (money, credentials, personal data, deleting, publishing) is still
// asked, and waited for.
//
// Waiting (idle, or for a busy slot) the loop looks at GitHub every
// AGENTS_POLL_MINUTES: when an issue or PR changed (you approved, answered,
// merged, labelled; a ticket became ready), it passes again at once instead
// of sleeping out the idle time. Changes on the tickets it's building don't count.
//
// A job that fails, or runs and changes nothing (a build, a planning run,
// an unblock, a follow-up, a conflict resolution), backs off: tried again
// after AGENTS_RETRY_MINUTES, doubling up to 4 h, with a Slack alert at the
// third strike. It no longer counts as work, so the loop can sleep.
//
// With nothing building, a planner that picks none of the ready tickets is
// overruled: the oldest starts. Each pass logs why ready tickets didn't start,
// and a claim lost to someone else is looked at again after AGENTS_RETRY_MINUTES.
//
// In every mode, main conflicting with an epic branch pauses that epic and
// files a "Resolve conflicts" issue; an agent then resolves the merge on the
// epic branch (you review it in the epic's PR), and only when it can't is
// the issue asked of you. A `manual` epic's conflicts stay yours.
//
// Once an epic's PR is open, pushes to its branch are batched for CI: a push
// with more of the epic's tickets still building says [skip ci], and the
// batch's last push (or an empty commit after it) runs CI once.
//
// The loop's state (passing, building, asleep until when, the jobs in
// backoff, what the last pass couldn't start) is kept in
// .git/agent-loop-status.json, for /why-sleeping and --dry-run.
//
// On start, it cleans up after a loop in this folder that died without
// cleaning up (a crash, a power cut, kill -9): the claims and agent:planning /
// agent:unblocking labels that loop held (.git/agent-loop-held.json), and the
// ticket, planning and check worktrees its sandboxes left checked out.
//
// Before and after every pass the issue tracker page (tracker/index.html)
// is rebuilt, so an open tracker tab follows the loop.
//
// Adapted from Sandcastle's parallel-planner-with-review template
// (https://github.com/mattpocock/sandcastle, MIT).

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { isolatedDocker, sweepContainers } from "./isolated-docker.mts";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration (env overrides, e.g. in .sandcastle/.env or the shell)
// ---------------------------------------------------------------------------

const ONCE = process.argv.includes("--once");
const DRY_RUN = process.argv.includes("--dry-run");
const JSON_OUT = process.argv.includes("--json");
const PLANNING = !process.argv.includes("--no-planning");
// A scoped run (--epic=1,2, --tickets=3,4 and/or --area=mobile,crm;
// `--epic 1,2` works too) works only on what it names. An epic in scope brings everything under it:
// its planning, its tickets, its conflicts with main, its PR and its check.
// A ticket in scope is built, and nothing else. Triage is off: new issues are
// out of scope by definition. Fast mode's unblocking keeps to the scope too.
// An --epic/--tickets run exits once nothing in scope is left (scopeLeft);
// one with --area runs on, since new epics and tickets keep arriving in an area.
function flagValues(names: string[]): string[] | undefined {
  const argv = process.argv.slice(2);
  let values: string[] | undefined;
  argv.forEach((arg, i) => {
    const eq = arg.indexOf("=");
    const flag = eq < 0 ? arg : arg.slice(0, eq);
    if (!names.includes(flag)) return;
    values = [...(values ?? []), ...(eq < 0 ? argv[i + 1] ?? "" : arg.slice(eq + 1)).split(",")];
  });
  return values?.map((v) => v.trim()).filter(Boolean);
}
function listFlag(names: string[]): Set<number> | undefined {
  const values = flagValues(names);
  if (!values) return undefined;
  const numbers = values.map((v) => v.replace(/^#/, ""));
  if (!numbers.length || numbers.some((v) => !/^\d+$/.test(v))) {
    console.error(`[agents] ${names[0]} takes issue numbers, comma-separated: ${names[0]}=12,14`);
    process.exit(1);
  }
  return new Set(numbers.map(Number));
}
const SCOPE_EPICS = listFlag(["--epic", "--epics"]);
const SCOPE_TICKETS = listFlag(["--tickets", "--ticket"]);
// Areas as named in docs/agents/team.md, with or without the `area:` prefix.
const SCOPE_AREAS = (() => {
  const values = flagValues(["--area", "--areas"]);
  if (!values) return undefined;
  if (!values.length) {
    console.error("[agents] --area takes area names, comma-separated: --area=mobile,crm (`none`: issues with no area label)");
    process.exit(1);
  }
  return new Set(values.map((v) => v.replace(/^area:/, "")));
})();
const SCOPED = Boolean(SCOPE_EPICS || SCOPE_TICKETS || SCOPE_AREAS);
// Runs until its named epics and tickets are done; an area never is.
const SCOPE_ENDS = SCOPED && !SCOPE_AREAS;
const SCOPE_LABEL = [
  SCOPE_AREAS && `area ${[...SCOPE_AREAS].join(", ")}`,
  SCOPE_EPICS && `epic ${[...SCOPE_EPICS].map((n) => `#${n}`).join(", ")}`,
  SCOPE_TICKETS && `ticket ${[...SCOPE_TICKETS].map((n) => `#${n}`).join(", ")}`,
].filter(Boolean).join("; ");
// The areas on an issue: `area:mobile` and `area:mobile:shelf` are both in mobile.
const areasOf = (labels: { name: string }[]) => labels.map((l) => l.name).filter((l) => l.startsWith("area:")).map((l) => l.slice(5));
const areaInScope = (areas: string[]) => Boolean(SCOPE_AREAS) &&
  (areas.length ? areas.some((a) => [...SCOPE_AREAS!].some((s) => a === s || a.startsWith(`${s}:`))) : SCOPE_AREAS!.has("none"));
// Epic-level work (planning, the PR and its check, conflicts with main).
const epicInScope = (epic: { number: number; areas: string[] } | undefined) =>
  !SCOPED || (epic !== undefined && (Boolean(SCOPE_EPICS?.has(epic.number)) || areaInScope(epic.areas)));
// An issue: named itself, under an epic in scope, or outside epics with an area in scope.
const inScope = (n: number, epic: Epic | undefined, labels: { name: string }[]) =>
  !SCOPED || Boolean(SCOPE_TICKETS?.has(n)) || (epic ? epicInScope(epic) : areaInScope(areasOf(labels)));
// An epic straight from `gh issue list`, for epicInScope.
const listedEpic = (e: { number: number; labels: { name: string }[] }) => ({ number: e.number, areas: areasOf(e.labels) });
const IDLE_MINUTES = Number(process.env.AGENTS_IDLE_MINUTES ?? 45);
// After a failed pass (not a usage limit) the loop retries soon, doubling the
// wait for each failure in a row, up to AGENTS_IDLE_MINUTES.
const RETRY_MINUTES = Number(process.env.AGENTS_RETRY_MINUTES ?? 5);
// While it waits, how often the loop looks for changes on GitHub; 0 turns it off.
const POLL_MINUTES = Number(process.env.AGENTS_POLL_MINUTES ?? 2);
// A verified epic stays verified when every file changed since then matches
// one of these globs: a merge of loop or docs changes doesn't need a new check.
// What an epic blocked by other epics holds back. `epic` (default): all its
// tickets wait. `ticket`: only tickets with blockers of their own wait, so the
// rest start early; for tickets cut with a `blocked by` link to the other
// epic wherever they need its work (/to-tickets does). Autopilot planning of
// a blocked epic then goes ahead too, so it has tickets to start.
const EPIC_GATE = process.env.AGENTS_EPIC_GATE === "ticket" ? "ticket" : "epic";
// A pending epic check older than this is taken to have died, and run again.
const CHECK_STALE_MINUTES = 60;
const VERIFY_SKIP = (process.env.AGENTS_VERIFY_SKIP ?? ".sandcastle/**,.claude/**,docs/**,*.md,tracker/**")
  .split(",").map((g) => g.trim()).filter(Boolean);
const LIMIT_SLEEP_MINUTES = Number(process.env.AGENTS_LIMIT_SLEEP_MINUTES ?? 60);
const MAX_PARALLEL = Number(process.env.AGENTS_MAX_PARALLEL ?? 3);
// Where a sandbox on a branch runs. "bind" (the default) bind-mounts its
// worktree; "isolated" copies the repo in and the commits out, mounting
// nothing of the checkout (isolated-docker.mts): much faster installs on
// Docker Desktop for Mac, and a sandbox can't touch the host checkout.
const SANDBOX = process.env.AGENTS_SANDBOX === "isolated" ? "isolated" : "bind";
const PLANNER = process.env.AGENTS_PLANNER_MODEL ?? "claude-opus-5-5";
const WORKER = process.env.AGENTS_WORKER_MODEL ?? "claude-sonnet-5";
const ALERTS = process.env.SLACK_ALERTS_WEBHOOK_URL;
const FEED = process.env.SLACK_FEED_WEBHOOK_URL;
// Triage inside the loop instead of the GitHub Actions workflow: no Actions
// minutes, but issues are only triaged while the loop runs. Don't run both.
const TRIAGE = ["1", "true", "yes"].includes((process.env.AGENTS_TRIAGE ?? "").toLowerCase());
// Graceful stop. `npm run agents:stop` creates this file from any terminal; the
// loop reads it wherever it would start new work, finishes what is in flight
// and removes it on exit. Starting the loop clears any file left behind.
const STOP_FILE = ".sandcastle/STOP";
const stopRequested = () => existsSync(STOP_FILE);

// Ctrl-C can't be graceful: Sandcastle's own SIGINT handler tears every
// sandbox down and exits. What it must not do is leave state behind that
// the next run misreads as "someone is on it": a ticket's assignee, an
// epic's `agent:planning` label or an issue's `agent:unblocking` label. This
// handler runs first (registered before any sandbox exists) and clears them,
// synchronously, before that exit. Work already committed on the ticket
// branch survives; `prepareBranch` resumes from it.
// What this loop holds is also kept in HELD_FILE, so the next start can
// release what a loop that died without that handler left behind. It lives
// in the checkout's git folder: never tracked, and one per checkout, like the loop.
const HELD_FILE = `${execFileSync("git", ["rev-parse", "--absolute-git-dir"], { encoding: "utf8" }).trim()}/agent-loop-held.json`;
class Held<T> extends Set<T> {
  add(value: T) { super.add(value); saveHeld(); return this; }
  delete(value: T) { const had = super.delete(value); saveHeld(); return had; }
}
// What the loop is doing, rewritten at every change of state, for
// /why-sleeping and --dry-run: passing, building, asleep (until when), the
// jobs in backoff, and the ready tickets the last pass couldn't start.
const STATUS_FILE = HELD_FILE.replace(/agent-loop-held\.json$/, "agent-loop-status.json");
const inFlight = new Held<Ticket>();
const planningEpics = new Held<number>();
const unblockingIssues = new Held<number>();
const claimedAt = new Map<number, string>(); // ticket → when this loop claimed it
function saveHeld() {
  try {
    writeFileSync(HELD_FILE, JSON.stringify({
      pid: process.pid,
      claims: [...inFlight].map((t) => ({ number: t.number, at: claimedAt.get(t.number) ?? new Date().toISOString() })),
      planning: [...planningEpics],
      unblocking: [...unblockingIssues],
    }));
  } catch { /* best effort: the next start just has less to clean up */ }
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    for (const t of inFlight) { try { release(t, `${signal}: quitting, branch kept for the next run`); } catch { /* best effort */ } }
    for (const n of planningEpics) { try { gh("issue", "edit", String(n), "--remove-label", LABEL.planning); } catch { /* best effort */ } }
    for (const n of unblockingIssues) { try { gh("issue", "edit", String(n), "--remove-label", LABEL.unblocking); } catch { /* best effort */ } }
    const released = inFlight.size + planningEpics.size + unblockingIssues.size;
    rmSync(HELD_FILE, { force: true }); // released above: nothing for the next start to clean up
    console.log(`\n[agents] ${signal}: quitting now${released ? ", claims released" : ""}. For a graceful stop use \`npm run agents:stop\`.`);
    // With a sandbox open, Sandcastle's own handler (registered later) tears
    // it down and exits; with none, nobody else would, so exit here.
    if (process.listenerCount(signal) <= 1) process.exit(128 + (signal === "SIGINT" ? 2 : 15));
  });
}
type Mode = "normal" | "fast" | "supersonic";
const MODE: Mode = process.env.AGENTS_MODE === "supersonic" ? "supersonic" : process.env.AGENTS_MODE === "fast" ? "fast" : "normal";
// One confidence threshold for what the loop decides alone (AGENTS_FAST_THRESHOLD
// is its older name). Unset: fast and supersonic use 70, and wayfinder's
// autopilot keeps its own default (75).
const THRESHOLD_SET = process.env.AGENTS_THRESHOLD ?? process.env.AGENTS_FAST_THRESHOLD;
const THRESHOLD = Number(THRESHOLD_SET ?? 70);
const DIGEST_HOURS = Number(process.env.AGENTS_DIGEST_HOURS ?? 24);
const DIGEST_FILE = ".sandcastle/digest.json";
// Slack mentions need the member ID (profile → ⋮ → Copy member ID), not the name.
const MENTION = process.env.SLACK_USER_ID ? `<@${process.env.SLACK_USER_ID}> ` : "";
const LABEL = {
  build: process.env.AGENTS_LABEL_BUILD ?? "ready-for-agent",
  bug: process.env.AGENTS_LABEL_BUG ?? "ready-for-agent-debugging",
  human: process.env.AGENTS_LABEL_HUMAN ?? "ready-for-human",
  review: process.env.AGENTS_LABEL_REVIEW ?? "ready-for-review",
  epic: "epic",
  spec: "spec",
  approved: "spec-approved",
  map: "wayfinder:map",
  planning: "agent:planning",
  autopilot: "autopilot",
  manual: process.env.AGENTS_LABEL_MANUAL ?? "manual",
  briefing: "needs-briefing",
  backlog: process.env.AGENTS_LABEL_BACKLOG ?? "backlog",
  suiteRun: "suite-run",
  triage: "needs-triage",
  needsInfo: process.env.AGENTS_LABEL_NEEDS_INFO ?? "needs-info",
  fast: "fast",
  supersonic: "supersonic",
  asked: "agent:asked",
  assumed: "agent:assumed",
  unblocking: "agent:unblocking",
};
const AI_NOTE = "> *This was generated by AI";
// Agents sometimes word the disclaimer their own way ("> 🤖 *This comment was
// written by an AI agent…*"); an italic quote line saying generated/written by
// AI or Claude counts as one.
const isAiComment = (body: string) =>
  body.startsWith(AI_NOTE) || /^>\s*(\S+\s+)?\*[^\n]*\b(generated|written)\b[^\n]*\b(AI|Claude)\b/i.test(body.trimStart());
const WORKTREES = ".sandcastle/worktrees";

// Dependencies are installed inside the sandbox, for Linux, from one package
// store shared by every sandbox: a warm install only links packages. The
// host's node_modules is never copied in (it's built for the host's platform).
// The install command follows the lockfile; corepack (enabled in the image)
// provides pnpm and yarn at the version package.json asks for.
const CACHE = ".sandcastle/cache";
const SANDBOX_CACHE = "/home/agent/.pkg-cache";
mkdirSync(CACHE, { recursive: true });
const install =
  existsSync("pnpm-lock.yaml") ? `CI=true pnpm install --frozen-lockfile --store-dir ${SANDBOX_CACHE}/pnpm-store`
  : existsSync("yarn.lock") ? `YARN_CACHE_FOLDER=${SANDBOX_CACHE}/yarn yarn install --immutable`
  : existsSync("package-lock.json") ? `npm ci --cache ${SANDBOX_CACHE}/npm`
  : `npm install --cache ${SANDBOX_CACHE}/npm`;
// A project whose tests need services (a database, a cache) starts them in
// .sandcastle/sandbox-setup.sh, after the install. It writes their exports to
// .sandcastle/sandbox-env, which the agents source instead of setting up their own.
const SETUP = ".sandcastle/sandbox-setup.sh";
const hooks = {
  sandbox: {
    onSandboxReady: [
      { command: install, timeoutMs: 600_000 },
      { command: `if [ -f ${SETUP} ]; then bash ${SETUP}; fi`, timeoutMs: 600_000 },
    ],
  },
};
// The job that merges main into an epic branch keeps the bind mount (see
// container()), where an install on Docker Desktop for Mac can take over 10
// minutes: give its install 30.
const mergeHooks = {
  sandbox: { onSandboxReady: [{ command: install, timeoutMs: 1_800_000 }, hooks.sandbox.onSandboxReady[1]] },
};
// pnpm's store goes in the environment, not on the install's command line:
// pnpm 11 checks the dependencies before every `pnpm <script>`, and a store
// other than the one the install used makes it reinstall, which fails without
// a TTY. pnpm 11 reads only pnpm_config_*, pnpm 9 and 10 only npm_config_*.
const sandboxEnv = {
  COREPACK_HOME: `${SANDBOX_CACHE}/corepack`,
  COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
  pnpm_config_store_dir: `${SANDBOX_CACHE}/pnpm-store`,
  npm_config_store_dir: `${SANDBOX_CACHE}/pnpm-store`,
};
// A sandbox on a branch (a worktree of its own) runs isolated when
// AGENTS_SANDBOX=isolated, with the caches in a shared Docker volume. A run on
// the host's own checkout (no branch) and a job that merges branches keep the
// bind mount: isolated sandboxes need a branch, and their patches can't carry
// a merge commit.
const container = (branch?: string, opts: { merges?: boolean } = {}) =>
  branch && SANDBOX === "isolated" && !opts.merges
    ? isolatedDocker({ cachePath: SANDBOX_CACHE, env: sandboxEnv })
    : docker({ mounts: [{ hostPath: CACHE, sandboxPath: SANDBOX_CACHE }], env: sandboxEnv });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Epic = { number: number; title: string; branch: string; milestone: string; mode: Mode; manual: boolean; areas: string[] };
// A `suite` ticket runs one of test-suites/'s slow suites on the finished
// branch instead of building: it's queued by its `ready-for-agent` label like
// a build, and told apart by `suite-run`.
type Ticket = { number: number; title: string; kind: "build" | "bug" | "suite"; epic?: Epic; branch: string };
const whoLabel = (t: Ticket) => (t.kind === "bug" ? LABEL.bug : LABEL.build);

const sh = (cmd: string, args: string[], cwd?: string) =>
  execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gh = (...args: string[]) => sh("gh", args);
const ghJson = <T,>(...args: string[]): T => JSON.parse(gh(...args));
const git = (cwd: string | undefined, ...args: string[]) => sh("git", args, cwd);
const tryGit = (cwd: string | undefined, ...args: string[]) => {
  try {
    git(cwd, ...args);
    return true;
  } catch {
    return false;
  }
};
// A run that died leaves its sandbox worktree behind, holding the branch and
// blocking `git branch -f` on the next pass: remove it first.
const freeBranch = (branch: string) => {
  const list = git(undefined, "worktree", "list", "--porcelain");
  for (const block of list.split("\n\n")) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    if (path && block.split("\n").includes(`branch refs/heads/${branch}`)) tryGit(undefined, "worktree", "remove", "--force", path);
  }
  tryGit(undefined, "worktree", "prune");
};
const log = (msg: string) => console.log(`[agents ${new Date().toISOString()}] ${msg}`);
const isLimit = (reason: string) => /usage limit|rate limit|429/i.test(reason);
const repo = gh("repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner");
const me = gh("api", "user", "--jq", ".login");

async function alert(text: string) {
  log(text);
  if (!ALERTS) return;
  await fetch(ALERTS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `[${repo}] ${text}` }),
  }).catch(() => {});
}

// An alert that needs your answer: it mentions you, so Slack notifies you.
const ask = (text: string) => alert(`${MENTION}${text}`);
const issueUrl = (n: number) => `https://github.com/${repo}/issues/${n}`;

function comment(n: number, body: string) {
  gh("issue", "comment", String(n), "--body", `> *This was generated by AI in the agent loop.*\n\n${body}`);
}

// A spec (from /to-spec) describes work that /to-tickets turns into tickets.
function isSpec(labels: string[], body: string) {
  return labels.includes(LABEL.spec) || (/^## Problem Statement/m.test(body) && /^## User Stories/m.test(body));
}

// The mode an issue or epic runs in: the project's, raised by its own label.
// Anything parked (backlog) is normal: neither mode touches it.
function modeOf(labels: string[]): Mode {
  if (labels.includes(LABEL.backlog)) return "normal";
  if (MODE === "supersonic" || labels.includes(LABEL.supersonic)) return "supersonic";
  if (MODE === "fast" || labels.includes(LABEL.fast)) return "fast";
  return "normal";
}
const unblocks = (mode: Mode | undefined) => mode === "fast" || mode === "supersonic";

const epicCache = new Map<string, Epic | undefined>();
const epicBlockedCache = new Map<number, boolean>();

// An epic waiting on other epics holds back its tickets too, even those with
// no blockers inside its milestone: they'd be built on missing foundations
// (unless AGENTS_EPIC_GATE=ticket).
function epicBlocked(epic: Epic): boolean {
  if (!epicBlockedCache.has(epic.number)) {
    const n = Number(gh("api", `repos/${repo}/issues/${epic.number}`, "--jq", ".issue_dependencies_summary.blocked_by // 0"));
    epicBlockedCache.set(epic.number, n > 0);
  }
  return epicBlockedCache.get(epic.number)!;
}

// Everything under an epic carries the epic's milestone, so the milestone
// finds the epic even when a ticket isn't linked as its sub-issue.
function epicFor(milestone?: string): Epic | undefined {
  if (!milestone) return undefined;
  if (epicCache.has(milestone)) return epicCache.get(milestone);
  const [epic] = ghJson<{ number: number; title: string; body: string; labels: { name: string }[] }[]>(
    "issue", "list", "--state", "open", "--label", LABEL.epic, "--milestone", milestone,
    "--json", "number,title,body,labels", "--limit", "1",
  );
  const branch = epic?.body.match(/`(epic\/[^`]+)`/)?.[1];
  const labels = epic?.labels.map((l) => l.name) ?? [];
  const mode = modeOf(labels);
  const found = epic && branch ? { number: epic.number, title: epic.title, branch, milestone, mode, manual: labels.includes(LABEL.manual), areas: areasOf(epic.labels) } : undefined;
  epicCache.set(milestone, found);
  return found;
}

function readyTickets(): Ticket[] {
  const tickets: Ticket[] = [];
  for (const kind of ["build", "bug"] as const) {
    const issues = ghJson<{ number: number; title: string; body: string; labels: { name: string }[]; milestone: { title: string } | null }[]>(
      "issue", "list", "--state", "open", "--label", LABEL[kind], "--search", "no:assignee sort:created-asc",
      "--json", "number,title,body,labels,milestone", "--limit", "100",
    );
    for (const issue of issues) {
      const labels = issue.labels.map((l) => l.name);
      if (isSpec(labels, issue.body) || labels.includes(LABEL.epic) || labels.includes(LABEL.backlog)) continue;
      const blocked = Number(gh("api", `repos/${repo}/issues/${issue.number}`, "--jq", ".issue_dependencies_summary.blocked_by // 0"));
      if (blocked > 0) continue;
      const epic = epicFor(issue.milestone?.title);
      if (!inScope(issue.number, epic, issue.labels)) continue;
      if (epic?.manual) continue; // a hand-run epic: its tickets are never the loop's, whatever their labels
      if (epic && EPIC_GATE === "epic" && epicBlocked(epic)) continue;
      const suite = kind === "build" && labels.includes(LABEL.suiteRun);
      tickets.push({
        number: issue.number,
        title: issue.title,
        kind: suite ? "suite" : kind,
        epic,
        branch: epic ? `agent/issue-${issue.number}` : `${suite ? "suite" : kind === "bug" ? "fix" : "feat"}/${issue.number}`,
      });
    }
  }
  return tickets;
}

// Assignment means claimed. Two loops (the always-on machine and a laptop)
// can race: claim, re-read, and back off if someone else got there too.
function claim(t: Ticket) {
  gh("issue", "edit", String(t.number), "--add-assignee", "@me");
  const assignees = ghJson<string[]>("issue", "view", String(t.number), "--json", "assignees", "--jq", "[.assignees[].login]");
  if (assignees.length === 1 && assignees[0] === me) {
    claimedAt.set(t.number, new Date().toISOString());
    return true;
  }
  gh("issue", "edit", String(t.number), "--remove-assignee", "@me");
  return false;
}

function release(t: Ticket, why: string) {
  gh("issue", "edit", String(t.number), "--remove-assignee", "@me");
  log(`#${t.number} released: ${why}`);
}

// The epic branch lives in its own worktree, so the main checkout is never
// switched underneath you. Returns the worktree path, or undefined when the
// epic can't be worked this pass.
// Once an epic's PR is open, every push to its branch runs the project's CI
// again, so the loop batches them. A push made while more of the epic's work
// is on its way (main merged in for a ticket about to start, a ticket landing
// beside others still building) carries [skip ci]. The batch's last landing
// pushes without it, and runCiOnBatches() pushes an empty commit when the
// batch ended on a skipped push (its last ticket failed, or had no commits),
// so CI still runs once on the batch.
const SKIP_CI = "[skip ci]";
const epicPrOpen = (epic: Epic) =>
  ghJson<unknown[]>("pr", "list", "--state", "open", "--head", epic.branch, "--base", "main", "--json", "number", "--limit", "1").length > 0;

function prepareEpic(epic: Epic, { ticketNext = false } = {}): string | undefined {
  const path = epicWorktree(epic);
  const message = ticketNext && epicPrOpen(epic) ? ["-m", `Merge main into ${epic.branch} ${SKIP_CI}`] : ["--no-edit"];
  if (!tryGit(path, "merge", ...message, "--quiet", "origin/main")) {
    tryGit(path, "merge", "--abort");
    conflictTicket(epic);
    return undefined;
  }
  git(path, "push", "--quiet", "-u", "origin", epic.branch);
  return path;
}

// The epic's worktree, created or brought up to its remote branch. When both
// moved (the loop landed tickets it hasn't pushed yet, and someone pushed to
// the epic branch meanwhile), it merges the remote in and pushes, keeping
// both; only a conflict stops it, for you to merge by hand.
function epicWorktree(epic: Epic): string {
  const path = `${WORKTREES}/${epic.branch.replaceAll("/", "-")}`;
  git(undefined, "fetch", "--quiet", "origin");
  const remote = tryGit(undefined, "rev-parse", "--verify", "--quiet", `origin/${epic.branch}`);
  if (!existsSync(path)) {
    mkdirSync(WORKTREES, { recursive: true });
    if (remote) git(undefined, "worktree", "add", "-B", epic.branch, path, `origin/${epic.branch}`);
    else git(undefined, "worktree", "add", "-b", epic.branch, path, "origin/main");
  } else if (remote && !tryGit(path, "merge", "--ff-only", "--quiet", `origin/${epic.branch}`)) {
    if (!tryGit(path, "merge", "--no-edit", "--quiet", `origin/${epic.branch}`)) {
      tryGit(path, "merge", "--abort");
      throw new Error(`${epic.branch} and origin/${epic.branch} both moved and conflict: merge origin/${epic.branch} into ${epic.branch} in ${path}, then push`);
    }
    git(path, "push", "--quiet", "origin", epic.branch);
    log(`${epic.branch}: merged in what was pushed to it outside the loop`);
  }
  return path;
}

const conflictTitle = (epic: Epic) => `Resolve conflicts between ${epic.branch} and main`;
// The loop's own housekeeping in a milestone, never the epic's work: a
// conflict ticket before the map is charted must not make the epic look
// planned, nor, once closed, look complete.
const isConflictTicket = (i: { title: string }) => i.title.startsWith("Resolve conflicts between ");
const conflictOpen = (epic: Epic) =>
  ghJson<unknown[]>("issue", "list", "--state", "open", "--search", `in:title "${conflictTitle(epic)}"`, "--json", "number").length > 0;

function conflictTicket(epic: Epic) {
  const title = conflictTitle(epic);
  if (conflictOpen(epic)) return;
  gh("issue", "create", "--title", title, "--label", LABEL.human, "--milestone", epic.milestone, "--body",
    `> *This was generated by AI in the agent loop.*\n\nMerging \`main\` into \`${epic.branch}\` conflicts. The loop skips this epic until the conflicts are resolved on the epic branch. An agent tries that first; if it can't, it asks you here.\n\nPart of #${epic.number}.`);
  log(`epic #${epic.number} paused: ${epic.branch} conflicts with main; an agent tries to resolve it next`);
}

// A branch with commits of its own keeps that progress. One without (the
// agent found the ticket blocked and made none) is reset to the base: left
// where it was cut, every retry would re-read the code from before whatever
// landed on the epic branch since, and block on the same gap again.
function prepareBranch(t: Ticket, epicPath?: string) {
  if (tryGit(undefined, "rev-parse", "--verify", "--quiet", t.branch) && unlanded(t) > 0) return;
  git(undefined, "branch", "-f", t.branch, epicPath ? t.epic!.branch : "origin/main");
}

// Commits on the ticket's branch that its base doesn't have yet. Not just
// the latest run's commits: a pass interrupted between build and land (the
// loop restarted) leaves finished work on the branch, and the rerun has
// nothing new to commit. That work still needs reviewing and landing.
function unlanded(t: Ticket): number {
  return Number(git(undefined, "rev-list", "--count", `${t.epic ? t.epic.branch : "origin/main"}..${t.branch}`));
}

// ---------------------------------------------------------------------------
// One pass
// ---------------------------------------------------------------------------

const planSchema = z.object({ issues: z.array(z.object({ number: z.number() })) });

// The loop keeps up to AGENTS_MAX_PARALLEL tickets building at once, as a
// pool: each ticket is a job of its own, and when one lands its slot is
// refilled at once, instead of waiting for the slowest ticket of a batch.
// Epic checks run beside them, one per epic. A job never throws: it releases
// its ticket and notes a usage limit for the next pass to act on.
const running = new Map<number, Promise<void>>(); // ticket number → its job
const checking = new Map<number, Promise<void>>(); // epic number → its check
let limitReason: string | undefined;

// A finished job wakes the loop's wait, so a free slot is refilled at once.
let woken = false;
let wakeUp = () => {};
function wake() {
  woken = true;
  wakeUp();
}

function background(what: string, job: () => Promise<void>, done: () => void): Promise<void> {
  return job()
    .catch(async (error) => {
      const reason = String(error);
      if (isLimit(reason)) limitReason = reason;
      else await alert(`${what} failed: ${reason.slice(0, 300)}`);
    })
    .catch(() => {}) // even the alert failing must not reject
    .finally(() => {
      done();
      wake();
    });
}

// A job that fails, or runs and changes nothing, would run again on the
// next pass, and the pass would count it as work: the loop never sleeps, and
// pays for a model run each time that goes nowhere. Instead the job backs off,
// doubling from AGENTS_RETRY_MINUTES up to STRIKE_MAX_MINUTES, and stops
// counting as work. You hear about it at the third strike. Progress clears it.
const STRIKE_ALERT = 3;
const STRIKE_MAX_MINUTES = 4 * 60;
const strikes = new Map<string, { count: number; until: number; what: string; why: string }>();
const benched = (key: string) => (strikes.get(key)?.until ?? 0) > Date.now();
const cleared = (key: string) => strikes.delete(key);
async function strike(key: string, what: string, why: string) {
  const count = (strikes.get(key)?.count ?? 0) + 1;
  const wait = Math.min(RETRY_MINUTES * 2 ** (count - 1), STRIKE_MAX_MINUTES);
  strikes.set(key, { count, until: Date.now() + wait * 60_000, what, why: why.slice(0, 300) });
  log(`${what}: ${why}; next try in ${wait} min (strike ${count})`);
  if (count === STRIKE_ALERT)
    await alert(`${what} failed or changed nothing ${count} times in a row (${why.slice(0, 300)}). The loop keeps trying, less often: next in ${wait} min, then up to every ${STRIKE_MAX_MINUTES / 60} h. Restarting the loop clears it.`);
}

type LoopState = "passing" | "building" | "asleep" | "limit" | "retrying";
function writeStatus(state: LoopState, minutes?: number) {
  if (DRY_RUN) return;
  try {
    writeFileSync(STATUS_FILE, JSON.stringify({
      pid: process.pid,
      at: new Date().toISOString(),
      state,
      until: minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : undefined,
      lastPassAt,
      mode: MODE,
      scope: SCOPED ? { epics: [...(SCOPE_EPICS ?? [])], tickets: [...(SCOPE_TICKETS ?? [])], areas: [...(SCOPE_AREAS ?? [])] } : undefined,
      building: [...inFlight].map((t) => t.number),
      checking: [...checking.keys()],
      unstarted,
      backoff: [...strikes].filter(([, v]) => v.until > Date.now())
        .map(([key, v]) => ({ key, count: v.count, until: new Date(v.until).toISOString(), what: v.what, why: v.why })),
    }, null, 2));
  } catch { /* best effort: only /why-sleeping reads it */ }
}
let lastPassAt: string | undefined;

async function pass(): Promise<number> {
  if (limitReason) {
    const reason = limitReason;
    limitReason = undefined;
    throw new Error(`usage limit: ${reason}`);
  }
  epicCache.clear();
  epicBlockedCache.clear();
  lastPassAt = new Date().toISOString();
  writeStatus("passing");
  // Tickets first: their slots are the loop's throughput. What triage,
  // unblocking and planning make ready is picked up by the next pass, which
  // starts at once because they count as work.
  const started = stopRequested() ? 0 : await fill();
  let other = stopRequested() ? 0 : await verifyEpics();
  if (!stopRequested()) other += await resolveEpicConflicts();
  if (!stopRequested()) other += await triage();
  if (!stopRequested()) other += await unblock();
  if (PLANNING && !stopRequested()) other += await planEpics();
  runCiOnBatches();
  changedQueue = other > 0;
  return started + other;
}
// An epic branch whose last push carried [skip ci], with none of its tickets
// building any more: nothing else will push, so an empty commit runs CI once
// on the whole batch.
function runCiOnBatches() {
  if (!existsSync(WORKTREES)) return;
  for (const block of git(undefined, "worktree", "list", "--porcelain").split("\n\n")) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    const branch = block.match(/^branch refs\/heads\/(epic\/.+)$/m)?.[1];
    if (!path || !branch || !path.includes(`/${WORKTREES}/`)) continue;
    if ([...inFlight].some((t) => t.epic?.branch === branch)) continue; // the batch is still landing
    try {
      git(undefined, "fetch", "--quiet", "origin", branch);
      if (git(path, "rev-parse", "HEAD") !== git(undefined, "rev-parse", `origin/${branch}`)) continue; // not this loop's last push
      if (!git(path, "log", "-1", "--format=%B").includes(SKIP_CI)) continue;
      git(path, "commit", "--quiet", "--allow-empty", "--no-verify", "-m", `Run CI on the batch landed on ${branch}`);
      git(path, "push", "--quiet", "origin", branch);
      log(`${branch}: the batch ended on a skipped push; pushed an empty commit so CI runs on it once`);
    } catch (error) {
      log(`couldn't run CI on ${branch}'s batch: ${String(error).slice(0, 200)}`);
    }
  }
}

// Whether the last pass may have made new tickets ready (triage, unblocking,
// planning, a check's gaps): then the next pass runs at once, even with
// every slot busy, instead of waiting for a ticket to land.
let changedQueue = false;

// Ready tickets the last pass left unstarted with slots free, and why. When
// the cause can pass (a claim lost to someone else), `retry` makes the loop
// look again after AGENTS_RETRY_MINUTES instead of sleeping the idle time.
let unstarted: { tickets: number[]; why: string[]; retry: boolean } = { tickets: [], why: [], retry: false };

// Start ready tickets in the free slots. Returns how many started.
async function fill(): Promise<number> {
  unstarted = { tickets: [], why: [], retry: false };
  const free = MAX_PARALLEL - running.size;
  if (free <= 0) return 0;
  const ready = readyTickets().filter((t) => !benched(`build#${t.number}`)); // unassigned only: running tickets are claimed
  if (!ready.length) return 0;

  const busy = [...inFlight];
  // One ready ticket and nothing building: nothing to choose between.
  let picked = ready.length === 1 && !busy.length ? ready : await plan(ready, busy, free);
  // Nothing building means nothing to clash with: a planner that picks none
  // would leave the loop asleep beside ready work. Take the oldest instead.
  if (!picked.length && !busy.length) {
    log(`the planner picked none of ${ready.map((t) => `#${t.number}`).join(", ")}; starting the oldest, #${ready[0]!.number}`);
    picked = [ready[0]!];
  }
  const why = new Set<string>();
  const lost: number[] = [];

  const epicPaths = new Map<number, string | undefined>();
  let started = 0;
  for (const t of picked.slice(0, free)) {
    if (t.epic && !epicPaths.has(t.epic.number)) epicPaths.set(t.epic.number, prepareEpic(t.epic, { ticketNext: true }));
    const epicPath = t.epic ? epicPaths.get(t.epic.number) : undefined;
    if (t.epic && !epicPath) { why.add(`epic #${t.epic.number} is paused on a conflict with main`); continue; }
    if (stopRequested()) { why.add("a stop was asked for"); break; }
    if (!claim(t)) { lost.push(t.number); continue; }
    prepareBranch(t, epicPath);
    inFlight.add(t);
    running.set(t.number, background(`#${t.number}`, () => work(t, epicPath), () => {
      inFlight.delete(t);
      claimedAt.delete(t.number);
      running.delete(t.number);
    }));
    started++;
  }
  const others = busy.length ? ` (already building ${busy.map((t) => `#${t.number}`).join(", ")})` : "";
  const startedNow = [...inFlight].filter((t) => !busy.includes(t)).map((t) => t.number);
  if (lost.length) why.add(`someone else claimed ${lost.map((n) => `#${n}`).join(", ")} first`);
  const heldBack = ready.filter((t) => !picked.includes(t));
  if (heldBack.length && startedNow.length + busy.length < MAX_PARALLEL) why.add(`the planner held back ${heldBack.map((t) => `#${t.number}`).join(", ")}: they'd clash with work building`);
  unstarted = {
    tickets: ready.map((t) => t.number).filter((n) => !startedNow.includes(n)),
    why: [...why],
    retry: lost.length > 0 && !startedNow.length,
  };
  log(`started ${startedNow.length ? startedNow.map((n) => `#${n}`).join(", ") : "nothing"}${others}${why.size ? `; ${[...why].join("; ")}` : ""}`);
  return started;
}

// The planner picks, among the ready tickets, the ones that can be built
// beside each other and beside the tickets already building. It only reads
// tickets and code, so its sandbox skips the install and the services.
async function plan(ready: Ticket[], busy: Ticket[], free: number): Promise<Ticket[]> {
  const line = (t: Ticket) => `- #${t.number} (${t.kind}${t.epic ? `, epic #${t.epic.number}` : ""}): ${t.title}`;
  const run = await sandcastle.run({
    sandbox: container(),
    name: "planner",
    maxIterations: 1,
    agent: sandcastle.claudeCode(PLANNER),
    promptFile: "./.sandcastle/plan-prompt.md",
    promptArgs: {
      MAX_PARALLEL: String(free),
      TICKETS: ready.map(line).join("\n"),
      RUNNING: busy.length ? busy.map(line).join("\n") : "- none",
    },
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
  });
  return planSchema.parse(run.output).issues
    .map((p) => ready.find((t) => t.number === p.number))
    .filter((t): t is Ticket => !!t);
}

// One ticket, from build to landed (or handed back).
async function work(t: Ticket, epicPath?: string) {
  let commits: number;
  try {
    commits = await build(t);
  } catch (error) {
    freeBranch(t.branch); // a sandbox that died leaves its worktree; the branch and its commits stay
    release(t, String(error).slice(0, 300));
    if (isLimit(String(error))) limitReason = String(error);
    else await strike(`build#${t.number}`, `Building #${t.number}`, String(error));
    return;
  }
  try {
    if (await settle(t, commits, epicPath)) cleared(`build#${t.number}`);
    else await strike(`build#${t.number}`, `Landing #${t.number}`, "its work conflicts with the epic branch");
  } catch (error) {
    release(t, `after the build: ${String(error).slice(0, 300)}`);
    await strike(`build#${t.number}`, `Landing #${t.number}`, String(error));
    throw error;
  }
  syncTracker();
}

// Whether the ticket moved on: landed, or handed to a person. A conflict with
// the epic branch sends it back to the queue, to be built again.
async function settle(t: Ticket, commits: number, epicPath?: string): Promise<boolean> {
  if (t.kind === "suite") return settleSuite(t, commits);
  if (!commits) {
    // No commits: a bug diagnosed for a person / not reproducible, or a
    // build the agent couldn't finish. The agent has commented; make sure a
    // person sees it.
    const labels = ghJson<string[]>("issue", "view", String(t.number), "--json", "labels", "--jq", "[.labels[].name]");
    if (labels.includes(whoLabel(t))) {
      gh("issue", "edit", String(t.number), "--remove-label", whoLabel(t), "--add-label", LABEL.human);
    }
    release(t, "no commits; handed to a person");
    return true;
  }
  // A ticket that can't land (a push refused, gh down) is released with its
  // work kept on its branch, and alerted; the next pass lands it.
  return land(t, epicPath);
}

// A Run ticket lands nothing: the agent closed it (green), blocked it on the
// bugs it filed (red: it runs again once they close), or handed it to a
// person. An agent that did none of those is treated like a build with no
// commits. Its branch is only the code under test: dropped either way.
async function settleSuite(t: Ticket, commits: number): Promise<boolean> {
  if (commits) log(`#${t.number}: a suite run made ${commits} commit(s); dropped, a Run ticket changes nothing`);
  freeBranch(t.branch);
  tryGit(undefined, "branch", "-D", t.branch);
  const issue = ghJson<{ state: string; labels: { name: string }[] }>("issue", "view", String(t.number), "--json", "state,labels");
  const labels = issue.labels.map((l) => l.name);
  if (issue.state !== "OPEN") { log(`#${t.number}: suite green, closed by the agent`); return true; }
  const blocked = Number(gh("api", `repos/${repo}/issues/${t.number}`, "--jq", ".issue_dependencies_summary.blocked_by // 0"));
  if (blocked > 0) { release(t, `suite red; waits on the ${blocked} bug(s) it filed`); return true; }
  if (labels.includes(LABEL.human)) { release(t, "handed to a person by the agent"); return true; }
  if (labels.includes(LABEL.build)) gh("issue", "edit", String(t.number), "--remove-label", LABEL.build, "--add-label", LABEL.human);
  release(t, "the run neither passed, failed nor asked; handed to a person");
  return true;
}

async function build(t: Ticket): Promise<number> {
  const box = await sandcastle.createSandbox({ branch: t.branch, sandbox: container(t.branch), hooks });
  try {
    // A Run ticket tests the branch it was cut from: the epic's, or main.
    const base = t.epic ? t.epic.branch : "main";
    const suiteArgs = t.kind === "suite" ? { BASE: `origin/${base}`, REF: base, SHA: git(undefined, "rev-parse", `origin/${base}`), REPO: repo } : {};
    await box.run({
      name: `#${t.number}`,
      maxIterations: 100,
      agent: sandcastle.claudeCode(WORKER),
      promptFile: t.kind === "bug" ? "./.sandcastle/bug-prompt.md" : t.kind === "suite" ? "./.sandcastle/suite-prompt.md" : "./.sandcastle/implement-prompt.md",
      promptArgs: { ISSUE: String(t.number), TITLE: t.title, BRANCH: t.branch, ...suiteArgs },
    });
    if (t.kind === "suite" || !unlanded(t)) return unlanded(t); // a run has nothing to review
    await box.run({
      name: `#${t.number} review`,
      maxIterations: 1,
      agent: sandcastle.claudeCode(WORKER),
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: { ISSUE: String(t.number), BRANCH: t.branch, BASE: t.epic ? `origin/${t.epic.branch}` : "origin/main" },
    });
    return unlanded(t);
  } finally {
    await box.close();
  }
}

async function land(t: Ticket, epicPath?: string): Promise<boolean> {
  if (t.epic && epicPath) {
    const more = [...inFlight].some((o) => o !== t && o.epic?.number === t.epic!.number);
    const message = more && epicPrOpen(t.epic) ? ["--no-ff", "-m", `Merge ${t.branch} into ${t.epic.branch} ${SKIP_CI}`] : ["--no-edit"];
    if (!tryGit(epicPath, "merge", ...message, "--quiet", t.branch)) {
      tryGit(epicPath, "merge", "--abort");
      // Built and reviewed work that conflicts only because other tickets
      // landed meanwhile: an agent merges the epic into the ticket's branch
      // and resolves it. Rebuilding from scratch is the fallback, not the
      // first move: it repeats hours of build and review.
      if (await mergeEpicIntoTicket(t, epicPath) && tryGit(epicPath, "merge", ...message, "--quiet", t.branch)) {
        log(`#${t.number}: conflicts with ${t.epic.branch} resolved by an agent`);
      } else {
        tryGit(epicPath, "merge", "--abort");
        comment(t.number, `The work on \`${t.branch}\` conflicts with \`${t.epic.branch}\` and an agent couldn't resolve it; the loop will rebuild it on top of the latest epic branch.`);
        // The sandbox's worktree still holds the branch, and git won't delete a
        // branch checked out in a worktree: free it first, or the stale branch
        // survives and every retry rebuilds on it and conflicts again.
        freeBranch(t.branch);
        git(undefined, "branch", "-D", t.branch);
        release(t, "merge conflict with the epic branch");
        return false;
      }
    }
    git(epicPath, "push", "--quiet", "origin", t.epic.branch);
    const sha = git(epicPath, "rev-parse", "--short", "HEAD");
    gh("issue", "close", String(t.number), "--comment",
      `> *This was generated by AI in the agent loop.*\n\nLanded on \`${t.epic.branch}\` in ${sha}. It ships with the epic's PR (#${t.epic.number}).`);
    freeBranch(t.branch); // the sandbox's worktree still holds the branch, and git won't delete it
    git(undefined, "branch", "-D", t.branch);
    log(`#${t.number} landed on ${t.epic.branch}`);
    return true;
  }
  git(undefined, "push", "--quiet", "-u", "origin", t.branch);
  const url = gh("pr", "create", "--base", "main", "--head", t.branch, "--title", t.title, "--body",
    `Fixes #${t.number}\n\n> *This was generated by AI in the agent loop.* See the issue for the reasoning and evidence.`);
  gh("issue", "edit", String(t.number), "--remove-label", whoLabel(t), "--add-label", LABEL.review);
  log(`#${t.number} → ${url}`);
  return true;
}

// The epic branch merged into the ticket's branch, its conflicts resolved by
// an agent: the WIP merge (markers committed) goes to a sandbox that can carry
// a merge commit; the resolved tree then becomes one clean merge commit
// (parents: the ticket's tip and the epic's) replacing the WIP history. True
// when the branch now merges the epic in; false leaves the branch as it was,
// for the caller to rebuild the ticket.
async function mergeEpicIntoTicket(t: Ticket, epicPath: string): Promise<boolean> {
  const epic = t.epic!;
  const epicTip = git(epicPath, "rev-parse", "HEAD");
  const ticketTip = git(undefined, "rev-parse", t.branch);
  const scratch = `${WORKTREES}/${t.branch.replaceAll("/", "-")}-conflicts`;
  freeBranch(t.branch); // the sandbox's worktree still holds the branch
  git(undefined, "worktree", "add", "--quiet", scratch, t.branch);
  let files: string;
  try {
    tryGit(scratch, "merge", "--no-edit", "--quiet", epicTip);
    files = git(scratch, "diff", "--name-only", "--diff-filter=U");
    git(scratch, "add", "-A");
    git(scratch, "commit", "--quiet", "--no-verify", "-m", `WIP: merge ${epic.branch} into ${t.branch}, conflicts unresolved`);
  } finally {
    tryGit(undefined, "worktree", "remove", "--force", scratch);
  }
  log(`#${t.number}: resolving conflicts with ${epic.branch} (${files.split("\n").length} files)`);
  let commits = 0;
  try {
    const box = await sandcastle.createSandbox({ branch: t.branch, sandbox: container(t.branch, { merges: true }), hooks: mergeHooks });
    try {
      const done = await box.run({
        name: `#${t.number} conflicts`,
        maxIterations: 20,
        agent: sandcastle.claudeCode(WORKER),
        promptFile: "./.sandcastle/ticket-conflicts-prompt.md",
        promptArgs: { ISSUE: String(t.number), BRANCH: t.branch, EPIC: String(epic.number), EPIC_BRANCH: epic.branch, FILES: files },
      });
      commits = done.commits.length;
    } finally {
      await box.close();
    }
  } catch (error) {
    if (isLimit(String(error))) throw error;
    log(`#${t.number}: resolving conflicts failed: ${String(error).slice(0, 300)}`);
  }
  const markers = tryGit(undefined, "grep", "-q", "-E", "^(<<<<<<<|>>>>>>>)( |$)", t.branch);
  if (!commits || markers) {
    freeBranch(t.branch);
    git(undefined, "branch", "-f", t.branch, ticketTip);
    return false;
  }
  const tree = git(undefined, "rev-parse", `${t.branch}^{tree}`);
  const merge = git(undefined, "commit-tree", tree, "-p", ticketTip, "-p", epicTip, "-m",
    `Merge ${epic.branch} into ${t.branch}\n\nConflicts resolved by the agent loop (#${t.number}).`);
  freeBranch(t.branch);
  git(undefined, "branch", "-f", t.branch, merge);
  return true;
}

// ---------------------------------------------------------------------------
// Autopilot planning (epics labelled `autopilot`)
// ---------------------------------------------------------------------------

type Issue = { number: number; title: string; state: string; body: string; labels: { name: string }[]; comments?: { body: string }[] };
type PlanJob = { epic: Epic; kind: "chart" | "work" | "revise" | "tickets"; map?: number; spec?: number };

const has = (i: Issue, label: string) => i.labels.some((l) => l.name === label);

// What each autopilot epic needs next. Epics without the `autopilot` label,
// or still waiting for their brief, are planned by hand and never touched.
function planJobs(): PlanJob[] {
  const epics = ghJson<Issue[]>("issue", "list", "--state", "open", "--label", LABEL.epic, "--label", LABEL.autopilot, "--json", "number,title,state,body,labels", "--limit", "100");
  const jobs: PlanJob[] = [];
  for (const e of epics) {
    if (!epicInScope(listedEpic(e))) continue;
    if (has(e, LABEL.planning) || has(e, LABEL.briefing) || has(e, LABEL.backlog) || has(e, LABEL.manual)) continue; // another loop is on it, no brief yet, parked, or hand-run
    const milestone = ghJson<{ milestone: { title: string } | null }>("issue", "view", String(e.number), "--json", "milestone").milestone?.title;
    const branch = e.body.match(/`(epic\/[^`]+)`/)?.[1];
    if (!milestone || !branch) continue;
    if (EPIC_GATE === "epic" && Number(gh("api", `repos/${repo}/issues/${e.number}`, "--jq", ".issue_dependencies_summary.blocked_by // 0")) > 0) continue;
    const epic = { number: e.number, title: e.title, branch, milestone, mode: modeOf(e.labels.map((l) => l.name)), manual: false, areas: areasOf(e.labels) }; // manual epics were skipped above
    const items = ghJson<Issue[]>("issue", "list", "--state", "all", "--milestone", milestone, "--json", "number,title,state,body,labels,comments", "--limit", "300")
      .filter((i) => i.number !== e.number && !isConflictTicket(i));
    const specs = items.filter((i) => i.state === "OPEN" && isSpec(i.labels.map((l) => l.name), i.body));
    const maps = items.filter((i) => has(i, LABEL.map));
    const openMap = maps.find((m) => m.state === "OPEN");

    const spec = specs[0];
    if (spec) {
      if (has(spec, LABEL.approved)) jobs.push({ epic, kind: "tickets", spec: spec.number });
      else if (has(spec, LABEL.human) && !isAiComment(spec.comments?.at(-1)?.body ?? AI_NOTE))
        jobs.push({ epic, kind: "revise", spec: spec.number, map: maps[0]?.number });
      continue; // otherwise the spec waits for its review
    }
    if (openMap) {
      jobs.push({ epic, kind: "work", map: openMap.number });
      continue;
    }
    if (!maps.length && !items.length) jobs.push({ epic, kind: "chart" }); // untouched epic
  }
  return jobs;
}

function instructions(j: PlanJob): string {
  const threshold = THRESHOLD_SET ? ` (with a confidence threshold of ${THRESHOLD}, unless the map's Notes set one)` : "";
  const wayfinder = `Read \`.claude/skills/wayfinder/SKILL.md\` and \`.claude/skills/wayfinder/AUTOPILOT.md\` and follow them${threshold}`;
  switch (j.kind) {
    case "chart":
      return `Plan epic #${j.epic.number} (${j.epic.title}) on autopilot. ${wayfinder}: chart the map from the epic and its Brief, resolve it, and hand off the spec for review.`;
    case "work":
      return `Continue map #${j.map} of epic #${j.epic.number} on autopilot. ${wayfinder}: resolve the open decisions, and hand off the spec for review when the way is clear.`;
    case "revise":
      return `The spec #${j.spec} of epic #${j.epic.number} has review comments. ${wayfinder}, following the Revise section for spec #${j.spec}${j.map ? ` and map #${j.map}` : ""}.`;
    case "tickets":
      return `The spec #${j.spec} of epic #${j.epic.number} is approved. Read \`.claude/skills/to-tickets/SKILL.md\` and follow it for spec #${j.spec}: publish the tickets with \`ready-for-agent\` in milestone "${j.epic.milestone}". Then remove \`ready-for-human\` from the spec, comment (starting with the AI disclaimer) the tickets created, and close the spec.`;
  }
}

// Each spec version is announced once: keyed by spec and its comment count.
const announcedSpecs = new Set<string>();

async function planEpics(): Promise<number> {
  for (const [name, color] of [[LABEL.spec, "c5def5"], [LABEL.approved, "0e8a16"], [LABEL.planning, "fbca04"]] as const) {
    try { gh("label", "create", name, "--color", color, "--force"); } catch { /* exists */ }
  }
  const jobs = planJobs().filter((j) => !benched(`plan#${j.epic.number}`) && !conflictOpen(j.epic)).slice(0, MAX_PARALLEL);
  if (!jobs.length) return 0;
  log(`planning ${jobs.map((j) => `#${j.epic.number} (${j.kind})`).join(", ")}`);

  // Each run says whether it moved the epic on; undefined: it didn't run.
  const runs = jobs.map(async (j): Promise<boolean | undefined> => {
    const before = milestoneState(j.epic);
    gh("issue", "edit", String(j.epic.number), "--add-label", LABEL.planning);
    planningEpics.add(j.epic.number);
    try {
      const epicPath = prepareEpic(j.epic);
      if (!epicPath) return undefined; // paused on a conflict with main: that has its own ticket
      const branch = `agent/plan-${j.epic.number}`;
      freeBranch(branch);
      git(undefined, "branch", "-f", branch, j.epic.branch);
      const box = await sandcastle.createSandbox({ branch, sandbox: container(branch), hooks });
      let commits = 0;
      try {
        const done = await box.run({
          name: `plan #${j.epic.number}`,
          maxIterations: 1,
          agent: sandcastle.claudeCode(PLANNER),
          promptFile: "./.sandcastle/autopilot-prompt.md",
          promptArgs: { INSTRUCTIONS: instructions(j), BRANCH: branch, EPIC_BRANCH: j.epic.branch },
        });
        commits = done.commits.length;
      } finally {
        await box.close();
      }
      if (commits && tryGit(epicPath, "merge", "--no-edit", "--quiet", branch)) git(epicPath, "push", "--quiet", "origin", j.epic.branch);
      else if (commits) tryGit(epicPath, "merge", "--abort");
      git(undefined, "branch", "-D", branch);

      // A spec now waiting for review: tell the human.
      const [spec] = ghJson<Issue[]>("issue", "list", "--state", "open", "--milestone", j.epic.milestone, "--label", LABEL.spec, "--json", "number,title,state,body,labels,comments", "--limit", "5")
        .filter((i) => has(i, LABEL.human) && !has(i, LABEL.approved));
      const key = spec && `${spec.number}:${spec.comments?.length ?? 0}`;
      if (spec && key && j.kind !== "tickets" && !unblocks(j.epic.mode) && !announcedSpecs.has(key)) { // fast: approveSpecs decides
        announcedSpecs.add(key);
        await alert(`Spec ready for review: #${spec.number} ${spec.title} (epic #${j.epic.number}). Add the spec-approved label to approve, or comment what to change.`);
      }
      return commits > 0 || milestoneState(j.epic) !== before;
    } finally {
      gh("issue", "edit", String(j.epic.number), "--remove-label", LABEL.planning);
      planningEpics.delete(j.epic.number);
    }
  });
  const settled = await Promise.allSettled(runs);
  let moved = 0;
  for (const [i, outcome] of settled.entries()) {
    const key = `plan#${jobs[i]!.epic.number}`;
    const what = `Planning epic #${jobs[i]!.epic.number} (${jobs[i]!.kind})`;
    if (outcome.status === "fulfilled") {
      if (outcome.value) { cleared(key); moved++; } else if (outcome.value === false) await strike(key, what, "the run changed nothing");
      continue;
    }
    const reason = String(outcome.reason);
    if (isLimit(reason)) throw new Error(`usage limit: ${reason}`);
    await strike(key, what, reason);
    if ((strikes.get(key)?.count ?? 0) < STRIKE_ALERT) await alert(`${what} failed: ${reason.slice(0, 300)}`);
  }
  return moved;
}

// What a planning run can change in an epic's milestone, the epic itself
// left out (its planning label comes and goes): which issues it holds, and
// their state, labels, title and body. A comment alone isn't progress.
function milestoneState(epic: Epic): string {
  return gh("issue", "list", "--state", "all", "--milestone", epic.milestone, "--limit", "300", "--json", "number,state,title,body,labels",
    "--jq", `map(select(.number != ${epic.number}) | [.number, .state, .title, .body, ([.labels[].name] | sort)]) | sort | tostring`);
}

// An epic is done building when nothing in its milestone is open except the
// epic itself. Then its PR to main goes up (once), and every new commit on it
// is verified once. Returns the number of verifications run.
async function verifyEpics(): Promise<number> {
  const epics = ghJson<{ number: number; title: string; body: string; labels: { name: string }[]; milestone: { title: string } | null }[]>(
    "issue", "list", "--state", "open", "--label", LABEL.epic, "--json", "number,title,body,labels,milestone", "--limit", "100",
  );
  let ran = 0;
  for (const e of epics) {
    if (checking.has(e.number)) continue; // its check is still running
    if (!epicInScope(listedEpic(e))) continue;
    if (e.labels.some((l) => l.name === LABEL.backlog || l.name === LABEL.manual)) continue; // parked or hand-run: its PR is a person's too
    try {
      ran += await verifyEpic(e);
    } catch (error) {
      // One epic's check failing (a hung run, gh down) doesn't hold up the others.
      const reason = String(error);
      if (isLimit(reason)) throw error;
      await alert(`Checking epic #${e.number} failed: ${reason.slice(0, 300)}`);
    }
  }
  return ran;
}

async function verifyEpic(e: { number: number; title: string; body: string; labels: { name: string }[]; milestone: { title: string } | null }): Promise<number> {
  const branch = e.body.match(/`(epic\/[^`]+)`/)?.[1];
  const milestone = e.milestone?.title;
  if (!branch || !milestone || !tryGit(undefined, "ls-remote", "--exit-code", "--heads", "origin", branch)) return 0;
  const items = ghJson<{ number: number; title: string; state: string; body: string; labels: { name: string }[] }[]>("issue", "list", "--state", "all", "--milestone", milestone, "--json", "number,title,state,body,labels", "--limit", "300")
    .filter((i) => i.number !== e.number && !i.labels.some((l) => l.name === LABEL.backlog) && !isConflictTicket(i));
  if (!items.length || items.some((i) => i.state === "OPEN")) return 0; // not planned yet, or still building (backlog items don't count)
  // Planned means charted or specified. A milestone holding only bugs is an
  // epic nobody planned (its mockup got verified, #12), not one that is done.
  if (!items.some((i) => i.labels.some((l) => l.name === LABEL.map) || isSpec(i.labels.map((l) => l.name), i.body))) return 0;

  let [pr] = ghJson<{ number: number; headRefOid: string }[]>("pr", "list", "--state", "open", "--head", branch, "--json", "number,headRefOid");
  if (!pr) {
    if (suiteRunsFor(e, branch, milestone, items)) return 1; // the PR waits for the Run tickets just filed; they're ready now, so the next pass runs at once
    const url = gh("pr", "create", "--base", "main", "--head", branch, "--title", e.title, "--body",
      `Closes #${e.number}\n\nEvery ticket in milestone **${milestone}** is done. Verification runs next.`);
    log(`epic #${e.number} complete → ${url}`);
    [pr] = ghJson<{ number: number; headRefOid: string }[]>("pr", "list", "--state", "open", "--head", branch, "--json", "number,headRefOid");
    if (!pr) return 0;
  }
  git(undefined, "fetch", "--quiet", "origin", branch);
  const status = verifyStatus(pr.headRefOid);
  let verified = status.state;
  if (!verified && carryVerified(pr.number, pr.headRefOid)) verified = "success";
  if (verified === "success" && unblocks(modeOf(e.labels.map((l) => l.name)))) return mergeEpic(pr.number, e.number);
  if (verified === "success" || verified === "failure") return 0; // this commit is done
  // Pending: another loop (or this one before a restart) is checking it. A
  // check that never finished frees the commit after CHECK_STALE_MINUTES.
  if (verified === "pending" && Date.now() - Date.parse(status.updatedAt) < CHECK_STALE_MINUTES * 60_000) return 0;

  const verifyBranch = `agent/verify-${e.number}`;
  freeBranch(verifyBranch);
  git(undefined, "branch", "-f", verifyBranch, `origin/${branch}`);
  // Claim the commit before the sandbox starts, so another loop skips it.
  gh("api", `repos/${repo}/statuses/${pr.headRefOid}`, "-f", "state=pending", "-f", "context=verify-epic",
    "-f", `description=Verifying (agent loop on ${hostname()})`);
  log(`verifying epic #${e.number} (PR #${pr.number} at ${pr.headRefOid.slice(0, 7)})`);
  // The check runs beside the tickets, not before the next pass: tickets in
  // other epics keep building while it runs.
  checking.set(e.number, background(`Checking epic #${e.number}`, () => check(e.number, pr!, verifyBranch), () => checking.delete(e.number)));
  return 1;
}

async function check(epic: number, pr: { number: number; headRefOid: string }, verifyBranch: string) {
  try {
    await sandcastle.run({
      hooks,
      sandbox: container(verifyBranch),
      name: `verify #${epic}`,
      maxIterations: 1,
      branchStrategy: { type: "branch", branch: verifyBranch },
      agent: sandcastle.claudeCode(WORKER),
      promptFile: "./.sandcastle/verify-prompt.md",
      promptArgs: { PR: String(pr.number), EPIC: String(epic), SHA: pr.headRefOid, BRANCH: verifyBranch },
    });
  } finally {
    freeBranch(verifyBranch); // a run that died keeps its worktree otherwise
    tryGit(undefined, "branch", "-D", verifyBranch);
  }
}

// The slow suites of test-suites/ (see its README) as the branch under test
// defines them: a planner may have missed one, or added one on the branch.
type Suite = { name: string; file: string; command: string; covers: string[]; takes: string; runsVia: string };
function suitesAt(ref: string): Suite[] {
  let files: string[];
  try {
    files = git(undefined, "ls-tree", "--name-only", `${ref}:test-suites`).split("\n").filter((f) => f.endsWith(".md") && f !== "README.md");
  } catch { return []; } // no test-suites/ on that branch
  return files.flatMap((f) => { const s = parseSuite(git(undefined, "show", `${ref}:test-suites/${f}`), f); return s ? [s] : []; });
}
// The frontmatter's fields; `covers` as a `- ` list or an inline `[a, b]`.
function parseSuite(text: string, file: string): Suite | undefined {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!fm) return undefined;
  const field = (k: string) => fm.match(new RegExp(`^${k}:[ \\t]*(.*)$`, "m"))?.[1].trim() ?? "";
  const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");
  const list = (k: string) => {
    const inline = field(k);
    if (inline.startsWith("[")) return inline.slice(1, inline.lastIndexOf("]")).split(",").map(unquote).filter(Boolean);
    const block = fm.match(new RegExp(`^${k}:[ \\t]*\\n((?:[ \\t]+-[^\\n]*\\n?)*)`, "m"))?.[1] ?? "";
    return block.split("\n").map((l) => unquote(l.replace(/^\s*-\s*/, ""))).filter(Boolean);
  };
  const name = field("name") || file.replace(/\.md$/, "");
  return { name, file: `test-suites/${file}`, command: field("command"), covers: list("covers"), takes: field("takes"), runsVia: field("runs-via") || "sandbox" };
}

// Before an epic's PR goes up: every suite whose `covers` the epic's diff
// touches, with no "Run <suite>" ticket in the milestone yet, gets one, in
// the epic, labelled for an agent (or a person, for `runs-via: human`). The
// PR waits for it: a Run ticket is an open ticket like any other. Returns
// how many were filed.
function suiteRunsFor(e: { number: number; labels: { name: string }[] }, branch: string, milestone: string, items: { title: string }[]): number {
  tryGit(undefined, "fetch", "--quiet", "origin", "main", branch);
  const suites = suitesAt(`origin/${branch}`);
  if (!suites.length) return 0;
  const changed = git(undefined, "diff", "--name-only", `origin/main...origin/${branch}`).split("\n").filter(Boolean);
  const ran = new Set(items.map((i) => i.title.match(/^Run (\S+)/)?.[1]).filter(Boolean));
  let filed = 0;
  for (const s of suites) {
    if (ran.has(s.name) || !s.covers.length) continue;
    const touched = changed.filter((f) => s.covers.some((g) => matchesGlob(f, g)));
    if (!touched.length) continue;
    const labels = [LABEL.suiteRun, s.runsVia === "human" ? LABEL.human : LABEL.build, ...areasOf(e.labels).map((a) => `area:${a}`)];
    const shown = touched.slice(0, 5).map((f) => `\`${f}\``).join(", ") + (touched.length > 5 ? ` and ${touched.length - 5} more` : "");
    gh("issue", "create", "--title", `Run ${s.name}`, "--label", labels.join(","), "--milestone", milestone, "--body",
      `> *This was generated by AI in the agent loop.*\n\n\`${branch}\` changes files that \`${s.file}\` covers (${shown}), and this epic has no run of **${s.name}** yet. ` +
      `It runs on the finished epic branch; green closes this ticket, red files bugs under this epic that it then waits on. The epic's PR opens once it is closed.\n\n` +
      `- Suite: \`${s.file}\`\n- Command: \`${s.command}\`\n- Takes: ${s.takes || "?"}\n- Runs via: ${s.runsVia}\n\nPart of #${e.number}.`);
    log(`epic #${e.number}: filed "Run ${s.name}" (${s.runsVia}); its diff touches ${touched.length} file(s) the suite covers`);
    filed++;
  }
  return filed;
}

// The commit's verify-epic status: its state ("" when none) and when it was set.
function verifyStatus(sha: string): { state: string; updatedAt: string } {
  const found = gh("api", `repos/${repo}/commits/${sha}/status`, "--jq", '[.statuses[] | select(.context=="verify-epic")][0] // {} | "\\(.state // "") \\(.updated_at // "")"');
  const [state = "", updatedAt = ""] = found.split(" ");
  return { state, updatedAt };
}
const verifyState = (sha: string) => verifyStatus(sha).state;

// A new head commit that only changes loop or docs files (AGENTS_VERIFY_SKIP)
// since the newest verified commit inherits its green status, without a run.
function carryVerified(pr: number, head: string): boolean {
  if (!VERIFY_SKIP.length) return false;
  const shas = gh("api", "--paginate", `repos/${repo}/pulls/${pr}/commits`, "--jq", ".[].sha").split("\n").filter(Boolean);
  for (const sha of shas.reverse().slice(1, 30)) { // newest first, head excluded
    const state = verifyState(sha);
    if (!state) continue;
    if (state !== "success") return false; // the newest check didn't pass: check again
    const changed = git(undefined, "diff", "--name-only", sha, head).split("\n").filter(Boolean);
    if (!changed.every((f) => VERIFY_SKIP.some((g) => matchesGlob(f, g)))) return false;
    gh("api", `repos/${repo}/statuses/${head}`, "-f", "state=success", "-f", "context=verify-epic",
      "-f", `description=carried from ${sha.slice(0, 7)}: only loop/docs files changed`);
    log(`epic PR #${pr}: verify-epic carried from ${sha.slice(0, 7)} to ${head.slice(0, 7)} (only loop/docs files changed)`);
    return true;
  }
  return false;
}

// `**` crosses folders, `*` doesn't; a glob with no `/` matches the file name
// in any folder (`*.md`), like .gitignore.
function matchesGlob(file: string, glob: string): boolean {
  const re = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\0/g, ".*");
  return new RegExp(`^${glob.includes("/") ? "" : "(.*/)?"}${re}$`).test(file);
}

// Fast mode: a verified epic PR is merged, which closes the epic and frees the
// epics it blocks. A merge GitHub refuses (a required review, a red check) is
// asked of you once per PR.
const mergeAsked = new Set<number>();

async function mergeEpic(pr: number, epic: number): Promise<number> {
  for (const method of ["--merge", "--squash"]) {
    try {
      gh("pr", "merge", String(pr), method);
      await alert(`Epic #${epic} merged to main (fast mode): PR #${pr}.`);
      return 1;
    } catch { /* try the next method */ }
  }
  if (!mergeAsked.has(pr)) {
    mergeAsked.add(pr);
    await ask(`Epic #${epic} is verified, but GitHub refused to merge PR #${pr}. Merge it yourself: https://github.com/${repo}/pull/${pr}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Triage (AGENTS_TRIAGE=1)
// ---------------------------------------------------------------------------

// The GitHub workflow reacts to events; the loop polls state instead, which
// needs no memory between passes and catches what happened while it was off.
// The same skips as the workflow's gate apply: what a skill created (epics,
// specs, maps, tickets under an epic) is already shaped, backlog is parked,
// and only the repo's own people get a new issue triaged.
type OpenIssue = {
  number: number;
  title: string;
  authorAssociation: string;
  author: { login: string } | null;
  lastEditedAt: string | null;
  editor: { login: string } | null;
  labels: { nodes: { name: string }[] };
  parent: { labels: { nodes: { name: string }[] } } | null;
  comments: { nodes: { body: string; createdAt: string; authorAssociation: string; author: { login: string } | null }[] };
};
type TriageJob = { n: number; title: string; why: string };

const TRUSTED = ["OWNER", "MEMBER", "COLLABORATOR"];
// Any of these means a person or an earlier triage already decided.
const TRIAGED = ["bug", "enhancement", "needs-scoping", LABEL.needsInfo, "wontfix", "split", LABEL.build, LABEL.bug, LABEL.human, LABEL.review];
const SHAPED = [LABEL.epic, "initiative", LABEL.spec, LABEL.backlog];
const shaped = (labels: string[]) => labels.some((l) => SHAPED.includes(l) || l.startsWith("wayfinder:"));
const TRIAGE_SKILL = ".claude/skills/triage/UNATTENDED.md";
// Triage that didn't finish (no decision, or no comment) isn't retried until
// the loop restarts: retrying every pass would keep the loop from idling.
const triageFailed = new Set<number>();
let triageSkillMissing = false;

function openIssues(): OpenIssue[] {
  const [owner, name] = repo.split("/");
  const query = `query($owner: String!, $name: String!, $endCursor: String) {
    repository(owner: $owner, name: $name) {
      issues(states: OPEN, first: 100, after: $endCursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          number title authorAssociation author { login } lastEditedAt editor { login }
          labels(first: 30) { nodes { name } }
          parent { labels(first: 20) { nodes { name } } }
          comments(last: 1) { nodes { body createdAt authorAssociation author { login } } }
        }
      }
    }
  }`;
  return gh("api", "graphql", "--paginate", "-F", `owner=${owner}`, "-F", `name=${name}`, "-f", `query=${query}`,
    "--jq", ".data.repository.issues.nodes[]")
    .split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function triageJobs(): TriageJob[] {
  const jobs: TriageJob[] = [];
  for (const i of openIssues()) {
    const labels = i.labels.nodes.map((l) => l.name);
    if (triageFailed.has(i.number) || shaped(labels)) continue;
    const parent = i.parent?.labels.nodes.map((l) => l.name) ?? [];
    if (parent.some((l) => [LABEL.epic, "initiative", LABEL.map].includes(l))) continue;
    const reporter = i.author?.login;
    const job = (why: string) => jobs.push({ n: i.number, title: i.title, why });

    if (labels.includes(LABEL.triage)) { job("an earlier triage didn't finish, or someone asked for it with needs-triage"); continue; }
    if (!labels.some((l) => TRIAGED.includes(l))) {
      if (TRUSTED.includes(i.authorAssociation)) job("a new issue");
      continue;
    }
    if (!labels.includes(LABEL.needsInfo)) continue;
    // Waiting on information: a reply, or an edit made after the last triage
    // note, by the reporter or one of the repo's people, re-triages it.
    const last = i.comments.nodes[0];
    if (!last) continue;
    if (!isAiComment(last.body)) {
      if (TRUSTED.includes(last.authorAssociation) || last.author?.login === reporter) job("the reporter answered the triage notes");
    } else if (i.lastEditedAt && i.lastEditedAt > last.createdAt && (i.editor?.login === reporter || TRUSTED.includes(i.authorAssociation))) {
      job("the issue was edited after the triage notes");
    }
  }
  return jobs;
}

async function triage(): Promise<number> {
  if (!TRIAGE || SCOPED) return 0; // a scoped run works only on what it names
  if (!existsSync(TRIAGE_SKILL)) {
    if (!triageSkillMissing) await alert(`AGENTS_TRIAGE is on, but ${TRIAGE_SKILL} is missing: commit the triage skill to the repo (\`npx skills@latest add imick-io/skills\`).`);
    triageSkillMissing = true;
    return 0;
  }
  const jobs = triageJobs().slice(0, MAX_PARALLEL);
  if (!jobs.length) return 0;
  try { gh("label", "create", LABEL.triage, "--color", "ededed", "--description", "Triage hasn't finished", "--force"); } catch { /* exists */ }
  try { gh("label", "create", "split", "--color", "c5def5", "--description", "Split into one issue per ask", "--force"); } catch { /* exists */ }
  log(`triaging ${jobs.map((j) => `#${j.n}`).join(", ")}`);

  const settled = await Promise.allSettled(jobs.map(async (j) => {
    gh("issue", "edit", String(j.n), "--add-label", LABEL.triage);
    await sandcastle.run({
      sandbox: container(),
      name: `triage #${j.n}`,
      maxIterations: 1,
      agent: sandcastle.claudeCode(WORKER),
      promptFile: "./.sandcastle/triage-prompt.md",
      promptArgs: { ISSUE: String(j.n), TITLE: j.title, WHY: j.why },
    });
    const after = ghJson<{ labels: { name: string }[]; comments: { body: string }[] }>("issue", "view", String(j.n), "--json", "labels,comments");
    const labels = after.labels.map((l) => l.name);
    if (labels.includes(LABEL.triage) || !isAiComment(after.comments.at(-1)?.body ?? "")) {
      throw new Error("it finished without a decision and a triage comment; the issue stays as it is");
    }
    log(`#${j.n} triaged → ${labels.join(", ")}`);
    if (FEED) {
      await fetch(FEED, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `[${repo}] <${issueUrl(j.n)}|#${j.n} ${j.title}> → ${labels.join(" · ")}` }),
      }).catch(() => {});
    }
  }));
  let done = 0;
  for (const [n, outcome] of settled.entries()) {
    if (outcome.status === "fulfilled") { done++; continue; }
    const reason = String(outcome.reason);
    if (isLimit(reason)) throw new Error(`usage limit: ${reason}`);
    triageFailed.add(jobs[n]!.n);
    await alert(`Triage failed on #${jobs[n]!.n}: ${reason.slice(0, 300)}. The loop leaves it until it restarts. ${issueUrl(jobs[n]!.n)}`);
  }
  return done;
}

// ---------------------------------------------------------------------------
// Fast mode: unblocking
// ---------------------------------------------------------------------------

type Waiting = Issue & { milestone: { title: string } | null };
const unblockSchema = z.object({
  outcome: z.enum(["decided", "assumed", "asked"]),
  route: z.enum(["build", "bug", "close"]).optional(),
  summary: z.string(),
});
const followSchema = z.object({ outcome: z.enum(["kept", "updated", "followup"]), summary: z.string() });
// Issues fast mode leaves to you: parked ones (backlog), planning artefacts
// with their own flow, and an epic waiting for its /brief.
// A Run ticket handed to a person (a suite only they can run, or a run that
// couldn't start) is theirs to run, not a question to answer.
const NOT_UNBLOCKED = [LABEL.backlog, LABEL.manual, LABEL.epic, LABEL.spec, LABEL.map, LABEL.briefing, LABEL.unblocking, LABEL.suiteRun, "initiative", "needs-scoping"];
const labelledEpics = () => [LABEL.fast, LABEL.supersonic].some((label) => {
  try {
    return ghJson<unknown[]>("issue", "list", "--state", "open", "--label", label, "--json", "number", "--limit", "1").length > 0;
  } catch {
    return false; // no such label in this repo yet
  }
});
const lastIsAi = (i: Issue) => isAiComment(i.comments?.at(-1)?.body ?? AI_NOTE);

// The ready-for-human issues fast mode would take on. Reads only.
function unblockCandidates() {
  return ghJson<Waiting[]>("issue", "list", "--state", "open", "--label", LABEL.human,
    "--json", "number,title,state,body,labels,comments,milestone", "--limit", "100")
    .filter((i) => !NOT_UNBLOCKED.some((l) => has(i, l)) && !(has(i, LABEL.asked) && lastIsAi(i))) // asked: wait for your comment
    .map((i) => {
      const epic = epicFor(i.milestone?.title);
      return { i, epic, mode: epic ? epic.mode : modeOf(i.labels.map((l) => l.name)) };
    })
    .filter(({ epic, mode }) => !epic?.manual && unblocks(mode)) // a hand-run epic's questions are the person's
    .filter(({ i, epic }) => inScope(i.number, epic, i.labels))
    .filter(({ i, epic }) => !(epic && i.title === conflictTitle(epic))); // conflicts have their own step, in every mode
}

// The "Resolve conflicts" issues an agent takes on, in every mode: not a
// hand-run epic's, not parked, and not one already asked of you and waiting
// for your comment. Reads only.
function conflictCandidates() {
  return ghJson<Waiting[]>("issue", "list", "--state", "open", "--label", LABEL.human, "--search", `in:title "Resolve conflicts between"`,
    "--json", "number,title,state,body,labels,comments,milestone", "--limit", "50")
    .filter((i) => !has(i, LABEL.backlog) && !has(i, LABEL.unblocking) && !(has(i, LABEL.asked) && lastIsAi(i)))
    .map((i) => ({ i, epic: epicFor(i.milestone?.title) }))
    .filter(({ i, epic }) => epic && !epic.manual && epicInScope(epic) && i.title === conflictTitle(epic)) as { i: Waiting; epic: Epic }[];
}

// An agent resolves each paused epic's merge with main. Returns how many moved on.
async function resolveEpicConflicts(): Promise<number> {
  const jobs = conflictCandidates().filter(({ i }) => !benched(`conflict#${i.number}`));
  if (!jobs.length) return 0;
  // Its labels, which a normal-mode repo may not have yet (fast mode's unblocking creates them).
  for (const [name, color] of [[LABEL.asked, "fbca04"], [LABEL.unblocking, "fbca04"]] as const) {
    try { gh("label", "create", name, "--color", color, "--force"); } catch { /* exists */ }
  }
  let moved = 0;
  for (const { i, epic } of jobs) {
    if (await resolveConflicts(i, epic)) { cleared(`conflict#${i.number}`); moved++; }
    else await strike(`conflict#${i.number}`, `Resolving the conflicts of ${epic.branch} (#${i.number})`, "not resolved this time");
  }
  return moved;
}

async function unblock(): Promise<number> {
  if (MODE === "normal" && !labelledEpics()) return 0;
  for (const [name, color] of [[LABEL.fast, "d93f0b"], [LABEL.supersonic, "b60205"], [LABEL.asked, "fbca04"], [LABEL.assumed, "f9d0c4"], [LABEL.unblocking, "fbca04"]] as const) {
    try { gh("label", "create", name, "--color", color, "--force"); } catch { /* exists */ }
  }
  const approved = await approveSpecs();
  const followed = await followUps();
  const waiting = unblockCandidates().filter(({ i }) => !benched(`unblock#${i.number}`)).slice(0, MAX_PARALLEL);
  if (!waiting.length) return approved + followed;
  log(`unblocking ${waiting.map(({ i }) => `#${i.number}`).join(", ")}`);

  const settled = await Promise.allSettled(waiting.map(async ({ i, mode }) => {
    gh("issue", "edit", String(i.number), "--add-label", LABEL.unblocking);
    unblockingIssues.add(i.number);
    try {
      // Runs on the host's checkout (no branchStrategy) and only reads: no
      // install hook, or it would install into the host's node_modules.
      const run = await sandcastle.run({
        sandbox: container(),
        name: `unblock #${i.number}`,
        maxIterations: 1,
        agent: sandcastle.claudeCode(PLANNER),
        promptFile: "./.sandcastle/unblock-prompt.md",
        promptArgs: { ISSUE: String(i.number), TITLE: i.title, THRESHOLD: String(THRESHOLD), MODE: mode },
        output: sandcastle.Output.object({ tag: "unblock", schema: unblockSchema }),
      });
      const result = unblockSchema.parse(run.output);
      if (result.outcome === "asked") {
        gh("issue", "edit", String(i.number), "--add-label", LABEL.asked);
        await ask(`Your answer needed on #${i.number} ${i.title}: ${result.summary} Reply on the issue: ${issueUrl(i.number)}`);
        return;
      }
      const edit = ["issue", "edit", String(i.number), "--remove-label", LABEL.human, ...(has(i, LABEL.asked) ? ["--remove-label", LABEL.asked] : [])];
      if (result.route === "close") {
        gh(...edit);
        gh("issue", "close", String(i.number));
      } else {
        // Back to the agents' queue, which only takes unassigned issues.
        const assignees = ghJson<string[]>("issue", "view", String(i.number), "--json", "assignees", "--jq", "[.assignees[].login]");
        gh(...edit, "--add-label", result.route === "bug" ? LABEL.bug : LABEL.build, ...assignees.flatMap((a) => ["--remove-assignee", a]));
      }
      if (result.outcome === "assumed") {
        gh("issue", "edit", String(i.number), "--add-label", LABEL.assumed);
        noteAssumed({ n: i.number, title: i.title, summary: result.summary });
      }
      log(`#${i.number} unblocked (${result.outcome}): ${result.summary}`);
    } finally {
      gh("issue", "edit", String(i.number), "--remove-label", LABEL.unblocking);
      unblockingIssues.delete(i.number);
    }
  }));
  let decided = 0;
  for (const [n, outcome] of settled.entries()) {
    const key = `unblock#${waiting[n]!.i.number}`;
    if (outcome.status === "fulfilled") { cleared(key); decided++; continue; }
    const reason = String(outcome.reason);
    if (isLimit(reason)) throw new Error(`usage limit: ${reason}`);
    await strike(key, `Unblocking #${waiting[n]!.i.number}`, reason);
    if ((strikes.get(key)?.count ?? 0) < STRIKE_ALERT) await alert(`Unblocking #${waiting[n]!.i.number} failed: ${reason.slice(0, 300)}`);
  }
  return approved + followed + decided;
}

// Supersonic: you commented on something the loop assumed. An agent compares
// your answer with the assumption: the same, it's kept; different, the issue
// is edited (not built yet) or a follow-up ticket is filed (already built).
// The assumed issues you've commented on since. Reads only.
const followUpCandidates = () => ghJson<Waiting[]>("issue", "list", "--state", "all", "--label", LABEL.assumed,
  "--json", "number,title,state,body,labels,comments,milestone", "--limit", "50")
  .filter((i) => !lastIsAi(i) && !has(i, LABEL.unblocking) && inScope(i.number, epicFor(i.milestone?.title), i.labels));

async function followUps(): Promise<number> {
  const answered = followUpCandidates().filter((i) => !benched(`follow#${i.number}`)).slice(0, MAX_PARALLEL);
  let done = 0;
  for (const i of answered) {
    gh("issue", "edit", String(i.number), "--add-label", LABEL.unblocking);
    unblockingIssues.add(i.number);
    try {
      // Runs on the host's checkout (no branchStrategy) and only reads: no
      // install hook, or it would install into the host's node_modules.
      const run = await sandcastle.run({
        sandbox: container(),
        name: `follow up #${i.number}`,
        maxIterations: 1,
        agent: sandcastle.claudeCode(PLANNER),
        promptFile: "./.sandcastle/followup-prompt.md",
        promptArgs: { ISSUE: String(i.number), TITLE: i.title },
        output: sandcastle.Output.object({ tag: "followup", schema: followSchema }),
      });
      const result = followSchema.parse(run.output);
      gh("issue", "edit", String(i.number), "--remove-label", LABEL.assumed);
      log(`#${i.number} followed up (${result.outcome}): ${result.summary}`);
      cleared(`follow#${i.number}`);
      done++;
    } catch (error) {
      const reason = String(error);
      if (isLimit(reason)) throw error;
      await strike(`follow#${i.number}`, `Following up #${i.number}`, reason);
      if ((strikes.get(`follow#${i.number}`)?.count ?? 0) < STRIKE_ALERT) await alert(`Following up #${i.number} failed: ${reason.slice(0, 300)}`);
    } finally {
      gh("issue", "edit", String(i.number), "--remove-label", LABEL.unblocking);
      unblockingIssues.delete(i.number);
    }
  }
  return done;
}

// Supersonic: what the loop assumed reaches you once a day, not one ping each.
// Kept in a file so a restarted loop doesn't lose it.
type DigestItem = { n: number; title: string; summary: string };
function readDigest(): { sentAt: number; items: DigestItem[] } {
  try {
    return JSON.parse(readFileSync(DIGEST_FILE, "utf8"));
  } catch {
    return { sentAt: Date.now(), items: [] };
  }
}
function noteAssumed(item: DigestItem) {
  const digest = readDigest();
  digest.items.push(item);
  writeFileSync(DIGEST_FILE, JSON.stringify(digest));
}
async function sendDigest() {
  const digest = readDigest();
  if (!digest.items.length || Date.now() - digest.sentAt < DIGEST_HOURS * 3_600_000) return;
  const lines = digest.items.map((i) => `• #${i.n} ${i.title}: ${i.summary} ${issueUrl(i.n)}`);
  await ask(`Supersonic digest: the loop assumed ${digest.items.length} call(s) since the last one. Comment on an issue to change a call; a follow-up ticket fixes what's already built.\n${lines.join("\n")}`);
  writeFileSync(DIGEST_FILE, JSON.stringify({ sentAt: Date.now(), items: [] }));
}

// `main` conflicts with an epic branch: an agent resolves the merge. It gets
// the merge committed with its conflict markers, on a scratch branch; once it
// has resolved them, the loop lands a clean merge commit (the resolved tree,
// parents the epic tip and main) on the epic branch. An agent that can't
// resolve it explains on the ticket, and you're asked.
// Whether the issue moved on: resolved, or asked of you. False when it
// failed, or the epic branch moved underneath it.
async function resolveConflicts(issue: Issue, epic: Epic): Promise<boolean> {
  const n = issue.number;
  gh("issue", "edit", String(n), "--add-label", LABEL.unblocking);
  unblockingIssues.add(n);
  const branch = `agent/conflicts-${epic.number}`;
  try {
    const path = epicWorktree(epic);
    if (tryGit(path, "merge", "--no-edit", "--quiet", "origin/main")) { // resolved meanwhile, e.g. on main
      git(path, "push", "--quiet", "origin", epic.branch);
      gh("issue", "close", String(n), "--comment", `> *This was generated by AI in the agent loop.*\n\n\`main\` now merges cleanly into \`${epic.branch}\`.`);
      return true;
    }
    tryGit(path, "merge", "--abort");
    const base = git(path, "rev-parse", "HEAD");
    const main = git(undefined, "rev-parse", "origin/main");

    freeBranch(branch);
    git(undefined, "branch", "-f", branch, base);
    const scratch = `${WORKTREES}/conflicts-${epic.number}`;
    git(undefined, "worktree", "add", "--quiet", scratch, branch);
    let files: string;
    try {
      tryGit(scratch, "merge", "--no-edit", "--quiet", main);
      files = git(scratch, "diff", "--name-only", "--diff-filter=U");
      git(scratch, "add", "-A");
      git(scratch, "commit", "--quiet", "--no-verify", "-m", `WIP: merge main into ${epic.branch}, conflicts unresolved`);
    } finally {
      tryGit(undefined, "worktree", "remove", "--force", scratch);
    }

    log(`resolving conflicts of ${epic.branch} with main (#${n})`);
    const box = await sandcastle.createSandbox({ branch, sandbox: container(branch, { merges: true }), hooks: mergeHooks });
    let commits = 0;
    try {
      const done = await box.run({
        name: `conflicts #${epic.number}`,
        maxIterations: 20,
        agent: sandcastle.claudeCode(PLANNER),
        promptFile: "./.sandcastle/conflicts-prompt.md",
        promptArgs: { ISSUE: String(n), BRANCH: branch, EPIC: String(epic.number), EPIC_BRANCH: epic.branch, FILES: files },
      });
      commits = done.commits.length;
    } finally {
      await box.close();
    }

    const markers = tryGit(undefined, "grep", "-q", "-E", "^(<<<<<<<|>>>>>>>)( |$)", branch);
    if (!commits || markers) {
      gh("issue", "edit", String(n), "--add-label", LABEL.asked);
      await ask(`The loop couldn't resolve the conflicts between ${epic.branch} and main (epic #${epic.number}). See #${n}: ${issueUrl(n)}`);
      return true;
    }
    const tree = git(undefined, "rev-parse", `${branch}^{tree}`);
    const merge = git(undefined, "commit-tree", tree, "-p", base, "-p", main, "-m",
      `Merge main into ${epic.branch}\n\nConflicts resolved by the agent loop (#${n}).`);
    if (!tryGit(path, "merge", "--ff-only", "--quiet", merge)) return false; // the epic branch moved: the next pass retries
    git(path, "push", "--quiet", "origin", epic.branch);
    gh("issue", "edit", String(n), "--remove-label", LABEL.human, ...(has(issue, LABEL.asked) ? ["--remove-label", LABEL.asked] : []));
    gh("issue", "close", String(n), "--comment",
      `> *This was generated by AI in the agent loop.*\n\nConflicts resolved by the loop and merged into \`${epic.branch}\` (${merge.slice(0, 7)}): ${files.split("\n").map((f) => `\`${f}\``).join(", ")}. They ship with the epic's PR (#${epic.number}): review them there.`);
    log(`${epic.branch}: conflicts with main resolved`);
    return true;
  } catch (error) {
    const reason = String(error);
    if (isLimit(reason)) throw error;
    await alert(`Resolving conflicts of ${epic.branch} failed: ${reason.slice(0, 300)}`);
    return false;
  } finally {
    tryGit(undefined, "branch", "-D", branch);
    gh("issue", "edit", String(n), "--remove-label", LABEL.unblocking);
    unblockingIssues.delete(n);
  }
}

// A spec waiting for review is approved when every line of its "Decided on
// autopilot" section is at or above the threshold. Otherwise, in fast mode,
// the lines below it are asked of you, once per spec version: comment your
// calls (the revise job applies them) or add `spec-approved` to accept them.
// Supersonic approves it anyway: the low lines stand as assumed, reach you in
// the digest, and your comment on the spec becomes follow-up tickets.
const SPEC_ASK = "**Fast mode: your call needed**";

// The specs fast mode would approve now, or ask you about. Reads only.
const specCandidates = () => ghJson<Waiting[]>("issue", "list", "--state", "open", "--label", LABEL.spec, "--label", LABEL.human,
  "--json", "number,title,state,body,labels,comments,milestone", "--limit", "50")
  .filter((s) => !has(s, LABEL.approved) && !has(s, LABEL.backlog) && unblocks(epicFor(s.milestone?.title)?.mode))
  .filter((s) => epicInScope(epicFor(s.milestone?.title)))
  .filter((s) => lastIsAi(s) && !s.comments?.at(-1)?.body.includes(SPEC_ASK)); // not a revision pending, nor waiting for you

async function approveSpecs(): Promise<number> {
  let approved = 0;
  for (const s of specCandidates()) {
    const mode = epicFor(s.milestone?.title)?.mode;
    const decided = s.body.split(/^## Decided on autopilot\s*$/m)[1]?.split(/^## /m)[0] ?? "";
    const low = decided.split("\n").filter((line) => Number(line.match(/(\d{1,3})%/)?.[1] ?? 100) < THRESHOLD);
    if (!low.length) {
      gh("issue", "edit", String(s.number), "--add-label", LABEL.approved);
      comment(s.number, `Approved by the loop in ${mode} mode: every decision taken on autopilot is at ${THRESHOLD}% or above. Its tickets are cut next.`);
      log(`spec #${s.number} approved (${mode} mode)`);
      approved++;
      continue;
    }
    if (mode === "supersonic") {
      gh("issue", "edit", String(s.number), "--add-label", LABEL.approved, "--add-label", LABEL.assumed);
      comment(s.number, `Approved by the loop in supersonic mode. ${low.length === 1 ? "This decision is" : "These decisions are"} below ${THRESHOLD}% and stand as assumed; comment here to change one, and a follow-up ticket fixes it.\n\n${low.join("\n")}`);
      noteAssumed({ n: s.number, title: s.title, summary: `${low.length} assumed decision(s) in the spec` });
      log(`spec #${s.number} approved with ${low.length} assumed decision(s) (supersonic)`);
      approved++;
      continue;
    }
    comment(s.number, `${SPEC_ASK}: ${low.length === 1 ? "this decision is" : "these decisions are"} below ${THRESHOLD}%. Comment your call on each (or that it stands), or add the \`spec-approved\` label to accept them as they are.\n\n${low.join("\n")}`);
    await ask(`Your call needed on ${low.length} decision(s) in spec #${s.number} ${s.title}: ${issueUrl(s.number)}`);
  }
  return approved;
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

// The tracker page is a convenience: a failed rebuild is logged, never fatal.
function syncTracker() {
  if (!existsSync("tracker/build.mjs")) return;
  try {
    execFileSync(process.execPath, ["tracker/build.mjs", "--no-open"], { stdio: "ignore", timeout: 120_000 });
  } catch (error) {
    log(`tracker rebuild failed: ${String(error).slice(0, 200)}`);
  }
}

// One loop per checkout. Two loops in the same folder share its worktrees:
// one freeing a branch for its run deletes the folder the other's agent works
// in, which then sits silent until the idle timeout (EveryShelf, 2026-10-28).
// Loops on different machines are fine: claims and check statuses keep them apart.
// Whether a process with this pid is alive (EPERM: alive, not ours).
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

// ---------------------------------------------------------------------------
// Scope (--epic, --tickets, --area)
// ---------------------------------------------------------------------------

type ScopeIssue = { number: number; title: string; state: string; labels: { name: string }[]; assignees: { login: string }[]; milestone: { title: string } | null };
const viewScoped = (n: number) =>
  ghJson<ScopeIssue>("issue", "view", String(n), "--json", "number,title,state,labels,assignees,milestone");

// What a scoped run won't touch among what it names, and why: said at start
// and in --dry-run, so a typo or a parked ticket doesn't look like a sleeping loop.
function scopeNotes(): string[] {
  const notes: string[] = [];
  const labelled = (i: ScopeIssue, l: string) => i.labels.some((x) => x.name === l);
  if (SCOPE_AREAS) {
    const epics = ghJson<{ number: number; labels: { name: string }[] }[]>(
      "issue", "list", "--state", "open", "--label", LABEL.epic, "--json", "number,labels", "--limit", "200");
    for (const a of SCOPE_AREAS) {
      if (a === "none") continue;
      if (!epics.some((e) => areasOf(e.labels).some((x) => x === a || x.startsWith(`${a}:`))))
        notes.push(`no open epic is labelled \`area:${a}\` (a typo? see docs/agents/team.md): only tickets outside epics with that label would run`);
    }
  }
  for (const n of SCOPE_EPICS ?? []) {
    try {
      const e = viewScoped(n);
      if (!labelled(e, LABEL.epic)) notes.push(`#${n} isn't an epic (no \`${LABEL.epic}\` label): pass it with --tickets`);
      else if (e.state !== "OPEN") notes.push(`epic #${n} is closed`);
      else if (labelled(e, LABEL.manual)) notes.push(`epic #${n} is \`${LABEL.manual}\`: the loop never touches it (/run-epic builds it in a session)`);
      else if (labelled(e, LABEL.backlog)) notes.push(`epic #${n} is in the backlog: nothing under it runs until the label goes`);
    } catch { notes.push(`#${n} wasn't found`); }
  }
  for (const n of SCOPE_TICKETS ?? []) {
    try {
      const i = viewScoped(n);
      const epic = epicFor(i.milestone?.title);
      const waits = (why: string) => notes.push(`#${n} ${why}`);
      if (i.state !== "OPEN") waits("is closed");
      else if (labelled(i, LABEL.epic)) waits(`is an epic: pass it with --epic`);
      else if (!labelled(i, LABEL.build) && !labelled(i, LABEL.bug)) waits(`isn't \`${LABEL.build}\` or \`${LABEL.bug}\`, so it isn't queued (/run-ticket builds it in a session)`);
      else if (labelled(i, LABEL.backlog)) waits("is in the backlog");
      else if (i.assignees.length) waits(`is assigned to ${i.assignees.map((a) => `@${a.login}`).join(", ")}: unassign it to queue it`);
      else if (epic?.manual) waits(`is under \`${LABEL.manual}\` epic #${epic.number}: the loop never builds it (/run-ticket does)`);
      else if (Number(gh("api", `repos/${repo}/issues/${n}`, "--jq", ".issue_dependencies_summary.blocked_by // 0")) > 0) waits("is blocked: it starts when its blockers close");
      else if (epic && EPIC_GATE === "epic" && epicBlocked(epic)) waits(`waits for epic #${epic.number}, which other epics block`);
    } catch { notes.push(`#${n} wasn't found`); }
  }
  return notes;
}

// What's left in scope: an open epic (more can come under it: a spec to
// approve, a check's gaps, its PR to merge), or a ticket still queued for
// the agents. A ticket that landed, went into a PR (`ready-for-review`) or
// was handed to a person is done for this run.
function scopeLeft(): string[] {
  const left: string[] = [];
  for (const n of SCOPE_EPICS ?? []) {
    try {
      const e = viewScoped(n);
      if (e.state === "OPEN" && e.labels.some((l) => l.name === LABEL.epic) && !e.labels.some((l) => l.name === LABEL.manual)) left.push(`epic #${n}`);
    } catch { /* not found: nothing to wait for */ }
  }
  for (const n of SCOPE_TICKETS ?? []) {
    try {
      const i = viewScoped(n);
      if (i.state === "OPEN" && i.labels.some((l) => l.name === LABEL.build || l.name === LABEL.bug) && !epicFor(i.milestone?.title)?.manual) left.push(`#${n}`);
    } catch { /* not found */ }
  }
  return left;
}

// ---------------------------------------------------------------------------
// Dry run (--dry-run): the next pass's choices, changing nothing
// ---------------------------------------------------------------------------

// Read by /why-sleeping (and you): it runs beside a live loop, takes no lock,
// and reads the live loop's status file for what it's building and has
// backed off. The planner isn't run: `build` is the queue it would pick from.
type DryItem = { number: number; title: string; what: string };
function dryRun() {
  let live: { pid?: number; state?: string; until?: string; lastPassAt?: string; building?: number[]; checking?: number[];
    unstarted?: { tickets: number[]; why: string[] }; backoff?: { key: string; count: number; until: string; what: string; why: string }[] } = {};
  try {
    const read = JSON.parse(readFileSync(STATUS_FILE, "utf8"));
    if (read.pid && alive(read.pid)) live = read;
  } catch { /* no loop running here */ }
  const backoff = (live.backoff ?? []).filter((b) => Date.parse(b.until) > Date.now());
  const off = (key: string) => backoff.some((b) => b.key === key);
  const item = (number: number, title: string, what: string): DryItem => ({ number, title, what });

  const ready = readyTickets();
  const free = MAX_PARALLEL - (live.building?.length ?? 0);
  const build = ready.filter((t) => !off(`build#${t.number}`))
    .map((t) => item(t.number, t.title, t.epic ? `build on ${t.epic.branch}` : `build, then a PR to main`));
  const plan = PLANNING ? planJobs().filter((j) => !off(`plan#${j.epic.number}`) && !conflictOpen(j.epic))
    .map((j) => item(j.epic.number, j.epic.title, `plan (${j.kind}${j.spec ? `, spec #${j.spec}` : j.map ? `, map #${j.map}` : ""})`)) : [];
  const verify = epicsToCheck().filter((e) => !(live.checking ?? []).includes(e.number));
  const triage = TRIAGE && !SCOPED && existsSync(TRIAGE_SKILL) ? triageJobs().map((j) => item(j.n, j.title, `triage: ${j.why}`)) : [];
  const fastOn = MODE !== "normal" || labelledEpics();
  const unblock = fastOn ? unblockCandidates().filter(({ i }) => !off(`unblock#${i.number}`))
    .map(({ i }) => item(i.number, i.title, "decide it, or ask you")) : [];
  const conflicts = conflictCandidates().filter(({ i }) => !off(`conflict#${i.number}`))
    .map(({ i, epic }) => item(i.number, i.title, `resolve ${epic.branch}'s merge with main (epic #${epic.number})`));
  const followUp = fastOn ? followUpCandidates().filter((i) => !off(`follow#${i.number}`)).map((i) => item(i.number, i.title, "follow up your comment")) : [];
  const specs = fastOn ? specCandidates().map((s) => item(s.number, s.title, "approve the spec, or ask you")) : [];
  const scope = SCOPED ? { epics: [...(SCOPE_EPICS ?? [])], tickets: [...(SCOPE_TICKETS ?? [])], areas: [...(SCOPE_AREAS ?? [])], notes: scopeNotes(), left: scopeLeft() } : null;
  const result = {
    loop: live.pid ? { pid: live.pid, state: live.state, until: live.until, lastPassAt: live.lastPassAt, building: live.building ?? [], checking: live.checking ?? [], unstarted: live.unstarted } : null,
    freeSlots: Math.max(free, 0),
    scope,
    build, plan, verify, conflicts, triage, unblock, followUp, specs, backoff,
  };
  if (JSON_OUT) { console.log(JSON.stringify(result, null, 2)); return; }

  const at = (iso?: string) => iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "?";
  const out = ["# The loop's next pass (dry run: nothing was changed)", ""];
  out.push(live.pid
    ? `Loop running (pid ${live.pid}): ${live.state}${live.until ? ` until ~${at(live.until)}` : ""}, last pass ${at(live.lastPassAt)}${live.building?.length ? `, building ${live.building.map((n) => `#${n}`).join(", ")}` : ""}.`
    : "No loop running here: this is what one would do if started now.", "");
  if (scope) {
    out.push(SCOPE_ENDS
      ? `Scoped to ${SCOPE_LABEL}: nothing else is touched, and the run exits once nothing in scope is left${scope.left.length ? ` (left now: ${scope.left.join(", ")})` : " (nothing is: it would exit at once)"}.`
      : `Scoped to ${SCOPE_LABEL}: nothing else is touched (no triage), and the run keeps going like an unscoped one.`, "");
    if (scope.notes.length) out.push("## Named but not worked", ...scope.notes.map((n) => `- ${n}`), "");
  }
  const section = (title: string, items: DryItem[]) => {
    if (!items.length) return;
    out.push(`## ${title}`, ...items.map((i) => `- #${i.number} ${i.title}: ${i.what}`), "");
  };
  section(`Build (${result.freeSlots} free slot(s); the planner picks among these)`, build);
  section("Plan", plan);
  section("Verify or merge", verify);
  section("Resolve conflicts with main", conflicts);
  section("Triage", triage);
  section("Unblock (fast mode)", unblock);
  section("Follow up (supersonic)", followUp);
  section("Decide specs (fast mode)", specs);
  if (backoff.length) out.push("## Backed off (failed or changed nothing)", ...backoff.map((b) => `- ${b.what}: ${b.count} strike(s), next try ~${at(b.until)}. ${b.why}`), "");
  if (![build, plan, verify, conflicts, triage, unblock, followUp, specs].some((l) => l.length))
    out.push(scope && SCOPE_ENDS && !scope.left.length ? "Nothing to do, and nothing in scope is left: the run would exit after one pass." : "Nothing to do: the next pass would find no work, and the loop would sleep.");
  console.log(out.join("\n").trimEnd());
}

// The epic PRs a pass would open, check or merge. Reads only: a commit that
// could carry its last green status (AGENTS_VERIFY_SKIP) is listed as a check.
function epicsToCheck(): DryItem[] {
  const epics = ghJson<{ number: number; title: string; body: string; labels: { name: string }[]; milestone: { title: string } | null }[]>(
    "issue", "list", "--state", "open", "--label", LABEL.epic, "--json", "number,title,body,labels,milestone", "--limit", "100");
  const items: DryItem[] = [];
  for (const e of epics) {
    if (!epicInScope(listedEpic(e))) continue;
    if (e.labels.some((l) => l.name === LABEL.backlog || l.name === LABEL.manual)) continue;
    const branch = e.body.match(/`(epic\/[^`]+)`/)?.[1];
    const milestone = e.milestone?.title;
    if (!branch || !milestone || !tryGit(undefined, "ls-remote", "--exit-code", "--heads", "origin", branch)) continue;
    const open = ghJson<{ number: number; state: string; labels: { name: string }[] }[]>("issue", "list", "--state", "all", "--milestone", milestone, "--json", "number,state,labels", "--limit", "300")
      .filter((i) => i.number !== e.number && !i.labels.some((l) => l.name === LABEL.backlog));
    if (!open.length || open.some((i) => i.state === "OPEN")) continue;
    const [pr] = ghJson<{ number: number; headRefOid: string }[]>("pr", "list", "--state", "open", "--head", branch, "--json", "number,headRefOid");
    if (!pr) { items.push({ number: e.number, title: e.title, what: "every ticket is done: open its PR to main, then verify it" }); continue; }
    const status = verifyStatus(pr.headRefOid);
    if (status.state === "success" && unblocks(modeOf(e.labels.map((l) => l.name)))) items.push({ number: e.number, title: e.title, what: `merge PR #${pr.number} (verified, fast mode)` });
    else if (status.state === "success" || status.state === "failure") continue;
    else if (status.state === "pending" && Date.now() - Date.parse(status.updatedAt) < CHECK_STALE_MINUTES * 60_000) continue;
    else items.push({ number: e.number, title: e.title, what: `verify PR #${pr.number} at ${pr.headRefOid.slice(0, 7)}` });
  }
  return items;
}

if (DRY_RUN) {
  dryRun();
  process.exit(0);
}

const LOCK = ".sandcastle/loop.pid";
const holder = Number(existsSync(LOCK) ? readFileSync(LOCK, "utf8").trim() : 0);
if (holder && holder !== process.pid && alive(holder)) {
  console.error(`[agents] Another agent loop (pid ${holder}) is already running in this folder. Stop it first (\`npm run agents:stop\`, or \`kill -INT ${holder}\`), or run this one from another clone.`);
  process.exit(1);
}
writeFileSync(LOCK, String(process.pid));
process.on("exit", () => {
  try {
    if (readFileSync(LOCK, "utf8").trim() === String(process.pid)) rmSync(LOCK, { force: true });
  } catch { /* already gone */ }
  try { rmSync(STATUS_FILE, { force: true }); } catch { /* already gone */ }
});

// Starting the loop is the clearest sign you want it running: a stop file
// left by an earlier request (or a stop asked for while nothing ran) is cleared.
if (existsSync(STOP_FILE)) {
  rmSync(STOP_FILE, { force: true });
  log("cleared an earlier stop request");
}

// A loop here that died without its SIGINT handler (a crash, a power cut,
// kill -9) left what it held: claims nobody builds, and planning or unblocking
// labels that make every loop skip those issues. The lock above means it's
// gone. A claim is released only when the ticket is still assigned and nobody
// claimed it again since (you with /claim use the same account).
function cleanUpAfterDeadLoop() {
  if (!existsSync(HELD_FILE)) return;
  let held: { pid?: number; claims?: { number: number; at: string }[]; planning?: number[]; unblocking?: number[] };
  try { held = JSON.parse(readFileSync(HELD_FILE, "utf8")); } catch { held = {}; }
  rmSync(HELD_FILE, { force: true });
  const done: string[] = [];
  for (const c of held.claims ?? []) {
    try {
      const issue = ghJson<{ state: string; assignees: { login: string }[] }>("issue", "view", String(c.number), "--json", "state,assignees");
      if (issue.state !== "OPEN" || !issue.assignees.some((a) => a.login === me)) continue;
      const lastAssigned = gh("api", `repos/${repo}/issues/${c.number}/events`, "--paginate", "--jq", '[.[] | select(.event == "assigned") | .created_at] | last // ""')
        .split("\n").filter(Boolean).at(-1) ?? "";
      if (lastAssigned && Date.parse(lastAssigned) > Date.parse(c.at) + 60_000) continue; // claimed again since: someone's on it
      gh("issue", "edit", String(c.number), "--remove-assignee", me);
      done.push(`#${c.number} unassigned`);
    } catch (error) {
      log(`couldn't release #${c.number}: ${String(error).slice(0, 200)}`);
    }
  }
  for (const [label, numbers] of [[LABEL.planning, held.planning ?? []], [LABEL.unblocking, held.unblocking ?? []]] as const) {
    for (const n of numbers) {
      try {
        const labels = ghJson<string[]>("issue", "view", String(n), "--json", "labels", "--jq", "[.labels[].name]");
        if (!labels.includes(label)) continue;
        gh("issue", "edit", String(n), "--remove-label", label);
        done.push(`#${n} ${label} removed`);
      } catch (error) {
        log(`couldn't remove ${label} from #${n}: ${String(error).slice(0, 200)}`);
      }
    }
  }
  if (done.length) {
    log(`cleaned up after a loop that died (pid ${held.pid ?? "?"}): ${done.join(", ")}`);
    void alert(`The agent loop restarted after one died without cleaning up (pid ${held.pid ?? "?"}); it released: ${done.join(", ")}.`);
  }
}

// Worktrees of ticket, planning and check branches: nothing runs in them at
// start (the lock), so a sandbox that died left them, and they'd hold their
// branch against the next run. The commits stay on the branch. Epic worktrees
// are kept: the loop reuses them.
function freeLeftoverWorktrees() {
  const freed: string[] = [];
  for (const block of git(undefined, "worktree", "list", "--porcelain").split("\n\n")) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
    if (!path || !branch || !path.includes(`/${WORKTREES}/`) || branch.startsWith("epic/")) continue;
    if (tryGit(undefined, "worktree", "remove", "--force", path)) freed.push(branch);
  }
  tryGit(undefined, "worktree", "prune");
  if (freed.length) log(`freed ${freed.length} branch(es) left in sandbox worktrees: ${freed.join(", ")}`);
}

try { cleanUpAfterDeadLoop(); } catch (error) { log(`cleanup after a dead loop skipped: ${String(error).slice(0, 200)}`); }
try { freeLeftoverWorktrees(); } catch (error) { log(`worktree cleanup skipped: ${String(error).slice(0, 200)}`); }
saveHeld();

// Every open issue and PR, with when it last changed: a person approving,
// answering, merging or labelling changes it, and so does a ticket closing.
type Snapshot = Map<string, string>;
function snapshot(): Snapshot | undefined {
  try {
    const seen: Snapshot = new Map();
    for (const kind of ["issue", "pr"] as const) {
      for (const x of ghJson<{ number: number; updatedAt: string }[]>(kind, "list", "--state", "open", "--limit", "500", "--json", "number,updatedAt"))
        seen.set(`#${x.number}`, x.updatedAt);
    }
    return seen;
  } catch {
    return undefined; // gh down: wait out the time instead
  }
}
// What changed, leaving out the tickets this loop is building: their agents
// comment and label them as they go, and their landing wakes the loop anyway.
function changes(before: Snapshot, now: Snapshot): string[] {
  const mine = new Set([...inFlight].map((t) => `#${t.number}`));
  return [...new Set([...before.keys(), ...now.keys()])].filter((k) => !mine.has(k) && before.get(k) !== now.get(k));
}

// Sleeps in one-minute steps so a stop request ends an idle wait promptly.
// With `wakeable`, a job finishing (a free slot) ends it at once. With
// `watch`, so does a change on GitHub, looked for every POLL_MINUTES.
async function idle(minutes: number, { wakeable = false, watch = false, state = "asleep" as LoopState } = {}) {
  writeStatus(state, minutes);
  const before = watch && POLL_MINUTES > 0 ? snapshot() : undefined;
  for (let i = 0; i < minutes && !stopRequested(); i++) {
    if (wakeable && woken) break;
    await Promise.race([sleep(60_000), new Promise<void>((resolve) => { if (wakeable) wakeUp = resolve; })]);
    if (wakeable && woken) break;
    if (before && (i + 1) % POLL_MINUTES === 0 && i + 1 < minutes) {
      const now = snapshot();
      const changed = now ? changes(before, now) : [];
      if (changed.length) {
        log(`GitHub changed (${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ", …" : ""}); passing now`);
        break;
      }
    }
  }
  woken = false;
}

const busy = () => running.size + checking.size;

// Lets every running ticket and check finish (a stop, or the end of --once).
async function drain() {
  while (busy()) await Promise.allSettled([...running.values(), ...checking.values()]);
  runCiOnBatches(); // no pass follows to do it
}

async function stopNicely(worked: number) {
  worked += busy();
  if (busy()) log(`stopping: waiting for ${busy()} running ticket(s) and check(s) to land`);
  await drain();
  rmSync(STOP_FILE, { force: true });
  log(worked ? "stopped nicely after landing the in-flight work" : "stopped nicely; nothing was in flight");
  await alert(`Agent loop stopped nicely${worked ? " after landing its in-flight work" : ""}. Start it again with \`npm run agents:awake\`.`);
  process.exit(0);
}

log(`started (pid ${process.pid}); \`npm run agents:stop\` stops it nicely`);
if (SCOPED) {
  log(`scoped to ${SCOPE_LABEL}: nothing else is touched (no triage)${SCOPE_ENDS ? ", and it exits once nothing in scope is left" : ""}`);
  try { for (const note of scopeNotes()) log(`scope: ${note}`); } catch (error) { log(`scope check skipped: ${String(error).slice(0, 200)}`); }
}
let limitAlerted = false;
let failures = 0; // failed passes in a row
for (;;) {
  let worked = 0;
  syncTracker();
  try {
    const strays = sweepContainers();
    if (strays) log(`removed ${strays} isolated sandbox container(s) left by failed or interrupted runs`);
  } catch (error) {
    log(`sandbox sweep skipped: ${String(error).slice(0, 200)}`);
  }
  try {
    worked = await pass();
    await sendDigest();
    limitAlerted = false;
    failures = 0;
  } catch (error) {
    const message = String(error);
    if (isLimit(message)) {
      if (!limitAlerted) await alert(`Usage limit reached; the agent loop sleeps ${LIMIT_SLEEP_MINUTES} min and retries.`);
      limitAlerted = true;
      if (ONCE) { await drain(); break; }
      if (stopRequested()) await stopNicely(0);
      await idle(LIMIT_SLEEP_MINUTES, { state: "limit" });
      continue;
    }
    failures++;
    const wait = Math.min(RETRY_MINUTES * 2 ** (failures - 1), IDLE_MINUTES);
    await alert(`Agent loop pass failed; retrying in ${wait} min: ${message.slice(0, 500)}`);
    syncTracker();
    if (ONCE) { await drain(); process.exit(1); }
    if (stopRequested()) await stopNicely(0);
    await idle(wait, { state: "retrying" });
    if (stopRequested()) await stopNicely(0);
    continue;
  }
  syncTracker();
  if (ONCE) {
    await drain();
    syncTracker();
    break;
  }
  if (stopRequested()) await stopNicely(worked);
  // A scoped run ends with its scope: every ticket in it landed, in a PR or
  // handed to a person, every epic in it closed.
  if (SCOPE_ENDS && !busy()) {
    let left: string[] | undefined;
    try { left = scopeLeft(); } catch { /* gh down: look again next time */ }
    if (left && !left.length) {
      runCiOnBatches();
      syncTracker();
      await alert(`Agent loop done with ${SCOPE_LABEL}: nothing in scope is left to work, so it stopped.`);
      process.exit(0);
    }
  }
  if (busy()) {
    // Work is running: pass again when a slot frees up, or after the idle
    // time for what arrived meanwhile; at once when the queue just changed.
    if (!changedQueue) await idle(unstarted.retry ? RETRY_MINUTES : IDLE_MINUTES, { wakeable: true, watch: true, state: "building" });
    continue;
  }
  if (!worked && unstarted.retry) {
    log(`${unstarted.tickets.map((n) => `#${n}`).join(", ")} ready but not started (${unstarted.why.join("; ")}); looking again in ${RETRY_MINUTES} min`);
    await idle(RETRY_MINUTES, { watch: true, state: "retrying" });
    if (stopRequested()) await stopNicely(0);
  } else if (!worked) {
    log(`nothing ready; sleeping ${IDLE_MINUTES} min${POLL_MINUTES > 0 ? `, or until something changes on GitHub` : ""}`);
    await idle(IDLE_MINUTES, { watch: true });
    if (stopRequested()) await stopNicely(0);
  }
}
