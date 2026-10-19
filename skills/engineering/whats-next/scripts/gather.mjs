#!/usr/bin/env node
// Read-only snapshot of where an imick-skills project stands, for /whats-next.
// Run from the repo root: node <skill>/scripts/gather.mjs
// Prints one Markdown section per check. Never writes, and never prints a
// secret: .env files are read for key names only (AGENTS_* values excepted).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const run = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], ...opts }).trim();
  } catch {
    return null;
  }
};
const json = (cmd, args) => {
  const out = run(cmd, args);
  try { return out ? JSON.parse(out) : null; } catch { return null; }
};
const out = [];
const section = (title, lines) => out.push(`## ${title}\n\n${lines.length ? lines.join("\n") : "- nothing"}\n`);
const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

// ---- Setup
const setup = [];
const skillsDir = [".claude/skills", ".agents/skills"].find((d) => existsSync(d));
for (const f of ["docs/agents/issue-tracker.md", "docs/agents/triage-labels.md", "docs/agents/team.md", "GLOSSARY.md"])
  setup.push(`- ${f}: ${existsSync(f) ? "present" : "MISSING"}`);
setup.push(`- skills folder: ${skillsDir ?? "MISSING"}`);
setup.push(`- agent loop (.sandcastle/main.mts): ${existsSync(".sandcastle/main.mts") ? "installed" : "not installed"}`);
setup.push(`- tracker page (tracker/build.mjs): ${existsSync("tracker/build.mjs") ? "installed" : "not installed"}`);
section("Setup", setup);

// ---- Skills vs upstream (skills-lock.json): compare git blob ids, file by file
const drift = [];
const lock = existsSync("skills-lock.json") ? JSON.parse(readFileSync("skills-lock.json", "utf8")).skills ?? {} : {};
const bySource = {};
for (const [name, s] of Object.entries(lock)) if (s.sourceType === "github") (bySource[s.source] ??= []).push([name, s]);
const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]);
for (const [source, skills] of Object.entries(bySource)) {
  const tree = json("gh", ["api", `repos/${source}/git/trees/HEAD?recursive=1`]);
  if (!tree) { drift.push(`- ${source}: could not read upstream (gh not logged in, or offline)`); continue; }
  const blobs = new Map(tree.tree.filter((t) => t.type === "blob").map((t) => [t.path, t.sha]));
  const behind = [];
  for (const [name, s] of skills) {
    const up = dirname(s.skillPath);
    const local = skillsDir && join(skillsDir, name);
    if (!local || !existsSync(local)) { behind.push(`${name} (missing locally)`); continue; }
    const files = listFiles(local);
    const shas = (run("git", ["hash-object", ...files]) ?? "").split("\n");
    const mine = new Map(files.map((f, i) => [relative(local, f), shas[i]]));
    const theirs = [...blobs].filter(([p]) => p.startsWith(up + "/")).map(([p, sha]) => [p.slice(up.length + 1), sha]);
    if (!theirs.length) { behind.push(`${name} (gone or moved upstream)`); continue; }
    const differs = theirs.some(([p, sha]) => mine.get(p) !== sha) || [...mine.keys()].some((p) => !theirs.find(([q]) => q === p));
    if (differs) behind.push(name);
  }
  const tracked = new Set(skills.map(([, s]) => s.skillPath));
  const added = [...blobs.keys()].filter((p) => /^skills\/(?!in-progress\/)[^/]+\/[^/]+\/SKILL\.md$/.test(p) && !tracked.has(p))
    .map((p) => p.split("/")[2]);
  drift.push(`- ${source}: ${behind.length ? `differs from upstream: ${behind.join(", ")}` : "all tracked skills match upstream"}`);
  if (added.length) drift.push(`- ${source}: new upstream, not installed: ${added.join(", ")}`);
}
if (!Object.keys(bySource).length) drift.push("- no skills-lock.json entries from GitHub");
section("Skills vs upstream", drift);

