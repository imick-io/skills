#!/usr/bin/env node
// Read-only: what a person must do so the agent loop has work again, for /why-sleeping.
// Run from the repo root: node <skill>/scripts/blockers.mjs
// Follows every held piece of work (a blocked ticket, a held autopilot epic)
// down its blocked-by chain to the action only a person can take, then prints
// those actions ranked by how much each frees. Never writes, never prints a secret.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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

// ---- The loop itself: anything here outranks the queue
const health = [];
const env = existsSync(".sandcastle/.env") ? readFileSync(".sandcastle/.env", "utf8") : "";
const mode = env.match(/^\s*AGENTS_MODE\s*=\s*(\w+)/m)?.[1] ?? "normal";
if (!existsSync(".sandcastle/main.mts")) health.push("agent loop not installed (/setup-imick-skills)");
if (!run("docker", ["info", "--format", "{{.ServerVersion}}"])) health.push("Docker is not running: start Docker Desktop");
const here = process.cwd();
const loopPids = (run("ps", ["-Ao", "pid=,command="]) ?? "").split("\n")
  .filter((l) => /\.sandcastle\/main\.mts/.test(l)).map((l) => l.trim().split(/\s+/)[0])
  .filter((pid) => (run("lsof", ["-a", "-d", "cwd", "-p", pid, "-Fn"]) ?? "").split("\n").find((l) => l.startsWith("n"))?.slice(1) === here);
const running = loopPids.length > 0;
if (existsSync(".sandcastle/STOP")) health.push("a stop was requested (.sandcastle/STOP): the loop exits after its in-flight work");
if (existsSync(".sandcastle/logs")) {
  const logs = readdirSync(".sandcastle/logs").map((f) => join(".sandcastle/logs", f)).map((f) => [f, statSync(f).mtimeMs]).sort((a, b) => b[1] - a[1]);
  const tail = logs[0] ? readFileSync(logs[0][0], "utf8").split("\n").slice(-15).join("\n") : "";
  if (/usage limit|rate limit|429/i.test(tail)) health.push(`usage limit hit (${logs[0][0]}): the loop retries on its own; nothing to do but wait or raise the limit`);
}

// ---- GitHub
const repo = run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
if (!repo) { console.log("Could not read the repo with gh (not a GitHub repo, or gh not logged in)."); process.exit(1); }
const issues = json("gh", ["issue", "list", "--state", "open", "--limit", "300", "--json", "number,title,labels,assignees,milestone,body"]) ?? [];
const prs = json("gh", ["pr", "list", "--state", "open", "--limit", "50", "--json", "number,headRefName,statusCheckRollup"]) ?? [];
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
const branchOf = (e) => e.body.match(/`(epic\/[^`]+)`/)?.[1];
const link = (n) => `https://github.com/${repo}/issues/${n}`;

// The person's action on one open issue, or the issues it waits on in turn.
// Returns { action } or { via: [numbers] } or { agents: true } (the loop will do it).
function step(n) {
  const i = byNum.get(n);
  if (!i) return { action: `#${n} is in another repo or hidden: check it → ${link(n)}` };
  const t = `#${n} ${i.title}`;
  if (is(i, "backlog")) return { action: `${t} is parked in backlog but blocks live work: take it out of backlog, or drop the blocking link` };
  if (is(i, "agent:asked")) return { action: `answer the loop's question on ${t} (a comment) → ${link(n)}` };
  if (is(i, "epic")) {
    const pr = prs.find((p) => p.headRefName === branchOf(i));
    if (pr) {
      const checks = (pr.statusCheckRollup ?? []).map((c) => `${c.context ?? c.name}:${c.conclusion ?? c.state}`);
      if (checks.some((c) => /FAIL|ERROR/i.test(c))) return { action: `fix the failing checks on epic PR #${pr.number} (${t}) → https://github.com/${repo}/pull/${pr.number}` };
      if (checks.some((c) => /^verify-epic:SUCCESS/i.test(c)) && !unblocks(i)) return { action: `merge epic PR #${pr.number} (${t}): verified and green → https://github.com/${repo}/pull/${pr.number}` };
      return { agents: true };
    }
    if (is(i, "needs-briefing")) return { action: `brief ${t} → \`/brief ${n}\`` };
    if (is(i, "agent:planning") && !running) return { action: `${t} is stuck in agent:planning with no loop running → \`gh issue edit ${n} --remove-label agent:planning\`` };
    if (!is(i, "autopilot")) {
      const items = issues.filter((x) => x.number !== n && x.milestone?.title === i.milestone?.title);
      if (!items.length) return { action: `plan ${t} (manual epic, no map yet) → \`/wayfinder ${n}\`` };
    }
    const b = blockers(n);
    if (b.length) return { via: b };
    return { agents: true, epic: n };
  }
  if (isSpec(i) && !is(i, "spec-approved") && is(i, "ready-for-human") && !unblocks(epicOf(i) ?? i))
    return { action: `review spec ${t}: add \`spec-approved\`, or comment what to change → ${link(n)}` };
  if (is(i, "ready-for-human") && !unblocks(epicOf(i) ?? i)) return { action: `do or decide ${t} (ready-for-human) → ${link(n)}` };
  if (is(i, "ready-for-review")) return { action: `review ${t} → ${link(n)}` };
  if (is(i, "needs-info")) return { action: `answer the question on ${t} (needs-info) → ${link(n)}` };
  if (is(i, "needs-triage") || !L(i).some((l) => /^ready-for-|^needs-/.test(l))) return { action: `triage ${t} → \`/triage ${n}\`` };
  if (i.assignees.length && !running) return { action: `${t} is claimed (assigned) but no loop is running: unassign it, or start the loop` };
  const b = blockers(n);
  if (b.length) return { via: b };
  const e = epicOf(i);
  if (e && e.number !== n) return { via: [e.number] };
  return { agents: true };
}

