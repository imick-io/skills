#!/usr/bin/env node
// Claim a ticket for yourself and put its branch in place, the way the agent
// loop would, for /claim. Run from the repo root:
//
//   node <skill>/scripts/claim.mjs          the next available ticket
//   node <skill>/scripts/claim.mjs 42       ticket #42
//   node <skill>/scripts/claim.mjs --dry-run [42]   say what it would do; change nothing
//   node <skill>/scripts/claim.mjs 42 --force       claim #42 even though it's blocked
//
// "Available" is the loop's own queue (see .sandcastle/main.mts, readyTickets):
// open, labelled ready-for-agent or ready-for-agent-debugging, unassigned, no
// open blocker, not a spec, an epic or backlog, and its epic not waiting on
// other epics. Unlike the loop, tickets of a `manual` epic are included: they
// are meant for a person. Taken in build order: the earliest epic milestone
// first, then the oldest ticket.
//
// It writes: an assignee on the issue, a merge of main into the epic branch
// (pushed), and a local branch you're switched to. It never touches
// uncommitted work: it stops if the checkout has any.
//
// Prints Markdown: what it did, then your next steps. Exits 1 when it stops
// without claiming, with the reason.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const FORCE = args.includes("--force");
const wanted = args.map((a) => a.replace(/^#/, "")).find((a) => /^\d+$/.test(a));

// ---- helpers

const run = (cmd, argv, opts = {}) => {
  try {
    return { ok: true, out: execFileSync(cmd, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim() };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? "").trim(), err: String(e.stderr ?? e.message).trim() };
  }
};
const must = (cmd, argv, opts) => {
  const r = run(cmd, argv, opts);
  if (!r.ok) throw new Error(`${cmd} ${argv.join(" ")}\n${r.err}`);
  return r.out;
};
const git = (...a) => must("git", a);
const tryGit = (...a) => run("git", a).ok;
const gh = (...a) => must("gh", a);
const ghJson = (...a) => JSON.parse(gh(...a));
// Stops with the reason. After the claim, the heading says so: the ticket is
// yours, but its branch isn't ready.
const cleanups = [];
const stop = (why, heading = "Not claimed") => {
  for (const clean of cleanups.splice(0)) clean();
  console.log(`## ${heading}\n\n${why}`);
  process.exit(1);
};

// ---- labels: docs/agents/triage-labels.md maps each role to this repo's label

const LABEL = {
  build: "ready-for-agent",
  bug: "ready-for-agent-debugging",
  spec: "spec",
  backlog: "backlog",
  manual: "manual",
  epic: "epic",
};
if (existsSync("docs/agents/triage-labels.md")) {
  const roles = { "ready-for-agent": "build", "ready-for-agent-debugging": "bug", spec: "spec", backlog: "backlog", manual: "manual" };
  for (const line of readFileSync("docs/agents/triage-labels.md", "utf8").split("\n")) {
    const cells = line.split("|").map((c) => c.trim().replace(/`/g, ""));
    if (cells.length > 4 && roles[cells[1]] && cells[3]) LABEL[roles[cells[1]]] = cells[3];
  }
}

// ---- where we are

if (!run("git", ["rev-parse", "--is-inside-work-tree"]).ok) stop("Run this from the project's repo.");
const top = git("rev-parse", "--show-toplevel");
process.chdir(top);
const auth = run("gh", ["api", "user", "--jq", ".login"]);
if (!auth.ok) stop("`gh` isn't logged in: run `gh auth login`.");
const me = auth.out;
const dirty = git("status", "--porcelain", "--untracked-files=no");
if (dirty && !DRY) stop(`The checkout has uncommitted changes. Commit or stash them first:\n\n\`\`\`\n${dirty}\n\`\`\``);
const fetched = run("git", ["fetch", "--quiet", "origin"]);
if (!fetched.ok) stop(`Couldn't fetch \`origin\`:\n\n\`\`\`\n${fetched.err}\n\`\`\`\n\nCheck your network and git credentials, then run it again.`);

const isSpec = (labels, body) =>
  labels.includes(LABEL.spec) || (/^## Problem Statement/m.test(body) && /^## User Stories/m.test(body));
// The open issues blocking #n (GitHub's native dependencies, as the loop reads them).
const blockers = (n) => ghJson("api", `repos/{owner}/{repo}/issues/${n}/dependencies/blocked_by`, "--jq", '[.[] | select(.state == "open") | .number]');
const blockedCount = (n) => Number(gh("api", `repos/{owner}/{repo}/issues/${n}`, "--jq", ".issue_dependencies_summary.blocked_by // 0"));

// Everything under an epic carries the epic's milestone; the epic's body
// names its branch (`epic/NN-slug`).
const epics = new Map();
const epicFor = (milestone) => {
  if (!milestone) return undefined;
  if (!epics.has(milestone)) {
    const [e] = ghJson("issue", "list", "--state", "open", "--label", LABEL.epic, "--milestone", milestone,
      "--json", "number,title,body,labels", "--limit", "1");
    const branch = e?.body.match(/`(epic\/[^`]+)`/)?.[1];
    epics.set(milestone, e && branch
      ? { number: e.number, title: e.title, branch, manual: e.labels.some((l) => l.name === LABEL.manual) }
      : undefined);
  }
  return epics.get(milestone);
};
const order = (milestone) => Number(milestone?.match(/^(\d+)/)?.[1] ?? Infinity);

// A branch checked out in another worktree (the loop keeps ticket and epic
// branches in .sandcastle/worktrees/) can't be checked out here.
const worktreeOf = (branch) => {
  for (const block of git("worktree", "list", "--porcelain").split("\n\n")) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    if (path && resolve(path) !== resolve(top) && block.split("\n").includes(`branch refs/heads/${branch}`)) return path;
  }
  return undefined;
};

// Assignment means claimed. Claim, re-read, and back off if someone else (or
// the loop) got there at the same moment.
const claim = (n) => {
  gh("issue", "edit", String(n), "--add-assignee", "@me");
  const now = ghJson("issue", "view", String(n), "--json", "assignees").assignees.map((a) => a.login);
  if (now.length === 1 && now[0] === me) return true;
  gh("issue", "edit", String(n), "--remove-assignee", "@me");
  return false;
};

const toTicket = (issue) => {
  const labels = issue.labels.map((l) => l.name);
  const kind = labels.includes(LABEL.bug) ? "bug" : "build";
  const epic = epicFor(issue.milestone?.title);
  return {
    number: issue.number,
    title: issue.title,
    kind,
    labels,
    epic,
    branch: epic ? `agent/issue-${issue.number}` : `${kind === "bug" ? "fix" : "feat"}/${issue.number}`,
  };
};

// ---- pick the ticket

let ticket;
let resumed = false;
const notes = [];

if (wanted) {
  const issue = ghJson("issue", "view", wanted, "--json", "number,title,state,body,labels,milestone,assignees");
  const labels = issue.labels.map((l) => l.name);
  if (issue.state !== "OPEN") stop(`#${wanted} is closed.`);
  if (labels.includes(LABEL.epic)) stop(`#${wanted} is an epic. Claim one of its tickets instead.`);
  if (isSpec(labels, issue.body)) stop(`#${wanted} is a spec: it's read by /to-tickets, never built directly.`);
  ticket = toTicket(issue);
  const assignees = issue.assignees.map((a) => a.login);
  const others = assignees.filter((a) => a !== me);
  if (others.length) stop(`#${wanted} is already claimed by ${others.map((a) => `@${a}`).join(", ")}.`);
  if (assignees.includes(me)) {
    // The loop claims with the same account: is it building this one?
    const busy = worktreeOf(ticket.branch) ?? (existsSync(`.sandcastle/worktrees/${ticket.branch.replaceAll("/", "-")}`) ? `.sandcastle/worktrees/${ticket.branch.replaceAll("/", "-")}` : undefined);
    const agentLabels = labels.filter((l) => l.startsWith("agent:"));
    if (!FORCE && (busy || agentLabels.length))
      stop(`#${wanted} is assigned to you, and the agent loop looks to be working on it (${[busy && `worktree ${busy}`, ...agentLabels].filter(Boolean).join(", ")}). It claims with your account. Stop the loop (\`npm run agents:stop\`) or let it finish; if you're sure it isn't running, run again with \`--force\`.`);
    resumed = true;
  }
  if (![LABEL.build, LABEL.bug].some((l) => labels.includes(l)))
    notes.push(`#${wanted} isn't labelled \`${LABEL.build}\` or \`${LABEL.bug}\`: claimed anyway, since you asked for it.`);
  const open = blockers(wanted);
  if (open.length && !FORCE)
    stop(`#${wanted} is blocked by ${open.map((b) => `#${b}`).join(", ")}. Build those first, or run again with \`--force\`.`);
  if (ticket.epic && blockedCount(ticket.epic.number) > 0)
    notes.push(`Its epic #${ticket.epic.number} is still waiting on other epics; the loop wouldn't build it yet.`);
} else {
  const candidates = [];
  for (const label of [LABEL.build, LABEL.bug]) {
    candidates.push(...ghJson("issue", "list", "--state", "open", "--label", label, "--search", "no:assignee sort:created-asc",
      "--json", "number,title,body,labels,milestone,createdAt", "--limit", "100"));
  }
  const seen = new Set();
  const queue = candidates
    .filter((i) => !seen.has(i.number) && seen.add(i.number))
    .filter((i) => {
      const labels = i.labels.map((l) => l.name);
      return !labels.includes(LABEL.epic) && !labels.includes(LABEL.backlog) && !isSpec(labels, i.body);
    })
    .sort((a, b) => order(a.milestone?.title) - order(b.milestone?.title) || a.createdAt.localeCompare(b.createdAt));
  // Why each one was passed over, for when none is left.
  const held = new Map(); // blocker -> tickets it holds back
  const waitingEpics = new Map(); // epic -> { tickets, blockers }
  const leftover = [];
  const raced = [];
  for (const issue of queue) {
    const open = blockers(issue.number);
    if (open.length) {
      for (const b of open) held.set(b, [...(held.get(b) ?? []), issue.number]);
      continue;
    }
    const t = toTicket(issue);
    if (t.epic && blockedCount(t.epic.number) > 0) {
      const w = waitingEpics.get(t.epic.number) ?? { epic: t.epic, tickets: [], blockers: blockers(t.epic.number) };
      w.tickets.push(t.number);
      waitingEpics.set(t.epic.number, w);
      continue;
    }
    const wt = worktreeOf(t.branch);
    if (wt) { leftover.push(`#${t.number} (\`${wt}\`)`); continue; } // a sandbox left it checked out
    if (DRY || claim(t.number)) { ticket = t; break; }
    raced.push(t.number);
  }
  if (!ticket) {
    const list = (ns, max = 8) => ns.slice(0, max).map((n) => `#${n}`).join(", ") + (ns.length > max ? `, … (${ns.length} in all)` : "");
    const inDev = [LABEL.build, LABEL.bug].flatMap((label) =>
      ghJson("issue", "list", "--state", "open", "--label", label, "--search", "assignee:*", "--json", "number", "--limit", "100").map((i) => i.number));
    const blocked = new Set([...held.values()].flat());
    const lines = [];
    if (!queue.length && !inDev.length)
      lines.push(`- **The queue is empty**: no open ticket is labelled \`${LABEL.build}\` or \`${LABEL.bug}\`. New work comes from planning an epic (\`/brief\`, \`/wayfinder\`, \`/to-tickets\`) or triage.`);
    if (inDev.length) lines.push(`- **In development: ${inDev.length}**, claimed by you or the loop (it uses your account): ${list(inDev)}.`);
    if (blocked.size) lines.push(`- **Blocked: ${blocked.size}**, waiting on open issues.`);
    if (waitingEpics.size)
      lines.push(...[...waitingEpics.values()].map((w) =>
        `- **Under epic #${w.epic.number} ${w.epic.title}: ${w.tickets.length}**, held back until the epic(s) it waits on land: ${list(w.blockers)}.`));
    if (leftover.length) lines.push(`- **Left checked out in a loop worktree: ${leftover.length}**: ${leftover.join(", ")}. Free once no sandbox is running on them.`);
    if (raced.length) lines.push(`- **Claimed by someone else a moment ago: ${raced.length}**: ${list(raced)}.`);
    // The blockers that would free the most tickets, with where each one stands.
    const top = [...held.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5).map(([b, ts]) => {
      const i = ghJson("issue", "view", String(b), "--json", "title,labels,assignees");
      const labels = i.labels.map((l) => l.name);
      const where = i.assignees.length ? `in development (@${i.assignees[0].login})`
        : labels.includes(LABEL.epic) ? "an epic, not landed yet"
        : labels.find((l) => /^(ready-for-|needs-|agent:asked)/.test(l)) ?? "open";
      const own = [...held.entries()].filter(([, held2]) => held2.includes(b)).map(([x]) => `#${x}`);
      return `- **#${b} ${i.title}**: ${where}${own.length ? `, itself blocked by ${own.join(", ")}` : ""}. Frees ${ts.length}: ${list(ts, 6)}.`;
    });
    stop(`No ticket is available right now.\n\n${lines.join("\n")}` +
      (top.length ? `\n\n**What would free the most:**\n\n${top.join("\n")}` : "") +
      `\n\n\`/why-sleeping\` ranks what only you can unblock.`);
  }
}

if (DRY) {
  const base = ticket.epic ? `origin/${ticket.epic.branch}` : "origin/main";
  console.log(`## Would claim #${ticket.number}: ${ticket.title}\n\n` +
    `- ${ticket.epic ? `Under epic #${ticket.epic.number} (${ticket.epic.title}): merge \`origin/main\` into \`${ticket.epic.branch}\` and push, then` : "No epic:"} branch \`${ticket.branch}\` from \`${base}\` and switch to it.\n` +
    notes.map((n) => `- ${n}\n`).join("") +
    `\nNothing was changed (dry run).`);
  process.exit(0);
}
if (wanted && !resumed && !claim(ticket.number)) stop(`Someone claimed #${wanted} at the same moment. Try again, or pick another.`);

// ---- the epic branch: main merged in, pushed, without checking it out here
// (the loop may hold it in a worktree of its own).

let epicNote = "";
if (ticket.epic) {
  const epic = ticket.epic.branch;
  const exists = tryGit("rev-parse", "--verify", "--quiet", `origin/${epic}`);
  const tmp = mkdtempSync(join(tmpdir(), "claim-"));
  const cleanup = () => {
    run("git", ["worktree", "remove", "--force", tmp]);
    rmSync(tmp, { recursive: true, force: true });
  };
  cleanups.push(cleanup); // stop() exits without running `finally`
  try {
    git("worktree", "add", "--quiet", "--detach", tmp, exists ? `origin/${epic}` : "origin/main");
    if (exists) {
      const merged = run("git", ["-C", tmp, "merge", "--quiet", "-m", `Merge main into ${epic}`, "origin/main"]);
      if (!merged.ok) {
        run("git", ["-C", tmp, "merge", "--abort"]);
        stop(`\`main\` conflicts with \`${epic}\`, so the branch wasn't made. The ticket stays assigned to you.\n\n` +
          `Resolve it, then run \`/claim ${ticket.number}\` again:\n\n` +
          "```sh\n" +
          `git switch --detach origin/${epic}\ngit merge origin/main      # fix the conflicts, commit\ngit push origin HEAD:${epic}\ngit switch -\n` +
          "```", `Claimed #${ticket.number}, but its branch isn't ready`);
      }
    }
    const head = git("-C", tmp, "rev-parse", "HEAD");
    const remote = exists ? git("rev-parse", `origin/${epic}`) : "";
    if (head !== remote) {
      git("-C", tmp, "push", "--quiet", "origin", `HEAD:refs/heads/${epic}`);
      git("fetch", "--quiet", "origin", epic);
      epicNote = exists ? "`main` merged in and pushed" : "created from `main` and pushed";
    } else epicNote = "already up to date with `main`";
  } finally {
    cleanups.splice(cleanups.indexOf(cleanup), 1);
    cleanup();
  }
}

// ---- the ticket's branch, switched to here

const base = ticket.epic ? `origin/${ticket.epic.branch}` : "origin/main";
const elsewhere = worktreeOf(ticket.branch);
if (elsewhere)
  stop(`\`${ticket.branch}\` is checked out in another worktree: \`${elsewhere}\` (a loop sandbox left it there). The ticket stays assigned to you. ` +
    `If no sandbox is running on it, \`git worktree remove ${elsewhere}\`, then run \`/claim ${ticket.number}\` again; its commits stay on the branch.`,
    `Claimed #${ticket.number}, but its branch isn't ready`);
let branchNote;
const current = git("rev-parse", "--abbrev-ref", "HEAD");
const startedOn = current === "HEAD" ? undefined : current; // undefined: a detached HEAD
// \`git switch\` refuses when an untracked file here would be overwritten.
const switchTo = (...argv) => {
  const r = run("git", ["switch", "--quiet", ...argv]);
  if (r.ok) return;
  const files = r.err.match(/would be overwritten by checkout:\n([\s\S]*?)\nPlease move or remove/)?.[1]?.split("\n").map((f) => f.trim()).filter(Boolean);
  stop(files
    ? `Untracked files here would be overwritten by \`${ticket.branch}\`. The ticket stays assigned to you. Move or delete them, then run \`/claim ${ticket.number}\` again:\n\n${files.map((f) => `- \`${f}\``).join("\n")}`
    : `\`git switch\` failed. The ticket stays assigned to you:\n\n\`\`\`\n${r.err}\n\`\`\``,
    `Claimed #${ticket.number}, but its branch isn't ready`);
};
if (tryGit("rev-parse", "--verify", "--quiet", `refs/heads/${ticket.branch}`)) {
  if (current !== ticket.branch) switchTo(ticket.branch);
  const [behind, ahead] = git("rev-list", "--left-right", "--count", `${base}...${ticket.branch}`).split(/\s+/).map(Number);
  branchNote = `existing branch, ${ahead} commit(s) of earlier work` + (behind ? `; ${behind} commit(s) behind \`${base}\`: \`git merge ${base}\` to catch up` : "");
} else if (tryGit("rev-parse", "--verify", "--quiet", `refs/remotes/origin/${ticket.branch}`)) {
  switchTo("-c", ticket.branch, "--track", `origin/${ticket.branch}`);
  branchNote = `from \`origin/${ticket.branch}\`, which already had work`;
} else {
  switchTo("-c", ticket.branch, "--no-track", base);
  branchNote = `new, from \`${base}\``;
}

// ---- what to do next

const n = ticket.number;
const back = startedOn && startedOn !== ticket.branch ? startedOn : "main";
const services = existsSync(".sandcastle/sandbox-setup.sh")
  ? "Start what `.sandcastle/sandbox-setup.sh` starts in a sandbox (database, cache, migrations, seed data), with the project's own dev commands."
  : "Install dependencies and start the project's services.";
const land = ticket.epic
  ? "```sh\n" +
    `git fetch origin\ngit switch --detach origin/${ticket.epic.branch}\ngit merge --no-edit ${ticket.branch}\ngit push origin HEAD:${ticket.epic.branch}\n` +
    `gh issue close ${n} --comment "Landed on ${ticket.epic.branch}."\ngit switch ${back}\n` +
    "```\nOn a conflict: `git merge --abort`, `git switch " + ticket.branch + "`, `git merge " + base + "`, fix, re-run the checks, and land again."
  : "```sh\n" + `git push -u origin ${ticket.branch}\ngh pr create --fill --body "Fixes #${n}"\n` + "```";

console.log(`## ${resumed ? "Resumed" : "Claimed"} #${n}: ${ticket.title}

- **Assigned** to @${me}: the agent loop leaves it alone.
- **Epic:** ${ticket.epic ? `#${ticket.epic.number} ${ticket.epic.title}, \`${ticket.epic.branch}\` (${epicNote})` : "none"}
- **Branch:** \`${ticket.branch}\`, ${branchNote}. You're on it now.
${notes.map((x) => `- ${x}`).join("\n")}

## Next

1. **Services.** ${services}
2. **Build.** In Claude Code: \`${ticket.kind === "bug" ? `/debug-and-fix #${n}` : `/implement #${n}`}\`.
3. **Review.** \`/code-review since ${base}, against issue #${n}\`, then fix what it finds.
4. **Checks.** The project's typecheck and tests, green, plus what \`.sandcastle/implement-prompt.md\` adds.
5. **Land.**
${land}

**Stopping halfway:** commit, \`git switch ${back}\` (the loop can't use a branch checked out here), then \`gh issue edit ${n} --remove-assignee @me\`. The loop picks it up from the branch's commits.`.replace(/\n\n\n/g, "\n\n"));