// ---- Agent loop files vs the installed setup-imick-skills templates
const tmpl = skillsDir && join(skillsDir, "setup-imick-skills/agent-loop");
const loopFiles = [];
if (existsSync(".sandcastle") && tmpl && existsSync(tmpl)) {
  for (const f of readdirSync(tmpl)) {
    const mine = join(".sandcastle", f);
    if (!existsSync(mine)) loopFiles.push(`- .sandcastle/${f}: missing (new in the templates)`);
    else if (readFileSync(mine, "utf8") !== readFileSync(join(tmpl, f), "utf8")) loopFiles.push(`- .sandcastle/${f}: differs from the template (an update, or a local change)`);
  }
  if (existsSync("tracker/build.mjs") && existsSync(join(skillsDir, "tracker/build.mjs")) &&
      readFileSync("tracker/build.mjs", "utf8") !== readFileSync(join(skillsDir, "tracker/build.mjs"), "utf8"))
    loopFiles.push("- tracker/build.mjs: differs from the tracker skill's copy");
}
section("Agent loop files vs templates", loopFiles.length || !existsSync(".sandcastle") ? loopFiles : ["- all match"]);

// ---- Agent loop: config, Docker, process, last log
const loop = [];
if (existsSync(".sandcastle")) {
  const env = existsSync(".sandcastle/.env") ? readFileSync(".sandcastle/.env", "utf8") : null;
  if (env === null) loop.push("- .sandcastle/.env: MISSING (copy .env.example and fill it)");
  else {
    const keys = Object.fromEntries(env.split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].trim()]));
    const has = (k) => keys[k] ? "set" : "MISSING";
    loop.push(`- Claude token (CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY): ${keys.CLAUDE_CODE_OAUTH_TOKEN || keys.ANTHROPIC_API_KEY ? "set" : "MISSING"}`);
    loop.push(`- GH_TOKEN: ${has("GH_TOKEN")}; SLACK_ALERTS_WEBHOOK_URL: ${keys.SLACK_ALERTS_WEBHOOK_URL ? "set" : "not set"}; SLACK_USER_ID: ${keys.SLACK_USER_ID ? "set" : "not set"}`);
    const agents = Object.entries(keys).filter(([k]) => k.startsWith("AGENTS_")).map(([k, v]) => `${k}=${v}`);
    loop.push(`- mode: ${agents.length ? agents.join(", ") : "normal (no AGENTS_* settings)"}`);
  }
  loop.push(`- Docker: ${run("docker", ["info", "--format", "{{.ServerVersion}}"]) ? "running" : "NOT running"}`);
  const procs = (run("ps", ["-Ao", "pid=,command="]) ?? "").split("\n").filter((l) => /\.sandcastle\/main\.mts/.test(l) && !/ps -Ao/.test(l));
  const here = process.cwd();
  const mine = procs.map((l) => l.trim().split(/\s+/)[0]).filter((pid) => {
    const cwd = existsSync(`/proc/${pid}/cwd`) ? run("readlink", [`/proc/${pid}/cwd`]) : (run("lsof", ["-a", "-d", "cwd", "-p", pid, "-Fn"]) ?? "").split("\n").find((l) => l.startsWith("n"))?.slice(1);
    return cwd === here;
  });
  loop.push(`- loop process for this repo: ${mine.length ? `running (pid ${mine.join(", ")})` : "not running"}`);
  if (existsSync(".sandcastle/logs")) {
    const logs = listFiles(".sandcastle/logs").map((f) => [f, statSync(f).mtimeMs]).sort((a, b) => b[1] - a[1]);
    if (logs.length) {
      const [f, t] = logs[0];
      const tail = readFileSync(f, "utf8").trim().split("\n").slice(-5).map((l) => `    ${l.slice(0, 200)}`);
      loop.push(`- last log: ${f}, ${ago(t)}`, ...tail);
    }
  }
}
section("Agent loop", loop);

// ---- Local git state
const git = [];
const branch = run("git", ["branch", "--show-current"]);
git.push(`- branch: ${branch}`);
const status = (run("git", ["status", "--porcelain"]) ?? "").split("\n").filter(Boolean);
if (status.length) git.push(`- uncommitted: ${status.length} paths`, ...status.slice(0, 15).map((l) => `    ${l}`));
const ahead = run("git", ["rev-list", "--count", "@{u}..HEAD"]);
if (ahead && ahead !== "0") git.push(`- unpushed commits on ${branch}: ${ahead}`);
if (ahead === null && branch) git.push(`- ${branch} has no upstream branch`);
section("Local git", git);