// Walk down to the person's actions; each one remembers what it frees.
const actions = new Map(); // action -> Set of held items it frees
function resolve(n, root, seen = new Set()) {
  if (seen.has(n)) return;
  seen.add(n);
  const s = step(n);
  if (s.action) { if (!actions.has(s.action)) actions.set(s.action, new Set()); actions.get(s.action).add(root); }
  for (const b of s.via ?? []) resolve(b, root, seen);
}

const live = issues.filter((i) => !is(i, "backlog"));
const held = [];
for (const i of live) {
  const queued = (is(i, "ready-for-agent") || is(i, "ready-for-agent-debugging")) && !is(i, "epic") && !isSpec(i);
  const autopilot = is(i, "epic") && is(i, "autopilot");
  if (!queued && !autopilot) continue;
  held.push(i.number);
  resolve(i.number, i.number);
}
// Waiting on a person even when it holds nothing back yet.
for (const i of live) if (is(i, "agent:asked") || (isSpec(i) && is(i, "ready-for-human"))) resolve(i.number, i.number);
for (const p of prs) {
  const e = issues.find((x) => is(x, "epic") && branchOf(x) === p.headRefName);
  if (e) resolve(e.number, e.number);
}

// ---- Print
const out = [`# Why the loop is sleeping (${repo}, mode: ${mode}, loop ${running ? `running, pid ${loopPids.join(", ")}` : "NOT running"})`, ""];
if (health.length) out.push("## Loop problems (fix first)", ...health.map((h) => `- ${h}`), "");
const ranked = [...actions].map(([a, frees]) => {
  const all = new Set(frees);
  // An epic freed frees the epics and tickets it blocks, transitively.
  const grow = (n) => { for (const x of live) if (!all.has(x.number) && blockersCache.get(x.number)?.includes(n)) { all.add(x.number); grow(x.number); } };
  for (const n of frees) grow(n);
  return { a, frees: [...all] };
}).sort((x, y) => y.frees.length - x.frees.length);
out.push("## Your moves, most freed first");
if (!ranked.length) out.push("- none: nothing held waits on a person");
for (const r of ranked) out.push(`- ${r.a}\n  frees: ${r.frees.map((n) => `#${n}`).join(", ")}`);
const nextBrief = live.filter((i) => is(i, "epic") && is(i, "needs-briefing"))
  .sort((a, b) => (a.milestone?.title ?? "").localeCompare(b.milestone?.title ?? ""))[0];
if (nextBrief && !ranked.some((r) => r.a.includes(`/brief ${nextBrief.number}`)))
  out.push("", `## Next epic to brief (work for later, after the moves above)`, `- #${nextBrief.number} ${nextBrief.title} → \`/brief ${nextBrief.number}\``);
const agentsOnIt = held.filter((n) => step(n).agents);
if (agentsOnIt.length && !running) {
  const i = out.indexOf("## Your moves, most freed first");
  out.splice(i, 0, "## Loop problems (fix first)", `- the loop isn't running, and ${agentsOnIt.map((n) => `#${n}`).join(", ")} are ready for it → \`npm run agents:awake\``, "");
}
if (agentsOnIt.length) out.push("", "## Already the agents' (picked up on the next pass, no move needed)", `- ${agentsOnIt.map((n) => `#${n}`).join(", ")}`);
console.log(out.join("\n"));
