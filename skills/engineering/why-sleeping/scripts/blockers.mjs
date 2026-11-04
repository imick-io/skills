#!/usr/bin/env node
// Read-only: what stands between the agent loop and its next piece of work, for /why-sleeping.
// Run from the repo root: node <skill>/scripts/blockers.mjs
// Follows every held piece of work (a queued ticket, an autopilot epic, an
// untriaged issue) down its blocked-by chain to the next move, and says whose
// move it is: the agents' (the loop's next pass, or any agent session told to
// do it) or only the person's. Each move is ranked by how much held work it
// frees. Never writes, never prints a secret.
// When the project's loop is new enough, it also asks the loop: its status
// file (what it's doing, what's backed off) and its dry run (what its next
// pass would do), so a [loop] move is one the loop itself would make.

import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve as resolvePath } from "node:path";

const run = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};
const json = (cmd, args) => {
  const out = run(cmd, args);
  try { return out ? JSON.parse(out) : null; } catch { return null; }
};
const clock = (d) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// ---- The loop itself: anything here outranks the queue
const health = [];
const env = existsSync(".sandcastle/.env") ? readFileSync(".sandcastle/.env", "utf8") : "";
const setting = (name) => env.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([\\w-]+)`, "m"))?.[1];
const mode = setting("AGENTS_MODE") ?? "normal";
const EPIC_GATE = setting("AGENTS_EPIC_GATE") === "ticket" ? "ticket" : "epic";
const TRIAGE = ["1", "true", "yes"].includes((setting("AGENTS_TRIAGE") ?? "").toLowerCase());
if (!existsSync(".sandcastle/main.mts")) health.push("agent loop not installed (/setup-imick-skills)");
if (!run("docker", ["info", "--format", "{{.ServerVersion}}"])) health.push("Docker is not running: start Docker Desktop");
const here = process.cwd();
const loopPids = (run("ps", ["-Ao", "pid=,command="]) ?? "").split("\n")
  // node running the loop itself: not an editor or a shell naming the file, nor a dry run
  .filter((l) => /^\s*\d+\s+\S*node\s.*\.sandcastle\/main\.mts/.test(l) && !/--dry-run/.test(l)).map((l) => l.trim().split(/\s+/)[0])
  .filter((pid) => (run("lsof", ["-a", "-d", "cwd", "-p", pid, "-Fn"]) ?? "").split("\n").find((l) => l.startsWith("n"))?.slice(1) === here);
const running = loopPids.length > 0;
if (existsSync(".sandcastle/STOP")) health.push("a stop was requested (.sandcastle/STOP): the loop exits after its in-flight work");
let lastRun; // when a sandbox last wrote its log: the loop's last sign of life
if (existsSync(".sandcastle/logs")) {
  const logs = readdirSync(".sandcastle/logs").map((f) => join(".sandcastle/logs", f)).map((f) => [f, statSync(f).mtimeMs]).sort((a, b) => b[1] - a[1]);
  if (logs[0]) lastRun = new Date(logs[0][1]);
  const tail = logs[0] ? readFileSync(logs[0][0], "utf8").split("\n").slice(-15).join("\n") : "";
  if (/usage limit|rate limit|429/i.test(tail)) health.push(`usage limit hit (${logs[0][0]}): the loop retries on its own; nothing to do but wait or raise the limit`);
}
// The loop's dry run takes a while (it reads the whole queue): start it now,
// read it at the end. Only a loop that knows the flag gets it: an older one
// would start a real loop instead.
const loopFile = existsSync(".sandcastle/main.mts") ? readFileSync(".sandcastle/main.mts", "utf8") : "";
const dryRun = loopFile.includes("--dry-run") && loopFile.includes("function dryRun")
  ? new Promise((done) => execFile("node", ["--env-file-if-exists=.sandcastle/.env", ".sandcastle/main.mts", "--dry-run", "--json"],
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 240_000 }, (error, stdout) => {
        try { done(error ? null : JSON.parse(stdout)); } catch { done(null); }
      }))
  : Promise.resolve(null);

// The loop's status file: what it's doing, and until when.
let status = null;
const gitDir = run("git", ["rev-parse", "--absolute-git-dir"]);
if (running && gitDir && existsSync(join(gitDir, "agent-loop-status.json"))) {
  try {
    const read = JSON.parse(readFileSync(join(gitDir, "agent-loop-status.json"), "utf8"));
    if (loopPids.includes(String(read.pid))) status = read;
  } catch { /* being rewritten: do without */ }
}
// Without one, the launch agent's log (docs/mac-setup.md) says whether the
// loop is in its idle sleep, and until when. A loop started by hand logs to its terminal only.
let asleep = status?.state === "asleep" && status.until ? { since: new Date(status.at), until: new Date(status.until) } : undefined;
const loopLog = join(homedir(), "Library/Logs", `agents-${basename(here)}.log`);
if (running && !status && existsSync(loopLog)) {
  const last = readFileSync(loopLog, "utf8").trimEnd().split("\n").filter((l) => l.startsWith("[agents ")).at(-1);
  const m = last?.match(/^\[agents (\S+)\] nothing ready; sleeping (\d+) min/);
  if (m) { const since = new Date(m[1]); asleep = { since, until: new Date(since.getTime() + Number(m[2]) * 60_000) }; }
}

// ---- GitHub
const repo = run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
if (!repo) { console.log("Could not read the repo with gh (not a GitHub repo, or gh not logged in)."); process.exit(1); }
const me = run("gh", ["api", "user", "--jq", ".login"]);
const issues = json("gh", ["issue", "list", "--state", "open", "--limit", "300", "--json", "number,title,labels,assignees,milestone,body"]) ?? [];
const prs = json("gh", ["pr", "list", "--state", "open", "--limit", "50", "--json", "number,headRefName,statusCheckRollup"]) ?? [];
const milestones = new Map((json("gh", ["api", `repos/${repo}/milestones?state=open&per_page=100`]) ?? []).map((m) => [m.title, m]));
const byNum = new Map(issues.map((i) => [i.number, i]));
const L = (i) => i.labels.map((l) => l.name);
const is = (i, l) => L(i).includes(l);
const isSpec = (i) => is(i, "spec") || (/^## Problem Statement/m.test(i.body) && /^## User Stories/m.test(i.body));
const unblocks = (i) => !is(i, "backlog") && (["fast", "supersonic"].includes(mode) || is(i, "fast") || is(i, "supersonic"));
const blockersCache = new Map();
const blockers = (n) => {
  if (!blockersCache.has(n))
    blockersCache.set(n, (json("gh", ["api", `repos/${repo}/issues/${n}/dependencies/blocked_by`]) ?? []).filter((b) => b.state === "open").map((b) => b.number));
  return blockersCache.get(n);
};
const epicOf = (i) => i.milestone && issues.find((e) => is(e, "epic") && e.milestone?.title === i.milestone.title);
const inMilestone = (e) => issues.filter((x) => x.number !== e.number && x.milestone?.title === e.milestone?.title);
const branchOf = (e) => e.body.match(/`(epic\/[^`]+)`/)?.[1];
const link = (n) => `https://github.com/${repo}/issues/${n}`;
const prLink = (n) => `https://github.com/${repo}/pull/${n}`;
const t = (i) => `#${i.number} ${i.title}`;

// The last comment on an issue, and its gist: the first line that isn't the AI note.
const commentCache = new Map();
const lastComment = (n) => {
  if (!commentCache.has(n)) commentCache.set(n, run("gh", ["issue", "view", String(n), "--json", "comments", "--jq", '.comments[-1].body // ""']) ?? "");
  return commentCache.get(n);
};
const isAiNote = (line) => /^>\s*(\S+\s+)?\*[^\n]*\b(generated|written)\b[^\n]*\b(AI|Claude)\b/i.test(line);
const lastIsAi = (n) => { const body = lastComment(n).trimStart(); return !body || isAiNote(body.split("\n")[0]); };
const gist = (n) => {
  const line = lastComment(n).split("\n").map((l) => l.trim()).find((l) => l && !isAiNote(l))?.replace(/\*\*/g, "").replace(/^[#>*\s-]+/, "") ?? "";
  return line ? `"${line.length > 160 ? `${line.slice(0, 157)}…` : line}"` : "";
};

// Branches a sandbox left checked out in the loop's worktrees.
const loopWorktrees = new Map();
for (const block of (run("git", ["worktree", "list", "--porcelain"]) ?? "").split("\n\n")) {
  const path = block.match(/^worktree (.+)$/m)?.[1];
  const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1];
  if (path && branch && resolvePath(path).includes("/.sandcastle/worktrees/")) loopWorktrees.set(branch, path);
}
const ticketBranch = (i) => epicOf(i) ? `agent/issue-${i.number}` : `${is(i, "ready-for-agent-debugging") ? "fix" : "feat"}/${i.number}`;
const buildCmd = (i) => `/claim ${i.number}\`, then \`${is(i, "ready-for-agent-debugging") ? "/debug-and-fix" : "/implement"} #${i.number}`;
const conflictFor = (e) => issues.find((x) => x.title === `Resolve conflicts between ${branchOf(e)} and main`);

// The next move on one open issue, or what it waits on in turn. Returns one of:
//   { owner: "you" | "agent", what, to, note?, loop? }   a move (loop: the loop's next pass makes it)
//   { via: [numbers] }                                   waits on these issues
//   { progress: who }                                    being worked; no move needed
//   {}                                                   nothing on this issue itself
const you = (what, to, note) => ({ owner: "you", what, to, note });
const agent = (what, to, note, loop = false) => ({ owner: "agent", what, to, note, loop });
function step(n) {
  const i = byNum.get(n);
  if (!i) return you(`check #${n}: in another repo or hidden, and it blocks live work`, link(n));
  if (is(i, "backlog")) return you(`take ${t(i)} out of backlog, or drop its blocking link: it's parked but blocks live work`, link(n));
  if (is(i, "agent:asked")) return you(`answer the loop's question on ${t(i)}`, link(n), gist(n));
  if (is(i, "epic")) return epicStep(i);

  const e = epicOf(i);
  if (isSpec(i) && is(i, "spec-approved")) return {}; // its epic's next step: cutting the tickets
  if (isSpec(i) && is(i, "ready-for-human")) {
    if (!lastIsAi(n) && e && is(e, "autopilot")) return agent(`revise spec ${t(i)} from your comment`, `/wayfinder ${e.number}`, undefined, true);
    if (unblocks(e ?? i) && !lastComment(n).includes("**Fast mode: your call needed**"))
      return agent(`approve spec ${t(i)}, or ask you about its low-confidence decisions (${mode} mode)`, link(n), undefined, true);
    return you(`review spec ${t(i)}: add \`spec-approved\`, or comment what to change`, link(n), gist(n));
  }
  if (e && /^Resolve conflicts between /.test(i.title)) {
    const manual = is(e, "manual");
    // The loop resolves these in every mode; once it has asked (agent:asked, handled above) or for a manual epic, they're the person's.
    if (manual) return you(`resolve the conflicts between \`${branchOf(e)}\` and main (manual epic), then close ${t(i)}`, `git merge origin/main\` on \`${branchOf(e)}`);
    return agent(`resolve the conflicts between \`${branchOf(e)}\` and main, then close ${t(i)}`, `git merge origin/main\` on \`${branchOf(e)}`, undefined, true);
  }
  if (is(i, "ready-for-human")) {
    if (unblocks(e ?? i) && !e?.labels.some((l) => l.name === "manual")) return agent(`decide ${t(i)} on your behalf (${mode} mode)`, link(n), undefined, true);
    return you(`do or decide ${t(i)} (ready-for-human)`, link(n), gist(n));
  }
  if (is(i, "ready-for-review")) return you(`review ${t(i)}`, link(n));
  if (is(i, "needs-info")) return you(`answer the question on ${t(i)} (needs-info), or get the reporter to`, link(n), gist(n));
  if (is(i, "split")) return {}; // a summary: its children carry the work
  if (is(i, "needs-triage") || !L(i).some((l) => /^ready-for-|^needs-/.test(l)))
    return agent(`triage ${t(i)}`, `/triage ${n}`, undefined, TRIAGE && running);
  if (i.assignees.length) {
    const who = i.assignees.map((a) => a.login);
    if (!who.includes(me)) return { progress: `@${who.join(", @")} is on it` };
    if (running) return { progress: "the loop (or you) is building it" };
    return agent(`${t(i)} is claimed by you but no loop is running: finish it here, or unassign it for the loop`, `/claim ${n}\` (resumes it) or \`gh issue edit ${n} --remove-assignee ${me}`);
  }
  const b = blockers(n);
  if (b.length) return { via: b };
  if (e && e.number !== n) {
    if (e.labels.some((l) => l.name === "manual")) return agent(`build ${t(i)} (manual epic: never the loop's)`, buildCmd(i));
    const eb = blockers(e.number);
    if (EPIC_GATE === "epic" && eb.length) return { via: eb };
    const conflict = conflictFor(e);
    if (conflict) return { via: [conflict.number] };
  }
  const wt = loopWorktrees.get(ticketBranch(i));
  if (wt) return agent(`free \`${ticketBranch(i)}\`, left checked out in a loop worktree, once no sandbox runs on it`, `git worktree remove ${wt}`);
  if (!is(i, "ready-for-agent") && !is(i, "ready-for-agent-debugging")) return {};
  return agent(`build ${t(i)}`, buildCmd(i), "ready now", true);
}

function epicStep(e) {
  const n = e.number;
  const branch = branchOf(e);
  const pr = branch && prs.find((p) => p.headRefName === branch);
  if (pr) {
    const checks = (pr.statusCheckRollup ?? []).map((c) => `${c.context ?? c.name}:${c.conclusion ?? c.state}`);
    if (checks.some((c) => /FAIL|ERROR/i.test(c)))
      return agent(`fix the failing checks on epic PR #${pr.number} (${t(e)})`, `/debug-and-fix\` on \`${branch}\` (${prLink(pr.number)})`);
    if (checks.some((c) => /^verify-epic:SUCCESS/i.test(c)))
      return unblocks(e) ? agent(`merge verified epic PR #${pr.number} (${t(e)})`, prLink(pr.number), undefined, true)
        : you(`merge epic PR #${pr.number} (${t(e)}): verified and green`, prLink(pr.number));
    if (checks.some((c) => /^verify-epic:PENDING/i.test(c))) return { progress: `epic PR #${pr.number} is being verified` };
    return agent(`verify epic PR #${pr.number} (${t(e)})`, `/verify-epic ${pr.number}`, undefined, true);
  }
  if (is(e, "needs-briefing")) return you(`brief ${t(e)}`, `/brief ${n}`);
  if (is(e, "agent:planning") && !running) return agent(`clear the stuck \`agent:planning\` label on ${t(e)}: no loop is running`, `gh issue edit ${n} --remove-label agent:planning`);
  if (is(e, "agent:planning")) return { progress: "the loop is planning it" };
  const items = inMilestone(e);
  const m = milestones.get(e.milestone?.title);
  if (!items.length && m?.closed_issues > 0 && branch) return agent(`open and verify the PR for ${t(e)}: every ticket is done`, `/verify-epic\` once the PR is up`, undefined, true);
  if (!is(e, "autopilot") && !items.length) return you(`plan ${t(e)} (no map yet, not on autopilot)`, `/wayfinder ${n}`);
  const b = blockers(n);
  if (EPIC_GATE === "epic" && b.length) return { via: b };
  if (is(e, "autopilot") && !is(e, "manual")) {
    const spec = items.find(isSpec);
    if (spec && is(spec, "spec-approved")) return agent(`cut the tickets for ${t(e)} from approved spec #${spec.number}`, `/to-tickets #${spec.number}`, undefined, true);
    if (spec) return { via: [spec.number] };
    if (items.some((x) => is(x, "wayfinder:map"))) return agent(`work the map of ${t(e)}`, `/wayfinder ${n}`, undefined, true);
    if (!items.length && !m?.closed_issues) return agent(`chart the map of ${t(e)}`, `/wayfinder ${n}`, undefined, true);
  }
  if (b.length) return { via: b };
  return {};
}

// Walk each held item down to its moves; each move remembers what it frees.
const moves = new Map(); // key -> move & { frees: Set }
const progress = new Map(); // issue -> { who, holds: Set }
function resolve(n, root, seen = new Set()) {
  if (seen.has(n)) return;
  seen.add(n);
  const s = step(n);
  if (s.owner) {
    const key = `${s.owner}|${s.what}`;
    if (!moves.has(key)) moves.set(key, { ...s, n, frees: new Set() });
    moves.get(key).frees.add(root);
  }
  if (s.progress) {
    if (!progress.has(n)) progress.set(n, { who: s.progress, holds: new Set() });
    if (root !== n) progress.get(n).holds.add(root);
  }
  for (const b of s.via ?? []) resolve(b, root, seen);
}

const live = issues.filter((i) => !is(i, "backlog"));
for (const i of live) {
  const queued = (is(i, "ready-for-agent") || is(i, "ready-for-agent-debugging")) && !is(i, "epic") && !isSpec(i);
  const autopilot = is(i, "epic") && is(i, "autopilot");
  // Waiting on someone even when it holds nothing back yet.
  const waiting = is(i, "agent:asked") || (isSpec(i) && is(i, "ready-for-human")) || is(i, "needs-triage");
  if (queued || autopilot || waiting) resolve(i.number, i.number);
}
for (const p of prs) {
  const e = issues.find((x) => is(x, "epic") && branchOf(x) === p.headRefName);
  if (e) resolve(e.number, e.number);
}

// ---- What the loop itself says
const dry = await dryRun;
const backoff = (dry?.backoff ?? status?.backoff ?? []).filter((b) => Date.parse(b.until) > Date.now());
const keyNum = (key) => Number(key.split("#")[1]);
// A job the loop has backed off is one an agent here should look into: the
// loop retries it less and less often. It replaces the plain move on that issue.
for (const [key, m] of moves) if (m.loop && backoff.some((b) => keyNum(b.key) === m.n)) moves.delete(key);
for (const b of backoff) {
  const n = keyNum(b.key);
  moves.set(`agent|backoff ${b.key}`, {
    owner: "agent", n, frees: new Set([n]),
    what: `find out why "${b.what}" keeps failing (${b.count} strike(s); the loop tries again ~${clock(new Date(b.until))}), and fix it`,
    to: b.key.startsWith("build#") ? `/claim ${n}\`, then \`/implement #${n}` : link(n),
    note: b.why ? `last failure: ${b.why.split("\n")[0].slice(0, 200)}` : undefined,
  });
}
if (dry) {
  const lists = ["build", "plan", "verify", "conflicts", "triage", "unblock", "followUp", "specs"];
  const planned = new Set(lists.flatMap((l) => dry[l] ?? []).flatMap((i) => [i.number, ...[...i.what.matchAll(/#(\d+)/g)].map((m) => Number(m[1]))]));
  for (const m of moves.values()) {
    if (!m.loop || planned.has(m.n)) continue;
    m.loop = false; // the loop's own reading of the queue disagrees: an agent here has to do it
    m.note = [m.note, "the loop's dry run doesn't list it: it won't do this on its own"].filter(Boolean).join("; ");
  }
  // What the loop would do that no held item led to.
  const covered = new Set([...moves.values()].map((m) => m.n));
  for (const l of lists) for (const i of dry[l] ?? []) {
    if (covered.has(i.number)) continue;
    covered.add(i.number);
    moves.set(`agent|dry ${l}#${i.number}`, { owner: "agent", n: i.number, frees: new Set([i.number]), loop: true, what: `${i.what}: #${i.number} ${i.title}`, to: link(i.number) });
  }
}
if (status?.unstarted?.tickets?.length && status.unstarted.why?.length)
  health.push(`the last pass (${clock(new Date(status.lastPassAt ?? status.at))}) left ${status.unstarted.tickets.map((n) => `#${n}`).join(", ")} unstarted: ${status.unstarted.why.join("; ")}`);

// ---- Print
const list = (ns, max = 10) => ns.slice(0, max).map((n) => `#${n}`).join(", ") + (ns.length > max ? `, … (${ns.length} in all)` : "");
const ranked = [...moves.values()].map((mv) => {
  const all = new Set(mv.frees);
  // Freeing an issue frees what it blocks, transitively.
  const grow = (n) => { for (const x of live) if (!all.has(x.number) && blockersCache.get(x.number)?.includes(n)) { all.add(x.number); grow(x.number); } };
  for (const n of mv.frees) grow(n);
  return { ...mv, frees: [...all].sort((a, b) => a - b) };
}).sort((x, y) => y.frees.length - x.frees.length || Number(y.loop ?? false) - Number(x.loop ?? false));
const agentMoves = ranked.filter((m) => m.owner === "agent");
const yourMoves = ranked.filter((m) => m.owner === "you");
const loopMoves = agentMoves.filter((m) => m.loop);

const doing = { building: "building", retrying: "waiting to retry", limit: "waiting out a usage limit", passing: "passing now" }[status?.state];
const state = running ? `running, pid ${loopPids.join(", ")}${asleep ? `, asleep since ${clock(asleep.since)}, next pass by ~${clock(asleep.until)}`
  : doing ? `, ${doing}${status.until ? ` until ~${clock(new Date(status.until))}` : ""}${status.building?.length ? ` (${status.building.map((n) => `#${n}`).join(", ")})` : ""}`
  : lastRun ? `, last agent run ${clock(lastRun)}` : ""}` : "NOT running";
const out = [`# Why the loop is sleeping (${repo}, mode: ${mode}, loop ${state})`, ""];
if (loopMoves.length && !running)
  health.push(`the loop isn't running, and ${loopMoves.length} move(s) below are its to make → \`npm run agents:awake\`, or tell an agent to make them`);
if (loopMoves.length && asleep)
  health.push(status
    ? `the loop is asleep with ${loopMoves.length} move(s) its next pass would make: it wakes when GitHub changes, or by ~${clock(asleep.until)}; restart it to pass now (\`npm run agents:stop\`, then \`npm run agents:awake\`), or tell an agent to make them`
    : `the loop is asleep with ${loopMoves.length} move(s) it could make now (it sleeps ${Math.round((asleep.until - asleep.since) / 60_000)} min and doesn't see new work until then): wait for ~${clock(asleep.until)}, restart it (\`npm run agents:stop\`, then \`npm run agents:awake\`), or tell an agent to make them`);
if (health.length) out.push("## Loop problems (fix first)", ...health.map((h) => `- ${h}`), "");

const line = (m) => `- ${m.what} → \`${m.to}\`${m.note ? `\n  ${m.note}` : ""}\n  frees: ${list(m.frees)}`.replace(/→ `(https:\/\/[^`]+)`/, "→ $1");
out.push("## Agent work (an agent can do it when told; [loop] = the loop's next pass also takes it)");
if (!agentMoves.length) out.push("- none");
for (const m of agentMoves) out.push(line(m).replace(/^- /, m.loop ? "- [loop] " : "- "));
out.push("", "## Your work (only you can do it)");
if (!yourMoves.length) out.push("- none: nothing held waits on you");
for (const m of yourMoves) out.push(line(m));

if (progress.size) {
  out.push("", "## In progress (no move needed)");
  for (const [n, p] of progress) out.push(`- #${n} ${byNum.get(n)?.title ?? ""}: ${p.who}${p.holds.size ? `; holds ${list([...p.holds].sort((a, b) => a - b))}` : ""}`);
}
const nextBrief = live.filter((i) => is(i, "epic") && is(i, "needs-briefing"))
  .sort((a, b) => (a.milestone?.title ?? "").localeCompare(b.milestone?.title ?? ""))[0];
if (nextBrief && !yourMoves.some((m) => m.to === `/brief ${nextBrief.number}`))
  out.push("", "## Next epic to brief (work for later, after the moves above)", `- #${nextBrief.number} ${nextBrief.title} → \`/brief ${nextBrief.number}\``);
console.log(out.join("\n"));
