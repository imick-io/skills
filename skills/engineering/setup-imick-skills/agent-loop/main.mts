// Agent loop: works this repo's agent queue with Sandcastle, forever or once.
//
//   npm run agents                    loop: plan autopilot epics, work every
//                                     ready ticket, sleep when idle
//   npm run agents -- --once          one pass, then exit
//   npm run agents -- --no-planning   build only: leave epic planning to others
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
//      /to-tickets, never built directly).
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
//      PR to main ("Closes #epic").
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
//   - main conflicting with an epic branch: an agent resolves the merge,
//     instead of the epic waiting for you,
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
// Before and after every pass the issue tracker page (tracker/index.html)
// is rebuilt, so an open tracker tab follows the loop.
//
// Adapted from Sandcastle's parallel-planner-with-review template
// (https://github.com/mattpocock/sandcastle, MIT).

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration (env overrides, e.g. in .sandcastle/.env or the shell)
// ---------------------------------------------------------------------------

const ONCE = process.argv.includes("--once");
const PLANNING = !process.argv.includes("--no-planning");
const IDLE_MINUTES = Number(process.env.AGENTS_IDLE_MINUTES ?? 45);
// After a failed pass (not a usage limit) the loop retries soon, doubling the
// wait for each failure in a row, up to AGENTS_IDLE_MINUTES.
const RETRY_MINUTES = Number(process.env.AGENTS_RETRY_MINUTES ?? 5);
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
const inFlight = new Set<Ticket>();
const planningEpics = new Set<number>();
const unblockingIssues = new Set<number>();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    for (const t of inFlight) { try { release(t, `${signal}: quitting, branch kept for the next run`); } catch { /* best effort */ } }
    for (const n of planningEpics) { try { gh("issue", "edit", String(n), "--remove-label", LABEL.planning); } catch { /* best effort */ } }
    for (const n of unblockingIssues) { try { gh("issue", "edit", String(n), "--remove-label", LABEL.unblocking); } catch { /* best effort */ } }
    const released = inFlight.size + planningEpics.size + unblockingIssues.size;
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
  existsSync("pnpm-lock.yaml") ? "CI=true pnpm install --frozen-lockfile"
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
const container = () => docker({
  mounts: [{ hostPath: CACHE, sandboxPath: SANDBOX_CACHE }],
  // pnpm's store goes in the environment, not on the install's command line:
  // pnpm 11 checks the dependencies before every `pnpm <script>`, and a store
  // other than the one the install used makes it reinstall, which fails without
  // a TTY. pnpm 11 reads only pnpm_config_*, pnpm 9 and 10 only npm_config_*.
  env: {
    COREPACK_HOME: `${SANDBOX_CACHE}/corepack`,
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    pnpm_config_store_dir: `${SANDBOX_CACHE}/pnpm-store`,
    npm_config_store_dir: `${SANDBOX_CACHE}/pnpm-store`,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Epic = { number: number; title: string; branch: string; milestone: string; mode: Mode; manual: boolean };
type Ticket = { number: number; title: string; kind: "build" | "bug"; epic?: Epic; branch: string };

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
  const found = epic && branch ? { number: epic.number, title: epic.title, branch, milestone, mode, manual: labels.includes(LABEL.manual) } : undefined;
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
      if (epic?.manual) continue; // a hand-run epic: its tickets are never the loop's, whatever their labels
      if (epic && EPIC_GATE === "epic" && epicBlocked(epic)) continue;
      tickets.push({
        number: issue.number,
        title: issue.title,
        kind,
        epic,
        branch: epic ? `agent/issue-${issue.number}` : `${kind === "bug" ? "fix" : "feat"}/${issue.number}`,
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
  if (assignees.length === 1 && assignees[0] === me) return true;
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
function prepareEpic(epic: Epic): string | undefined {
  const path = epicWorktree(epic);
  if (!tryGit(path, "merge", "--no-edit", "--quiet", "origin/main")) {
    tryGit(path, "merge", "--abort");
    conflictTicket(epic);
    return undefined;
  }
  git(path, "push", "--quiet", "-u", "origin", epic.branch);
  return path;
}

// The epic's worktree, created or fast-forwarded to its remote branch.
function epicWorktree(epic: Epic): string {
  const path = `${WORKTREES}/${epic.branch.replaceAll("/", "-")}`;
  git(undefined, "fetch", "--quiet", "origin");
  const remote = tryGit(undefined, "rev-parse", "--verify", "--quiet", `origin/${epic.branch}`);
  if (!existsSync(path)) {
    mkdirSync(WORKTREES, { recursive: true });
    if (remote) git(undefined, "worktree", "add", "-B", epic.branch, path, `origin/${epic.branch}`);
    else git(undefined, "worktree", "add", "-b", epic.branch, path, "origin/main");
  } else if (remote) {
    git(path, "merge", "--ff-only", "--quiet", `origin/${epic.branch}`);
  }
  return path;
}

const conflictTitle = (epic: Epic) => `Resolve conflicts between ${epic.branch} and main`;

function conflictTicket(epic: Epic) {
  const title = conflictTitle(epic);
  const open = ghJson<unknown[]>("issue", "list", "--state", "open", "--search", `in:title "${title}"`, "--json", "number");
  if (open.length) return;
  gh("issue", "create", "--title", title, "--label", LABEL.human, "--milestone", epic.milestone, "--body",
    `> *This was generated by AI in the agent loop.*\n\nMerging \`main\` into \`${epic.branch}\` conflicts. The loop skips this epic until the conflicts are resolved on the epic branch.\n\nPart of #${epic.number}.`);
  if (!unblocks(epic.mode)) void alert(`Epic #${epic.number} paused: ${epic.branch} conflicts with main.`); // fast: resolveConflicts tries first
}

function prepareBranch(t: Ticket, epicPath?: string) {
  if (tryGit(undefined, "rev-parse", "--verify", "--quiet", t.branch)) return; // keep earlier progress
  git(undefined, "branch", t.branch, epicPath ? t.epic!.branch : "origin/main");
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

async function pass(): Promise<number> {
  if (limitReason) {
    const reason = limitReason;
    limitReason = undefined;
    throw new Error(`usage limit: ${reason}`);
  }
  epicCache.clear();
  epicBlockedCache.clear();
  // Tickets first: their slots are the loop's throughput. What triage,
  // unblocking and planning make ready is picked up by the next pass, which
  // starts at once because they count as work.
  const started = stopRequested() ? 0 : await fill();
  let other = stopRequested() ? 0 : await verifyEpics();
  if (!stopRequested()) other += await triage();
  if (!stopRequested()) other += await unblock();
  if (PLANNING && !stopRequested()) other += await planEpics();
  changedQueue = other > 0;
  return started + other;
}
// Whether the last pass may have made new tickets ready (triage, unblocking,
// planning, a check's gaps): then the next pass runs at once, even with
// every slot busy, instead of waiting for a ticket to land.
let changedQueue = false;

// Start ready tickets in the free slots. Returns how many started.
async function fill(): Promise<number> {
  const free = MAX_PARALLEL - running.size;
  if (free <= 0) return 0;
  const ready = readyTickets(); // unassigned only: running tickets are claimed
  if (!ready.length) return 0;

  const busy = [...inFlight];
  // One ready ticket and nothing building: nothing to choose between.
  const picked = ready.length === 1 && !busy.length ? ready : await plan(ready, busy, free);

  const epicPaths = new Map<number, string | undefined>();
  let started = 0;
  for (const t of picked.slice(0, free)) {
    if (t.epic && !epicPaths.has(t.epic.number)) epicPaths.set(t.epic.number, prepareEpic(t.epic));
    const epicPath = t.epic ? epicPaths.get(t.epic.number) : undefined;
    if (t.epic && !epicPath) continue; // epic paused on a conflict with main
    if (stopRequested()) break; // claim nothing more once a stop is asked for
    if (!claim(t)) continue;
    prepareBranch(t, epicPath);
    inFlight.add(t);
    running.set(t.number, background(`#${t.number}`, () => work(t, epicPath), () => {
      inFlight.delete(t);
      running.delete(t.number);
    }));
    started++;
  }
  const others = busy.length ? ` (already building ${busy.map((t) => `#${t.number}`).join(", ")})` : "";
  log(`started ${started ? picked.slice(0, started).map((t) => `#${t.number}`).join(", ") : "nothing"}${others}`);
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
    return;
  }
  try {
    settle(t, commits, epicPath);
  } catch (error) {
    release(t, `after the build: ${String(error).slice(0, 300)}`);
    throw error;
  }
  syncTracker();
}

function settle(t: Ticket, commits: number, epicPath?: string) {
  if (!commits) {
    // No commits: a bug diagnosed for a person / not reproducible, or a
    // build the agent couldn't finish. The agent has commented; make sure a
    // person sees it.
    const labels = ghJson<string[]>("issue", "view", String(t.number), "--json", "labels", "--jq", "[.labels[].name]");
    if (labels.includes(LABEL[t.kind])) {
      gh("issue", "edit", String(t.number), "--remove-label", LABEL[t.kind], "--add-label", LABEL.human);
    }
    release(t, "no commits; handed to a person");
    return;
  }
  // A ticket that can't land (a push refused, gh down) is released with its
  // work kept on its branch, and alerted; the next pass lands it.
  land(t, epicPath);
}

async function build(t: Ticket): Promise<number> {
  const box = await sandcastle.createSandbox({ branch: t.branch, sandbox: container(), hooks });
  try {
    await box.run({
      name: `#${t.number}`,
      maxIterations: 100,
      agent: sandcastle.claudeCode(WORKER),
      promptFile: t.kind === "bug" ? "./.sandcastle/bug-prompt.md" : "./.sandcastle/implement-prompt.md",
      promptArgs: { ISSUE: String(t.number), TITLE: t.title, BRANCH: t.branch },
    });
    if (!unlanded(t)) return 0;
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

function land(t: Ticket, epicPath?: string) {
  if (t.epic && epicPath) {
    if (!tryGit(epicPath, "merge", "--no-edit", "--quiet", t.branch)) {
      tryGit(epicPath, "merge", "--abort");
      comment(t.number, `The work on \`${t.branch}\` conflicts with \`${t.epic.branch}\`; the loop will retry it on top of the latest epic branch.`);
      git(undefined, "branch", "-D", t.branch);
      release(t, "merge conflict with the epic branch");
      return;
    }
    git(epicPath, "push", "--quiet", "origin", t.epic.branch);
    const sha = git(epicPath, "rev-parse", "--short", "HEAD");
    gh("issue", "close", String(t.number), "--comment",
      `> *This was generated by AI in the agent loop.*\n\nLanded on \`${t.epic.branch}\` in ${sha}. It ships with the epic's PR (#${t.epic.number}).`);
    git(undefined, "branch", "-D", t.branch);
    log(`#${t.number} landed on ${t.epic.branch}`);
    return;
  }
  git(undefined, "push", "--quiet", "-u", "origin", t.branch);
  const url = gh("pr", "create", "--base", "main", "--head", t.branch, "--title", t.title, "--body",
    `Fixes #${t.number}\n\n> *This was generated by AI in the agent loop.* See the issue for the reasoning and evidence.`);
  gh("issue", "edit", String(t.number), "--remove-label", LABEL[t.kind], "--add-label", LABEL.review);
  log(`#${t.number} → ${url}`);
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
    if (has(e, LABEL.planning) || has(e, LABEL.briefing) || has(e, LABEL.backlog) || has(e, LABEL.manual)) continue; // another loop is on it, no brief yet, parked, or hand-run
    const milestone = ghJson<{ milestone: { title: string } | null }>("issue", "view", String(e.number), "--json", "milestone").milestone?.title;
    const branch = e.body.match(/`(epic\/[^`]+)`/)?.[1];
    if (!milestone || !branch) continue;
    if (EPIC_GATE === "epic" && Number(gh("api", `repos/${repo}/issues/${e.number}`, "--jq", ".issue_dependencies_summary.blocked_by // 0")) > 0) continue;
    const epic = { number: e.number, title: e.title, branch, milestone, mode: modeOf(e.labels.map((l) => l.name)) };
    const items = ghJson<Issue[]>("issue", "list", "--state", "all", "--milestone", milestone, "--json", "number,title,state,body,labels,comments", "--limit", "300")
      .filter((i) => i.number !== e.number);
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
  const jobs = planJobs().slice(0, MAX_PARALLEL);
  if (!jobs.length) return 0;
  log(`planning ${jobs.map((j) => `#${j.epic.number} (${j.kind})`).join(", ")}`);

  const runs = jobs.map(async (j) => {
    gh("issue", "edit", String(j.epic.number), "--add-label", LABEL.planning);
    planningEpics.add(j.epic.number);
    try {
      const epicPath = prepareEpic(j.epic);
      if (!epicPath) return;
      const branch = `agent/plan-${j.epic.number}`;
      freeBranch(branch);
      git(undefined, "branch", "-f", branch, j.epic.branch);
      const box = await sandcastle.createSandbox({ branch, sandbox: container(), hooks });
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
    } finally {
      gh("issue", "edit", String(j.epic.number), "--remove-label", LABEL.planning);
      planningEpics.delete(j.epic.number);
    }
  });
  const settled = await Promise.allSettled(runs);
  for (const [i, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      const reason = String(outcome.reason);
      if (isLimit(reason)) throw new Error(`usage limit: ${reason}`);
      await alert(`Planning epic #${jobs[i]!.epic.number} failed: ${reason.slice(0, 300)}`);
    }
  }
  return jobs.length;
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
  const items = ghJson<{ number: number; state: string; labels: { name: string }[] }[]>("issue", "list", "--state", "all", "--milestone", milestone, "--json", "number,state,labels", "--limit", "300")
    .filter((i) => i.number !== e.number && !i.labels.some((l) => l.name === LABEL.backlog));
  if (!items.length || items.some((i) => i.state === "OPEN")) return 0; // not planned yet, or still building (backlog items don't count)

  let [pr] = ghJson<{ number: number; headRefOid: string }[]>("pr", "list", "--state", "open", "--head", branch, "--json", "number,headRefOid");
  if (!pr) {
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
      sandbox: container(),
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
const TRIAGED = ["bug", "enhancement", "needs-scoping", LABEL.needsInfo, "wontfix", LABEL.build, LABEL.bug, LABEL.human, LABEL.review];
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
  if (!TRIAGE) return 0;
  if (!existsSync(TRIAGE_SKILL)) {
    if (!triageSkillMissing) await alert(`AGENTS_TRIAGE is on, but ${TRIAGE_SKILL} is missing: commit the triage skill to the repo (\`npx skills@latest add imick-io/skills\`).`);
    triageSkillMissing = true;
    return 0;
  }
  const jobs = triageJobs().slice(0, MAX_PARALLEL);
  if (!jobs.length) return 0;
  try { gh("label", "create", LABEL.triage, "--color", "ededed", "--description", "Triage hasn't finished", "--force"); } catch { /* exists */ }
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
const NOT_UNBLOCKED = [LABEL.backlog, LABEL.manual, LABEL.epic, LABEL.spec, LABEL.map, LABEL.briefing, LABEL.unblocking, "initiative", "needs-scoping"];
const labelledEpics = () => [LABEL.fast, LABEL.supersonic].some((label) => {
  try {
    return ghJson<unknown[]>("issue", "list", "--state", "open", "--label", label, "--json", "number", "--limit", "1").length > 0;
  } catch {
    return false; // no such label in this repo yet
  }
});
const lastIsAi = (i: Issue) => isAiComment(i.comments?.at(-1)?.body ?? AI_NOTE);

async function unblock(): Promise<number> {
  if (MODE === "normal" && !labelledEpics()) return 0;
  for (const [name, color] of [[LABEL.fast, "d93f0b"], [LABEL.supersonic, "b60205"], [LABEL.asked, "fbca04"], [LABEL.assumed, "f9d0c4"], [LABEL.unblocking, "fbca04"]] as const) {
    try { gh("label", "create", name, "--color", color, "--force"); } catch { /* exists */ }
  }
  const approved = await approveSpecs();
  const followed = await followUps();
  const open = ghJson<Waiting[]>("issue", "list", "--state", "open", "--label", LABEL.human,
    "--json", "number,title,state,body,labels,comments,milestone", "--limit", "100")
    .filter((i) => !NOT_UNBLOCKED.some((l) => has(i, l)) && !(has(i, LABEL.asked) && lastIsAi(i))) // asked: wait for your comment
    .map((i) => {
      const epic = epicFor(i.milestone?.title);
      return { i, epic, mode: epic ? epic.mode : modeOf(i.labels.map((l) => l.name)) };
    })
    .filter(({ epic, mode }) => !epic?.manual && unblocks(mode)); // a hand-run epic's questions are the person's
  const conflicts = open.filter(({ i, epic }) => epic && i.title === conflictTitle(epic));
  for (const { i, epic } of conflicts) await resolveConflicts(i, epic!);
  const waiting = open.filter((x) => !conflicts.includes(x)).slice(0, MAX_PARALLEL);
  if (!waiting.length) return approved + followed + conflicts.length;
  log(`unblocking ${waiting.map(({ i }) => `#${i.number}`).join(", ")}`);

  const settled = await Promise.allSettled(waiting.map(async ({ i, mode }) => {
    gh("issue", "edit", String(i.number), "--add-label", LABEL.unblocking);
    unblockingIssues.add(i.number);
    try {
      const run = await sandcastle.run({
        hooks,
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
  for (const [n, outcome] of settled.entries()) {
    if (outcome.status === "fulfilled") continue;
    const reason = String(outcome.reason);
    if (isLimit(reason)) throw new Error(`usage limit: ${reason}`);
    await alert(`Unblocking #${waiting[n]!.i.number} failed: ${reason.slice(0, 300)}`);
  }
  return approved + followed + conflicts.length + waiting.length;
}

// Supersonic: you commented on something the loop assumed. An agent compares
// your answer with the assumption: the same, it's kept; different, the issue
// is edited (not built yet) or a follow-up ticket is filed (already built).
async function followUps(): Promise<number> {
  const answered = ghJson<Waiting[]>("issue", "list", "--state", "all", "--label", LABEL.assumed,
    "--json", "number,title,state,body,labels,comments,milestone", "--limit", "50")
    .filter((i) => !lastIsAi(i) && !has(i, LABEL.unblocking))
    .slice(0, MAX_PARALLEL);
  for (const i of answered) {
    gh("issue", "edit", String(i.number), "--add-label", LABEL.unblocking);
    unblockingIssues.add(i.number);
    try {
      const run = await sandcastle.run({
        hooks,
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
    } catch (error) {
      const reason = String(error);
      if (isLimit(reason)) throw error;
      await alert(`Following up #${i.number} failed: ${reason.slice(0, 300)}`);
    } finally {
      gh("issue", "edit", String(i.number), "--remove-label", LABEL.unblocking);
      unblockingIssues.delete(i.number);
    }
  }
  return answered.length;
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
async function resolveConflicts(issue: Issue, epic: Epic) {
  const n = issue.number;
  gh("issue", "edit", String(n), "--add-label", LABEL.unblocking);
  unblockingIssues.add(n);
  const branch = `agent/conflicts-${epic.number}`;
  try {
    const path = epicWorktree(epic);
    if (tryGit(path, "merge", "--no-edit", "--quiet", "origin/main")) { // resolved meanwhile, e.g. on main
      git(path, "push", "--quiet", "origin", epic.branch);
      gh("issue", "close", String(n), "--comment", `> *This was generated by AI in the agent loop.*\n\n\`main\` now merges cleanly into \`${epic.branch}\`.`);
      return;
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
    const box = await sandcastle.createSandbox({ branch, sandbox: container(), hooks });
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
      return;
    }
    const tree = git(undefined, "rev-parse", `${branch}^{tree}`);
    const merge = git(undefined, "commit-tree", tree, "-p", base, "-p", main, "-m",
      `Merge main into ${epic.branch}\n\nConflicts resolved by the agent loop in fast mode (#${n}).`);
    if (!tryGit(path, "merge", "--ff-only", "--quiet", merge)) return; // the epic branch moved: the next pass retries
    git(path, "push", "--quiet", "origin", epic.branch);
    gh("issue", "edit", String(n), "--remove-label", LABEL.human, ...(has(issue, LABEL.asked) ? ["--remove-label", LABEL.asked] : []));
    gh("issue", "close", String(n), "--comment",
      `> *This was generated by AI in the agent loop.*\n\nConflicts resolved in fast mode and merged into \`${epic.branch}\` (${merge.slice(0, 7)}): ${files.split("\n").map((f) => `\`${f}\``).join(", ")}. They ship with the epic's PR (#${epic.number}).`);
    log(`${epic.branch}: conflicts with main resolved`);
  } catch (error) {
    const reason = String(error);
    if (isLimit(reason)) throw error;
    await alert(`Resolving conflicts of ${epic.branch} failed: ${reason.slice(0, 300)}`);
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

async function approveSpecs(): Promise<number> {
  const specs = ghJson<Waiting[]>("issue", "list", "--state", "open", "--label", LABEL.spec, "--label", LABEL.human,
    "--json", "number,title,state,body,labels,comments,milestone", "--limit", "50");
  let approved = 0;
  for (const s of specs) {
    const mode = epicFor(s.milestone?.title)?.mode;
    if (has(s, LABEL.approved) || has(s, LABEL.backlog) || !unblocks(mode)) continue;
    if (!lastIsAi(s) || s.comments?.at(-1)?.body.includes(SPEC_ASK)) continue; // a revision pending, or waiting for you
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
const LOCK = ".sandcastle/loop.pid";
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};
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
});

// Starting the loop is the clearest sign you want it running: a stop file
// left by an earlier request (or a stop asked for while nothing ran) is cleared.
if (existsSync(STOP_FILE)) {
  rmSync(STOP_FILE, { force: true });
  log("cleared an earlier stop request");
}

// Sleeps in one-minute steps so a stop request ends an idle wait promptly.
// With `wakeable`, a job finishing (a free slot) ends it at once.
async function idle(minutes: number, wakeable = false) {
  for (let i = 0; i < minutes && !stopRequested(); i++) {
    if (wakeable && woken) break;
    await Promise.race([sleep(60_000), new Promise<void>((resolve) => { if (wakeable) wakeUp = resolve; })]);
  }
  woken = false;
}

const busy = () => running.size + checking.size;

// Lets every running ticket and check finish (a stop, or the end of --once).
async function drain() {
  while (busy()) await Promise.allSettled([...running.values(), ...checking.values()]);
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
let limitAlerted = false;
let failures = 0; // failed passes in a row
for (;;) {
  let worked = 0;
  syncTracker();
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
      await idle(LIMIT_SLEEP_MINUTES);
      continue;
    }
    failures++;
    const wait = Math.min(RETRY_MINUTES * 2 ** (failures - 1), IDLE_MINUTES);
    await alert(`Agent loop pass failed; retrying in ${wait} min: ${message.slice(0, 500)}`);
    syncTracker();
    if (ONCE) { await drain(); process.exit(1); }
    if (stopRequested()) await stopNicely(0);
    await idle(wait);
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
  if (busy()) {
    // Work is running: pass again when a slot frees up, or after the idle
    // time for what arrived meanwhile; at once when the queue just changed.
    if (!changedQueue) await idle(IDLE_MINUTES, true);
    continue;
  }
  if (!worked) {
    log(`nothing ready; sleeping ${IDLE_MINUTES} min`);
    await idle(IDLE_MINUTES);
    if (stopRequested()) await stopNicely(0);
  }
}