// ---- GitHub: what waits on a person, and where the epics stand
const gh = [];
const me = run("gh", ["api", "user", "--jq", ".login"]);
const issues = json("gh", ["issue", "list", "--state", "open", "--limit", "300", "--json", "number,title,labels,assignees,milestone,updatedAt,url"]);
if (!issues) section("GitHub", ["- could not read issues (not a GitHub repo, or gh not logged in)"]);
else {
  const L = (i) => i.labels.map((l) => l.name);
  const is = (i, l) => L(i).includes(l);
  const live = issues.filter((i) => !is(i, "backlog"));
  const blocking = (n) => json("gh", ["api", `repos/{owner}/{repo}/issues/${n}`, "--jq", ".issue_dependencies_summary"]);
  const line = (i, extra = "") => {
    const who = i.assignees.map((a) => a.login).join(", ") || "unassigned";
    const dep = blocking(i.number);
    const holds = dep?.blocking ? `, blocks ${dep.blocking} open` : "";
    const blocked = dep?.blocked_by ? `, blocked by ${dep.blocked_by} open` : "";
    return `  - #${i.number} ${i.title} (${who}${holds}${blocked}${i.milestone ? `, ${i.milestone.title}` : ""})${extra}`;
  };
  const group = (title, list, max = 10) => {
    if (!list.length) return;
    gh.push(`- ${title}: ${list.length}`, ...list.slice(0, max).map((i) => line(i)));
  };
  gh.push(`- you are: ${me ?? "unknown"}`);
  const spec = (i) => is(i, "spec");
  group("agent:asked (a question the loop waits on; answer with a comment)", live.filter((i) => is(i, "agent:asked")));
  group("specs to approve (add spec-approved, or comment what to change)", live.filter((i) => spec(i) && is(i, "ready-for-human") && !is(i, "spec-approved")));
  group("epics to brief (/brief)", live.filter((i) => is(i, "epic") && is(i, "needs-briefing")));
  group("ready-for-human (other)", live.filter((i) => is(i, "ready-for-human") && !spec(i) && !is(i, "needs-briefing") && !is(i, "agent:asked")));
  group("ready-for-review", live.filter((i) => is(i, "ready-for-review")));
  group("needs-scoping (/scope-decomposer)", live.filter((i) => is(i, "needs-scoping")));
  group("needs-triage (/triage)", live.filter((i) => is(i, "needs-triage")), 5);
  group("agent:planning (an agent is planning it; stuck if the loop isn't running)", live.filter((i) => is(i, "agent:planning")));
  const assumed = live.filter((i) => is(i, "agent:assumed"));
  if (assumed.length) gh.push(`- agent:assumed (in the daily digest; comment to change a call): ${assumed.length}`);
  const queue = live.filter((i) => (is(i, "ready-for-agent") || is(i, "ready-for-agent-debugging")) && !i.assignees.length);
  gh.push(`- agent queue (ready-for-agent / -debugging, unclaimed): ${queue.length}`);
  const epics = live.filter((i) => is(i, "epic")).sort((a, b) => (a.milestone?.title ?? "").localeCompare(b.milestone?.title ?? ""));
  if (epics.length) {
    gh.push(`- open epics, in build order: ${epics.length}`);
    for (const e of epics.slice(0, 8)) {
      const mode = is(e, "autopilot") ? "autopilot" : is(e, "needs-briefing") ? "needs brief" : "manual";
      gh.push(line(e, ` [${mode}${is(e, "agent:planning") ? ", planning" : ""}]`));
    }
  }
  if (!issues.some((i) => is(i, "initiative")) && !epics.length) gh.push("- no initiative or epics yet");
  const prs = json("gh", ["pr", "list", "--state", "open", "--json", "number,title,headRefName,isDraft,reviewDecision,statusCheckRollup", "--limit", "30"]) ?? [];
  if (prs.length) {
    gh.push(`- open PRs: ${prs.length}`);
    for (const p of prs.slice(0, 10)) {
      const checks = (p.statusCheckRollup ?? []).map((c) => c.conclusion ?? c.state).filter(Boolean);
      const state = checks.some((c) => /FAIL|ERROR/i.test(c)) ? "checks failing" : checks.length && checks.every((c) => /SUCCESS|NEUTRAL|SKIPPED/i.test(c)) ? "checks green" : "checks pending";
      gh.push(`  - #${p.number} ${p.title} (${p.headRefName}${p.isDraft ? ", draft" : ""}, ${state})`);
    }
  }
  section("GitHub", gh);
}

console.log(out.join("\n"));
