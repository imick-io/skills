// Issue tracker page: pulls every issue and its blocking edges from GitHub
// with `gh`, and writes tracker/index.html (gitignored) to open in a browser.
// The repo is the one `gh` resolves from the working directory.
//
//   node tracker/build.mjs          build and open
//   node tracker/build.mjs --no-open
//
// Hosted on Vercel, `render()` builds the page on request instead (see
// tracker/api/index.mjs): with GITHUB_TOKEN set it calls GitHub's GraphQL API
// directly, since there is no `gh` there, and the repo comes from
// TRACKER_REPO (owner/name) or Vercel's git env vars.
//
// When the repo has a test-suites/ folder (slow suites run through "Run
// <suite>" tickets, see its README), a Test suites tab reads the suite files
// on the default branch and tells, from each suite's last green run and the
// commits since, whether it is stale. That needs Contents: read on the token.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "index.html");

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const QUERY = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $after, orderBy: { field: CREATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title body state stateReason url closedAt createdAt
        labels(first: 20) { nodes { name } }
        milestone { title }
        assignees(first: 5) { nodes { login } }
        blockedBy(first: 50) { nodes { number } }
        comments(last: 1) { nodes { body createdAt } }
      }
    }
  }
}`;

async function resolveRepo() {
  const slug = process.env.TRACKER_REPO
    ?? (process.env.VERCEL_GIT_REPO_OWNER && `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`);
  if (slug) { const [owner, name] = slug.split("/"); return { owner, name }; }
  const { owner, name } = JSON.parse(execFileSync("gh", ["repo", "view", "--json", "owner,name"], { encoding: "utf8" }));
  return { owner: owner.login, name };
}

async function graphql(query, variables) {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error(`GitHub GraphQL: ${res.status} ${JSON.stringify(json.errors ?? json)}`);
    return json.data;
  }
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(variables)) if (v != null) args.push("-F", `${k}=${v}`);
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })).data;
}

// REST, for what GraphQL doesn't offer (comparing two commits).
async function rest(path) {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    const res = await fetch(`https://api.github.com/${path}`, { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub REST: ${res.status} ${path}`);
    return res.json();
  }
  return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

// The slow suites: test-suites/*.md on the default branch, each a frontmatter
// (name, command, covers, takes, runs-via) over a paragraph. `present` is
// false when the repo has no such folder, and the tab is left out.
async function fetchSuites(REPO) {
  const data = await graphql(`query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      defaultBranchRef { name }
      object(expression: "HEAD:test-suites") { ... on Tree { entries { name object { ... on Blob { text } } } } }
    }
  }`, { owner: REPO.owner, name: REPO.name });
  const branch = data.repository.defaultBranchRef?.name ?? "main";
  const entries = data.repository.object?.entries ?? [];
  const suites = entries
    .filter((e) => e.name.endsWith(".md") && e.name !== "README.md")
    .map((e) => parseSuite(e.object?.text ?? "", e.name))
    .filter(Boolean)
    .map((s) => ({ ...s, url: `https://github.com/${REPO.owner}/${REPO.name}/blob/${branch}/${s.file}` }));
  return { branch, present: Boolean(data.repository.object), suites };
}
function parseSuite(text, file) {
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
  if (!fm) return null;
  const field = (k) => fm.match(new RegExp(`^${k}:[ \\t]*(.*)$`, "m"))?.[1].trim() ?? "";
  const unquote = (s) => s.trim().replace(/^["']|["']$/g, "");
  const list = (k) => {
    const inline = field(k);
    if (inline.startsWith("[")) return inline.slice(1, inline.lastIndexOf("]")).split(",").map(unquote).filter(Boolean);
    const block = fm.match(new RegExp(`^${k}:[ \\t]*\\n((?:[ \\t]+-[^\\n]*\\n?)*)`, "m"))?.[1] ?? "";
    return block.split("\n").map((l) => unquote(l.replace(/^\s*-\s*/, ""))).filter(Boolean);
  };
  const body = text.slice(text.indexOf("---", 3) + 3).trim();
  return { name: field("name") || file.replace(/\.md$/, ""), file: `test-suites/${file}`, command: field("command"), covers: list("covers"), takes: field("takes"), runsVia: field("runs-via") || "sandbox", about: body.split(/\n\s*\n/)[0] ?? "" };
}
// `**` crosses folders, `*` doesn't; a glob with no `/` matches the file name
// in any folder, like .gitignore. Same rule as the agent loop's.
function matchesGlob(file, glob) {
  const re = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\0/g, ".*");
  return new RegExp(`^${glob.includes("/") ? "" : "(.*/)?"}${re}$`).test(file);
}

// Open PRs by head branch, for an epic's "merge" status.
async function fetchOpenPrs(REPO) {
  const data = await graphql(`query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      pullRequests(first: 100, states: OPEN) { nodes { number url title headRefName } }
    }
  }`, { owner: REPO.owner, name: REPO.name });
  return new Map(data.repository.pullRequests.nodes.map((p) => [p.headRefName, { number: p.number, url: p.url, title: p.title }]));
}

async function fetchIssues(REPO) {
  const all = [];
  let after = null;
  do {
    const page = (await graphql(QUERY, { owner: REPO.owner, name: REPO.name, after })).repository.issues;
    all.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return all.map((i) => ({
    number: i.number,
    title: i.title,
    open: i.state === "OPEN",
    notPlanned: i.stateReason === "NOT_PLANNED",
    url: i.url,
    closedAt: i.closedAt,
    createdAt: i.createdAt,
    labels: i.labels.nodes.map((l) => l.name),
    milestone: i.milestone?.title ?? null,
    assigned: i.assignees.nodes.length > 0,
    assignees: i.assignees.nodes.map((a) => a.login),
    body: i.body ?? "",
    lastComment: i.comments.nodes[0] ?? null,
    blockedBy: i.blockedBy.nodes.map((b) => b.number),
  }));
}

// ---------------------------------------------------------------------------
// Classify
// ---------------------------------------------------------------------------

export async function render() {
const REPO = await resolveRepo();
const [issues, openPrs, suiteFiles] = await Promise.all([fetchIssues(REPO), fetchOpenPrs(REPO), fetchSuites(REPO).catch(() => ({ present: false, suites: [], branch: "main" }))]);
const byNumber = new Map(issues.map((i) => [i.number, i]));
const has = (i, label) => i.labels.includes(label);
const isPlanning = (i) => i.labels.some((l) => l.startsWith("wayfinder:")) || has(i, "spec");
// A split issue is only a summary: its children are the tickets.
const isTicket = (i) => !has(i, "epic") && !has(i, "initiative") && !has(i, "split") && !isPlanning(i);
const openBlockers = (i) => i.blockedBy.map((n) => byNumber.get(n)).filter((b) => b && b.open);

// Who acts next on a ticket.
function ticketStatus(i) {
  if (!i.open) return i.notPlanned ? "dropped" : "done";
  if (has(i, "backlog")) return "backlog";
  if (has(i, "ready-for-review")) return "review";
  if (openBlockers(i).length) return "blocked";
  if (has(i, "ready-for-human")) return "you";
  if (has(i, "ready-for-agent") || has(i, "ready-for-agent-debugging")) return i.assigned ? "working" : "queued";
  return "triage";
}

const epics = issues.filter((i) => has(i, "epic"));
const epicOf = (i) => epics.find((e) => e.milestone && e.milestone === i.milestone && e !== i) ?? null;
const ticketsOf = (e) => issues.filter((i) => isTicket(i) && i.milestone && i.milestone === e.milestone);
const planningOf = (e) => issues.filter((i) => isPlanning(i) && i.milestone && i.milestone === e.milestone);

function epicStatus(e) {
  if (!e.open) return "done";
  if (has(e, "backlog")) return "backlog";
  if (has(e, "needs-briefing")) return "brief";
  const plans = planningOf(e);
  const spec = plans.find((p) => has(p, "spec") && p.open);
  if (spec && !has(spec, "spec-approved")) return "spec";
  const tickets = ticketsOf(e);
  if (openBlockers(e).length) return tickets.length ? "held" : "waiting";
  if (has(e, "agent:planning") || plans.some((p) => p.open && has(p, "wayfinder:map"))) return "planning";
  if (tickets.length && tickets.every((t) => !t.open) && !plans.some((p) => p.open)) return "merge";
  if (tickets.length) return "building";
  return "ready";
}

// The epic's open PR (the loop opens it once no ticket is left), for the
// "merge" status.
function epicPr(e) {
  const branch = e.body.match(/`(epic\/[^`]+)`/)?.[1];
  if (!branch) return null;
  return openPrs.get(branch) ?? null;
}

// A `manual` epic is a person's end to end, so its statuses name them, not the agent.
const MANUAL_STATUS = {
  planning: "You are planning it",
  building: "You are building it",
  ready: "Ready for you to plan",
  merge: "Built; merge its PR",
};

const EPIC_STATUS = {
  done: "Done",
  brief: "Needs your brief",
  spec: "Spec waits for your approval",
  held: "Planned; held until blockers finish",
  waiting: "Waiting on earlier epics",
  planning: "Agent is planning",
  merge: "Built and verified; merge its PR",
  building: "Building",
  ready: "Ready to plan",
  backlog: "In the backlog",
};

const TICKET_STATUS = {
  you: "Your turn",
  review: "Your review",
  working: "Agent working",
  queued: "Agent queue",
  blocked: "Blocked",
  triage: "Needs triage",
  backlog: "Backlog",
  done: "Done",
  dropped: "Dropped",
};

// ---------------------------------------------------------------------------
// Data for the page
// ---------------------------------------------------------------------------

const tickets = issues.filter(isTicket).map((i) => {
  const epic = epicOf(i);
  return {
    number: i.number,
    title: i.title,
    url: i.url,
    status: ticketStatus(i),
    human: has(i, "ready-for-human"),
    epic: epic?.number ?? null,
    what: ["bug", "enhancement", "needs-scoping", "needs-info", "wontfix"].find((w) => has(i, w)) ?? null,
    area: i.labels.find((l) => l.startsWith("area:"))?.slice(5) ?? null,
    blockedBy: i.blockedBy,
    openBlockers: openBlockers(i).map((b) => b.number),
    closedAt: i.closedAt,
  };
});
for (const t of tickets) {
  t.blocking = tickets.filter((o) => o.blockedBy.includes(t.number)).map((o) => o.number);
}

const epicData = epics.map((e) => {
  const ts = tickets.filter((t) => t.epic === e.number);
  return {
    number: e.number,
    title: e.title,
    url: e.url,
    milestone: e.milestone,
    status: epicStatus(e),
    area: e.labels.find((l) => l.startsWith("area:"))?.slice(5) ?? null,
    version: e.labels.find((l) => l.startsWith("version:"))?.slice(8) ?? null,
    autopilot: has(e, "autopilot"),
    manual: has(e, "manual"),
    blockedBy: e.blockedBy,
    openBlockers: openBlockers(e).map((b) => b.number),
    total: ts.length,
    done: ts.filter((t) => t.status === "done" || t.status === "dropped").length,
    counts: Object.fromEntries(Object.keys(TICKET_STATUS).map((s) => [s, ts.filter((t) => t.status === s).length])),
  };
});

// Human-in-the-loop items: everything a person acts on next, with the
// checkboxes from its body (the Acceptance criteria section when present).
function checklist(body) {
  const section = body.match(/^## Acceptance criteria\s*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? body;
  return [...section.matchAll(/^\s*[-*] \[( |x|X)\] (.+)$/gm)].map((m) => ({ done: m[1] !== " ", text: m[2].trim() }));
}
function hitlKind(i) {
  if (has(i, "ready-for-review")) return "review";
  if (has(i, "spec")) return "spec";
  if (has(i, "epic")) return "brief";
  return "task";
}
// Every open issue that waits on this one, directly or down the chain.
const blocksDirect = new Map(issues.map((i) => [i.number, []]));
for (const i of issues) if (i.open) for (const b of i.blockedBy) blocksDirect.get(b)?.push(i.number);
// An epic only closes once its tickets are done, and later epics wait on it.
const viaEpic = new Map();
for (const i of issues) {
  const epic = isTicket(i) && i.open ? epicOf(i) : null;
  if (epic?.open) viaEpic.set(i.number, epic.number);
}
function downstreamAll(n, seen = new Set()) {
  const next = [...(blocksDirect.get(n) ?? []), ...(viaEpic.has(n) ? [viaEpic.get(n)] : [])];
  for (const m of next) if (!seen.has(m)) { seen.add(m); downstreamAll(m, seen); }
  return seen;
}

// A finished epic: every ticket done, nothing left to plan, its PR waits for
// a person's merge.
const mergeItems = epics
  .filter((e) => epicStatus(e) === "merge")
  .map((e) => {
    const pr = epicPr(e);
    return {
      number: e.number,
      title: e.title,
      url: pr?.url ?? e.url,
      kind: "merge",
      assignees: e.assignees,
      epic: e.number,
      canStart: true,
      waitsOn: [],
      unblocks: blocksDirect.get(e.number),
      holdsUp: downstreamAll(e.number).size,
      items: [{ done: false, text: pr ? `Merge PR #${pr.number} ${pr.title}` : "Merge the epic's PR (none open yet: the loop opens it on its next pass)" }],
    };
  });

const hitl = mergeItems.concat(issues
  .filter((i) => i.open && !has(i, "backlog") && (has(i, "ready-for-human") || has(i, "ready-for-review")))
  .map((i) => {
    const blockers = openBlockers(i);
    return {
      number: i.number,
      title: i.title,
      url: i.url,
      kind: hitlKind(i),
      assignees: i.assignees,
      epic: has(i, "epic") ? i.number : epicOf(i)?.number ?? null,
      canStart: blockers.length === 0,
      waitsOn: blockers.map((b) => ({ number: b.number, human: has(b, "ready-for-human") || has(b, "epic") })),
      unblocks: blocksDirect.get(i.number),
      holdsUp: downstreamAll(i.number).size,
      items: checklist(i.body),
    };
  }));

// Specs: an autopilot epic's plan, waiting for a person to approve it
// (the `spec-approved` label) before tickets are cut.
const isAiComment = (body) => /^> \*This was generated by AI/.test(body ?? "");
function sectionLines(body, heading) {
  const m = body.match(new RegExp("^#{2,3} " + heading + "\\s*\\n([\\s\\S]*?)(?=^#{2,3} |(?![\\s\\S]))", "m"));
  return m ? m[1].split("\n").map((l) => l.trim()).filter((l) => /^[-*] /.test(l)).map((l) => l.replace(/^[-*] /, "")) : [];
}
function decisions(body) {
  return sectionLines(body, "Decided on autopilot").map((l) => {
    const m = l.match(/^(\d+)%\s*·\s*(?:(assumed[^·]*)·\s*)?(.*)$/);
    if (m) return { pct: Number(m[1]), assumed: !!m[2], text: m[3].trim() };
    const r = l.match(/^research\s*·\s*(.*)$/i);
    return { pct: null, research: !!r, assumed: false, text: (r ? r[1] : l).trim() };
  });
}
const specs = issues.filter((i) => has(i, "spec")).map((i) => {
  const epic = epicOf(i);
  let stage;
  if (!i.open) stage = "done";
  else if (has(i, "spec-approved")) stage = "approved";
  else if (i.lastComment && !isAiComment(i.lastComment.body)) stage = "revising";
  else stage = "review";
  return {
    number: i.number,
    title: i.title,
    url: i.url,
    epic: epic?.number ?? null,
    stage,
    closedAt: i.closedAt,
    decisions: decisions(i.body),
    openForReview: sectionLines(i.body, "Open for review"),
  };
});

// Backlog: everything parked for later, of any kind. Not action items: nobody
// acts on them until a person takes one out of the backlog.
const WHAT = ["bug", "enhancement", "needs-scoping", "needs-info", "wontfix"];
const backlog = issues
  .filter((i) => i.open && has(i, "backlog"))
  .map((i) => ({
    number: i.number,
    title: i.title,
    url: i.url,
    kind: has(i, "initiative") ? "initiative" : has(i, "epic") ? "epic" : "issue",
    what: WHAT.find((w) => has(i, w)) ?? null,
    areas: i.labels.filter((l) => l.startsWith("area:")).map((l) => l.slice(5)),
    epic: epicOf(i)?.number ?? null,
    createdAt: i.createdAt,
  }));

// Test suites: each suite file, its open Run tickets, its last green run
// (the "Run <suite>" ticket closed with "Ran <suite> on <sha>"), and whether
// main moved on what it covers since: the compare of that sha with the
// default branch, filtered by the suite's globs.
const suiteRuns = issues.filter((i) => has(i, "suite-run"));
const suites = suiteFiles.present ? await Promise.all(suiteFiles.suites.map(async (s) => {
  const runs = suiteRuns.filter((r) => r.title.match(/^Run (\S+)/)?.[1] === s.name);
  const open = runs.filter((r) => r.open).sort((a, b) => a.number - b.number);
  const green = runs.filter((r) => !r.open && !r.notPlanned).sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""))[0] ?? null;
  const sha = green?.lastComment?.body.match(/\bRan \S+ on ([0-9a-f]{7,40})\b/)?.[1] ?? null;
  let since = null;
  if (sha) {
    try {
      const cmp = await rest(`repos/${REPO.owner}/${REPO.name}/compare/${sha}...${suiteFiles.branch}`);
      const touched = (cmp.files ?? []).map((f) => f.filename).filter((f) => s.covers.some((g) => matchesGlob(f, g)));
      since = { commits: cmp.total_commits ?? cmp.commits?.length ?? 0, touched: touched.slice(0, 8), touchedCount: touched.length, truncated: (cmp.files ?? []).length >= 300 };
    } catch { /* an unknown sha, or no Contents access: stale stays unknown */ }
  }
  const current = open[0];
  const state = current ? (current.assigned ? "working" : openBlockers(current).length ? "blocked" : has(current, "ready-for-human") ? "you" : "queued")
    : !green ? "never" : !since ? "unknown" : since.touchedCount ? "stale" : "fresh";
  return {
    ...s,
    state,
    open: open.map((r) => ({ number: r.number, epic: epicOf(r)?.number ?? null, blockedBy: openBlockers(r).map((b) => b.number) })),
    last: green ? { number: green.number, closedAt: green.closedAt, sha, epic: epicOf(green)?.number ?? null } : null,
    since,
    fileCmd: `gh issue create --title "Run ${s.name}" --label "suite-run,${s.runsVia === "human" ? "ready-for-human" : "ready-for-agent"}" --body "Run against ${suiteFiles.branch}: ${s.file} is stale. Green closes this; red files bugs."`,
  };
})) : null;
// A stale suite with no run on its way is something to decide on: an action item.
for (const s of suites ?? []) {
  if (s.state !== "stale") continue;
  hitl.push({
    number: 0, suite: s.name, title: `${s.name} is stale`, url: s.url, kind: "suite", assignees: [], epic: null,
    canStart: true, waitsOn: [], unblocks: [], holdsUp: 0,
    items: [{ done: false, text: `${s.since.commits} commit(s) on ${suiteFiles.branch} touched what it covers since its last run (#${s.last.number}, ${s.last.sha.slice(0, 7)}). Run it (${s.takes || "?"}, ${s.runsVia}): \`${s.fileCmd}\`` }],
  });
}

// Versions: the `version:*` label on epics (v1, v1.1, v2…), sorted numerically.
// An open epic with none, or one that waits on an epic of a later version, is
// something to fix before the roadmap reads right: an action item each.
const verParts = (v) => String(v).replace(/^v/i, "").split(".").map(Number);
const verCmp = (a, b) => { const x = verParts(a), y = verParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; } return 0; };
const versions = [...new Set(epicData.map((e) => e.version).filter(Boolean))].sort(verCmp);
const epicDataByNum = new Map(epicData.map((e) => [e.number, e]));
for (const e of epicData) {
  if (e.status === "done" || e.status === "backlog") continue;
  const item = (text) => ({ number: e.number, title: e.title, url: e.url, kind: "version", assignees: byNumber.get(e.number)?.assignees ?? [], epic: e.number, canStart: true, waitsOn: [], unblocks: [], holdsUp: 0, items: [{ done: false, text }] });
  if (!e.version) hitl.push(item(`No version: label it, e.g. \`gh issue edit ${e.number} --add-label version:${versions[0] ?? "v1"}\``));
  for (const b of e.blockedBy.map((n) => epicDataByNum.get(n)).filter((b) => b && e.version && b.version && verCmp(b.version, e.version) > 0))
    hitl.push(item(`Waits on #${b.number} (${b.version}), a later version than its own (${e.version}): move one of the two, or drop the dependency`));
}

const data = {
  generatedAt: new Date().toISOString(),
  repo: `${REPO.owner}/${REPO.name}`,
  branch: suiteFiles.branch,
  versions,
  epics: epicData,
  tickets,
  hitl,
  backlog,
  specs,
  suites,
  titles: Object.fromEntries(issues.map((i) => [i.number, i.title])),
  urls: Object.fromEntries(issues.map((i) => [i.number, i.url])),
  epicStatus: EPIC_STATUS,
  manualStatus: MANUAL_STATUS,
  ticketStatus: TICKET_STATUS,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${REPO.name} tracker</title>
<style>
:root {
  --bg: #f7f7f5; --surface: #ffffff; --surface-2: #f0f0ec; --border: #e2e2dc;
  --text: #1c1c1a; --muted: #6b6b66; --link: #2c5fb3;
  --you: #c62a1f; --you-soft: #fdeceb;
  --review: #c62a1f; --review-soft: #fdeceb;
  --working: #2c5fb3; --working-soft: #e8effa;
  --queued: #7a3fb8; --queued-soft: #f3ecfb;
  --blocked: #7a7a73; --blocked-soft: #efefea;
  --done: #1f7a4d; --done-soft: #e5f4ec;
  --triage: #a36200; --triage-soft: #fbf1de;
  --backlog: #7a7a73; --backlog-soft: #ecece7;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161615; --surface: #1f1f1d; --surface-2: #2a2a27; --border: #34342f;
    --text: #ecece8; --muted: #9b9b94; --link: #8db4f2;
    --you: #ff6b61; --you-soft: #3d1a17;
    --review: #ff6b61; --review-soft: #3d1a17;
    --working: #8db4f2; --working-soft: #1b2638;
    --queued: #c99ae8; --queued-soft: #2f2238;
    --blocked: #9b9b94; --blocked-soft: #2a2a27;
    --done: #6fcf9b; --done-soft: #17301f;
    --triage: #e8a53e; --triage-soft: #36280f;
    --backlog: #8a8a83; --backlog-soft: #2a2a27;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 28px 16px 64px; }
header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 16px; margin-bottom: 20px; }
h1 { font-size: 22px; margin: 0; letter-spacing: -0.01em; }
h2 { font-size: 17px; margin: 36px 0 12px; }
h3 { font-size: 14px; margin: 0 0 8px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.meta { color: var(--muted); font-size: 13px; }
code { font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }
nav.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); margin-bottom: 4px; overflow-x: auto; }
nav.tabs button { background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 12px; font: inherit; color: var(--muted); cursor: pointer; white-space: nowrap; }
nav.tabs button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--text); font-weight: 600; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 20px 0 8px; }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; cursor: pointer; text-align: left; font: inherit; color: inherit; }
.stat b { display: block; font-size: 26px; line-height: 1.1; font-variant-numeric: tabular-nums; }
.stat span { color: var(--muted); font-size: 13px; }
.stat.you b { color: var(--you); } .stat.working b { color: var(--working); } .stat.queued b { color: var(--queued); } .stat.review b { color: var(--review); }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
@media (max-width: 780px) { .cols { grid-template-columns: 1fr; } }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; }
.card .top { display: flex; gap: 8px; align-items: baseline; }
.card .num { color: var(--muted); font-variant-numeric: tabular-nums; font-size: 13px; min-width: 38px; }
.card .title { font-weight: 550; }
.card .sub { color: var(--muted); font-size: 13px; margin-top: 4px; padding-left: 46px; }
.card .sub a { color: inherit; text-decoration: underline; text-decoration-color: var(--border); }
.pill { display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
${Object.keys(TICKET_STATUS).map((s) => `.pill.${s} { color: var(--${s === "dropped" ? "done" : s}); background: var(--${s === "dropped" ? "done" : s}-soft); }`).join("\n")}
.empty { color: var(--muted); font-size: 14px; padding: 12px 0; }
table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: top; font-size: 14px; }
th { font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; background: var(--surface-2); }
tr:last-child td { border-bottom: 0; }
.bar { height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; min-width: 90px; margin-top: 6px; }
.bar i { display: block; height: 100%; background: var(--done); }
.table-scroll { overflow-x: auto; }
.diagram { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; overflow-x: auto; }
.diagram svg { max-width: none !important; }
.legend { margin: 10px 0 0; }
.board { display: grid; grid-template-columns: repeat(6, minmax(180px, 1fr)); gap: 12px; overflow-x: auto; }
@media (max-width: 1100px) { .board { grid-template-columns: repeat(6, 220px); } }
.lane { background: var(--surface-2); border-radius: 10px; padding: 10px; }
.lane h3 { display: flex; justify-content: space-between; }
.lane .card { padding: 10px; }
.lane .card .sub { padding-left: 0; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 4px 0 14px; }
select { font: inherit; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
section[hidden] { display: none; }
nav.tabs .badge { display: inline-block; margin-left: 6px; min-width: 18px; padding: 0 6px; border-radius: 999px; font-size: 12px; font-weight: 700; color: #fff; background: var(--you); }
.spec { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--you); border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
.spec .top { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: baseline; }
.spec .top .title { font-weight: 650; font-size: 16px; flex: 1 1 300px; }
.spec .meta { margin-top: 4px; }
.spec h4 { margin: 14px 0 6px; font-size: 13px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
.spec ol, .spec ul { margin: 0; padding-left: 0; list-style: none; }
.spec li { display: flex; gap: 10px; align-items: baseline; padding: 5px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.spec li:last-child { border-bottom: 0; }
.conf { flex: 0 0 auto; font-size: 12px; font-weight: 700; padding: 1px 7px; border-radius: 999px; font-variant-numeric: tabular-nums; color: var(--done); background: var(--done-soft); }
.conf.low { color: var(--you); background: var(--you-soft); }
.conf.na { color: var(--muted); background: var(--surface-2); }
.tag { flex: 0 0 auto; font-size: 11px; font-weight: 600; color: var(--triage); border: 1px solid var(--triage); border-radius: 4px; padding: 0 5px; }
.approve { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 14px; }
.approve code { font-size: 12.5px; }
button.copy { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); cursor: pointer; }
.spec.revising { border-left-color: var(--queued); }
.spec.approved { border-left-color: var(--done); }
.spec.done { border-left-color: var(--blocked); }
details.spec > summary { cursor: pointer; }
details.spec > .spec { border: 0; padding: 0; margin: 10px 0 0; }
.rm-scroll { overflow-x: auto; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; }
.rm { position: relative; display: flex; gap: 64px; align-items: flex-start; padding: 16px; width: max-content; }
.rm svg.lines { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 2; overflow: visible; }
.rm svg.lines .halo { fill: none; stroke: var(--surface-2); stroke-width: 6; stroke-linecap: round; }
.rm svg.lines .link { fill: none; stroke: var(--text); stroke-width: 2; opacity: .6; }
.rm svg.lines .link.met { stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 5 4; opacity: .5; }
.rm svg.lines .dot { fill: var(--text); opacity: .6; }
.rm svg.lines .dot.met { fill: var(--muted); opacity: .5; }
.rm.focus svg.lines g { opacity: .12; }
.rm.focus svg.lines g.hot { opacity: 1; }
.rm.focus svg.lines g.hot .link { stroke: var(--link); opacity: 1; stroke-width: 2.5; }
.rm.focus svg.lines g.hot .dot, .rm svg.lines .dot.hot { fill: var(--link); opacity: 1; }
.rm.focus .ep:not(.hot) { opacity: .4; }
.rm .ep { transition: opacity .12s; }
.rm-col { display: flex; flex-direction: column; gap: 16px; width: 290px; position: relative; z-index: 1; }
.rm-step { font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.ep { background: var(--surface); border: 1px solid var(--border); border-top: 4px solid var(--c); border-radius: 10px; padding: 10px 12px; }
.ep .ep-title { font-weight: 650; display: flex; gap: 6px; align-items: baseline; }
.ep .ep-title a.n { color: var(--muted); font-weight: 500; font-size: 13px; }
.ep .ep-status { display: inline-block; margin-top: 6px; font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; color: var(--c); background: var(--cs); }
.ep .ep-meta { font-size: 12.5px; color: var(--muted); margin-top: 6px; }
.ep .bar { margin-top: 6px; }
.ep .chips { display: flex; flex-direction: column; gap: 3px; margin-top: 10px; }
.chip { display: flex; gap: 6px; align-items: baseline; font-size: 12.5px; line-height: 1.35; padding: 3px 7px; border-radius: 6px; color: var(--text); background: var(--ks); border-left: 3px solid var(--k); }
.chip:hover { text-decoration: none; filter: brightness(.97); }
.chip .cn { color: var(--muted); font-variant-numeric: tabular-nums; flex: 0 0 auto; }
.chip .ct { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip.done { background: var(--done-soft); border-left-color: var(--done); }
.chip.done .ct { text-decoration: line-through; color: var(--muted); }
.ep .unplanned { font-size: 12.5px; color: var(--muted); margin-top: 8px; font-style: italic; }
/* Red means you: a ticket or epic waiting on you is filled red, never just tinted. */
.chip.you, .chip.review { background: var(--you); border-left-color: var(--you); color: #fff; font-weight: 600; }
.chip.you .cn, .chip.review .cn { color: #fff; opacity: .85; }
.chip .you-tag { flex: 0 0 auto; font-size: 10.5px; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; padding: 0 5px; border-radius: 4px; background: #fff; color: var(--you); }
.ep.needs-you { border-color: var(--you); box-shadow: 0 0 0 1.5px var(--you); }
.ep.yours .ep-status { color: #fff; background: var(--you); }
.ep.stub { --c: var(--blocked); border-style: dashed; border-top-width: 1px; padding: 8px 10px; opacity: .9; }
.ep.stub .ep-title { font-weight: 500; font-size: 14px; }
.ep.stub.later { border-color: var(--triage); }
.ep.stub.later .ep-meta { color: var(--triage); font-weight: 600; }
.ep .warn { color: var(--triage); font-weight: 700; }
.rm-banner { background: var(--triage-soft); border: 1px solid var(--triage); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; font-size: 14px; }
.rm-banner div + div { margin-top: 6px; }
details.strip { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--c); border-radius: 8px; padding: 6px 12px; margin-bottom: 8px; }
details.strip summary { cursor: pointer; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; font-size: 14px; }
details.strip summary .what { display: none; }
details.strip[open] summary .what { display: inline; }
details.strip .needs { color: var(--you); }
.chips.row { flex-direction: row; flex-wrap: wrap; gap: 6px; margin: 8px 0 4px; }
.chips.row .chip { max-width: 320px; }
.rm svg.lines .link { stroke-linejoin: round; }
.rm svg.lines .via { fill: var(--surface-2); stroke: var(--text); stroke-width: 2; opacity: .6; }
.rm svg.lines .via.met { stroke: var(--muted); opacity: .5; }
.rm.focus svg.lines g.hot .via { stroke: var(--link); opacity: 1; }
.pill.version { color: var(--triage); background: var(--triage-soft); }
details.ep.done-ep { border: 1px solid var(--done); border-left: 5px solid var(--done); background: var(--done-soft); padding: 6px 12px; }
details.ep.done-ep > summary { cursor: pointer; list-style: none; display: flex; gap: 6px; align-items: baseline; font-weight: 600; color: var(--text); }
details.ep.done-ep > summary::-webkit-details-marker { display: none; }
details.ep.done-ep > summary::before { content: "▸"; font-size: 11px; }
details.ep.done-ep[open] > summary::before { content: "▾"; }
details.ep.done-ep > summary .ok { margin-left: auto; font-size: 12px; font-weight: 700; white-space: nowrap; color: var(--done); }
.keys { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 12px; }
.key .key-title { grid-column: 1 / -1; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.key { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 6px 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 13px; color: var(--text); }
.key .row { display: flex; gap: 8px; align-items: baseline; }
.key .sw { flex: 0 0 auto; min-width: 70px; text-align: center; font-size: 11.5px; font-weight: 700; padding: 1px 6px; border-radius: 5px; color: var(--text); background: var(--ks); border-left: 3px solid var(--k); }
.key .sw.you { background: var(--you); color: #fff; border-left-color: var(--you); }
.key .row span.what { color: var(--muted); }
.key .how { grid-column: 1 / -1; color: var(--muted); border-top: 1px solid var(--border); padding-top: 6px; margin-top: 2px; }
.lane.you h3 { color: var(--you); }
.lane.you .card { border: 1px solid var(--you); border-left: 5px solid var(--you); background: var(--you-soft); }
.person { margin-top: 28px; }
.person > h2 { margin: 0 0 4px; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
.person > h2 .meta { font-weight: 400; }
.group-label { font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; margin: 16px 0 8px; }
.hitl { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--you); border-radius: 10px; padding: 12px 14px; margin-bottom: 10px; }
.hitl.waiting { border-left-color: var(--blocked); }
.hitl.waiting .title { color: var(--muted); }
.hitl .top { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.hitl .num { color: var(--muted); font-size: 13px; min-width: 38px; }
.hitl .title { font-weight: 600; flex: 1 1 260px; }
.hitl .holds { font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; white-space: nowrap; color: var(--muted); border: 1px solid var(--border); }
.hitl .holds.high { color: var(--triage); border-color: var(--triage); background: var(--triage-soft); }
.hitl .count { color: var(--muted); font-size: 13px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.hitl .sub { color: var(--muted); font-size: 13px; margin: 2px 0 0 46px; }
.hitl ul { list-style: none; margin: 10px 0 0 46px; padding: 0; }
.hitl li { display: flex; gap: 8px; font-size: 14px; padding: 3px 0; }
.hitl li::before { content: ""; flex: 0 0 14px; height: 14px; margin-top: 3px; border: 1.5px solid var(--muted); border-radius: 3px; }
.hitl li.done { color: var(--muted); text-decoration: line-through; }
.hitl li.done::before { background: var(--done); border-color: var(--done); }
.hitl details summary { margin: 8px 0 0 46px; font-size: 13px; color: var(--link); cursor: pointer; }
.hitl .noitems { margin: 8px 0 0 46px; font-size: 13px; color: var(--muted); }
@media (max-width: 600px) { .hitl .sub, .hitl ul, .hitl .noitems, .hitl details summary { margin-left: 0; } }
.pill.task { color: var(--you); background: var(--you-soft); }
.pill.backlog { color: var(--backlog); background: var(--backlog-soft); }
.pill.brief, .pill.spec { color: var(--queued); background: var(--queued-soft); }
.pill.merge { color: var(--you); background: var(--you-soft); }
.pill.manual { color: var(--you); background: transparent; border: 1px solid var(--you); padding-top: 0; padding-bottom: 0; }
.pill.area { color: var(--muted); background: transparent; border: 1px solid var(--border); padding-top: 0; padding-bottom: 0; font-weight: 500; }
.pill.suite, .pill.stale { color: var(--triage); background: var(--triage-soft); }
.pill.fresh { color: var(--done); background: var(--done-soft); }
.pill.never, .pill.unknown { color: var(--blocked); background: var(--blocked-soft); }
.suite-card { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; margin: 10px 0; }
.suite-card.stale { border-color: var(--triage); }
.suite-card .top { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.suite-card .top .title { font-weight: 600; }
.suite-card .about { color: var(--muted); margin: 6px 0; }
.suite-card .facts { display: flex; gap: 14px; flex-wrap: wrap; font-size: 14px; color: var(--muted); }
.suite-card .run { margin-top: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.suite-card .run code { font-size: 12px; }
label.check { display: inline-flex; gap: 6px; align-items: center; font-size: 14px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${REPO.name} tracker</h1>
    <div class="meta">Snapshot of <a href="https://github.com/${REPO.owner}/${REPO.name}/issues">${REPO.owner}/${REPO.name}</a> at <span id="when"></span> · rebuilt by the agent loop every pass, or by hand with <code>node tracker/build.mjs</code></div>
  </header>

  <nav class="tabs" role="tablist">
    <button role="tab" data-tab="roadmap" aria-selected="true">Roadmap</button>
    <button role="tab" data-tab="actions" aria-selected="false">Action items</button>
    <button role="tab" data-tab="specs" aria-selected="false">Specs to validate<span id="spec-count"></span></button>
    <button role="tab" data-tab="epic" aria-selected="false">Epic board</button>
    <button role="tab" data-tab="backlog" aria-selected="false">Backlog<span id="backlog-count"></span></button>
    ${data.suites ? '<button role="tab" data-tab="suites" aria-selected="false">Test suites<span id="suites-count"></span></button>' : ""}
  </nav>

  <section id="suites" hidden>
    <p class="meta" style="margin-top:20px">The slow suites in <code>test-suites/</code> don't run on every PR: an epic that touches what a suite covers gets a <b>Run</b> ticket, and a suite is <b>stale</b> when commits to <code>${suiteFiles.branch.replace(/[<>&"]/g, "")}</code> touched what it covers since its last green run. File a run against it with the command on its card.</p>
    <div id="suites-body"></div>
  </section>

  <section id="actions" hidden>
    <div class="filters" style="margin-top:20px">
      <label for="who">Assignee</label> <select id="who"></select>
      <label class="check"><input type="checkbox" id="show-waiting" checked> Show items still waiting on something</label>
    </div>
    <div class="stats" id="stats"></div>
    <div id="people"></div>
  </section>

  <section id="specs" hidden>
    <p class="meta" style="margin-top:20px">An autopilot epic's plan stops here until you validate it. Approve a spec by adding the <code>spec-approved</code> label (the loop then cuts its tickets), or comment on the spec what to change (the loop revises it and asks again).</p>
    <div id="specs-body"></div>
  </section>

  <section id="roadmap">
    <h2>Roadmap</h2>
    <div class="filters">
      <label for="rm-version">Version</label> <select id="rm-version"></select>
      <label class="check"><input type="checkbox" id="rm-tickets" checked> Show tickets inside planned epics</label>
      <label class="check"><input type="checkbox" id="rm-hide-done"> Hide done tickets</label>
    </div>
    <div class="legend" id="roadmap-legend" style="margin-bottom:12px"></div>
    <div id="rm-banner"></div>
    <div id="rm-outside"></div>
    <div class="rm-scroll"><div class="rm" id="rm"></div></div>
    <h2>Progress</h2>
    <div class="table-scroll"><table id="epic-table"></table></div>
  </section>

  <section id="backlog" hidden>
    <p class="meta" style="margin-top:20px">Parked for later: no triage, no agent, no planning, and not in your action items. To bring one back, remove the <code>backlog</code> label and give it a <b>who</b> label (or <code>needs-triage</code> to send it through triage again).</p>
    <div id="backlog-body"></div>
  </section>

  <section id="epic" hidden>
    <div class="filters" style="margin-top:20px">
      <label for="epic-pick">Epic</label> <select id="epic-pick"></select>
      <span class="meta" id="epic-summary"></span>
    </div>
    <div class="board" id="board"></div>
    <h2>What blocks what</h2>
    <div class="diagram"><pre class="mermaid" id="epic-graph"></pre></div>
    <div class="legend" id="epic-legend"></div>
  </section>
</div>

<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
<script>
const DATA = ${JSON.stringify(data).replace(/</g, "\\u003c")};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ref = (n) => '<a href="' + DATA.urls[n] + '" target="_blank">#' + n + '</a>';
const refTitle = (n) => ref(n) + ' ' + esc(DATA.titles[n] ?? '');
const epicByNum = Object.fromEntries(DATA.epics.map((e) => [e.number, e]));
const ticketByNum = Object.fromEntries(DATA.tickets.map((t) => [t.number, t]));
const epicName = (n) => n && epicByNum[n] ? epicByNum[n].title : 'No epic';
const pill = (s) => '<span class="pill ' + s + '">' + DATA.ticketStatus[s] + '</span>';
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

$('when').textContent = new Date(DATA.generatedAt).toLocaleString();

// Tabs, remembered per viewer
const tabs = [...document.querySelectorAll('nav.tabs button')];
function showTab(name) {
  tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  ['actions', 'specs', 'roadmap', 'epic', 'backlog', 'suites'].forEach((id) => { $(id).hidden = id !== name; });
  try { localStorage.setItem('tracker-tab', name); } catch {}
  renderDiagrams();
}
tabs.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

function card(t, extra) {
  return '<div class="card"><div class="top"><span class="num">' + ref(t.number) + '</span><span class="title">' + esc(t.title) + '</span></div>' +
    '<div class="sub">' + esc(epicName(t.epic)) + (extra ? ' · ' + extra : '') + '</div></div>';
}

// ---- Action items (HITL, by assignee)
const KIND = { task: 'Task', review: 'Review', brief: 'Epic brief', spec: 'Spec approval', merge: 'Merge the epic', suite: 'Stale suite', version: 'Version' };
function md(text) {
  return esc(text)
    .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
    .replace(/\\*\\*([^*]+)\\*\\*/g, '<b>$1</b>')
    .replace(/\\[([^\\]]+)\\]\\((https?:[^)\\s]+)\\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/(^|[\\s(])#(\\d+)\\b/g, (m, pre, n) => pre + (DATA.urls[n] ? ref(Number(n)) : '#' + n));
}
const people = [...new Set(DATA.hitl.flatMap((h) => h.assignees.length ? h.assignees : ['(unassigned)']))].sort();
$('who').innerHTML = '<option value="">Everyone</option>' + people.map((p) => '<option>' + esc(p) + '</option>').join('');
try { const w = localStorage.getItem('tracker-who'); if (w && people.includes(w)) $('who').value = w; } catch {}
try { if (localStorage.getItem('tracker-waiting') === '0') $('show-waiting').checked = false; } catch {}

const list = (h) => '<ul>' + h.items.map((i) => '<li class="' + (i.done ? 'done' : '') + '"><span>' + md(i.text) + '</span></li>').join('') + '</ul>';
function hitlCard(h) {
  const open = h.items.filter((i) => !i.done).length;
  const sub = [esc(epicName(h.epic))];
  if (h.unblocks.length) sub.push('unblocks ' + h.unblocks.map(ref).join(', '));
  if (!h.canStart) sub.push('waits on ' + h.waitsOn.map((w) => ref(w.number) + (w.human ? ' (person)' : ' (agent)')).join(', '));
  const num = h.suite ? '<a href="' + h.url + '" target="_blank">test-suites/' + esc(h.suite) + '.md</a>' : ref(h.number);
  return '<div class="hitl' + (h.canStart ? '' : ' waiting') + '"><div class="top"><span class="num">' + num + '</span>' +
    '<span class="title">' + esc(h.title) + '</span>' +
    (h.holdsUp ? '<span class="holds' + (h.holdsUp >= 5 ? ' high' : '') + '" title="Open issues and epics that wait on this, directly or down the chain">holds up ' + h.holdsUp + '</span>' : '') +
    '<span class="pill ' + h.kind + '">' + KIND[h.kind] + '</span>' +
    (h.items.length ? '<span class="count">' + (h.items.length - open) + ' of ' + h.items.length + ' done</span>' : '') + '</div>' +
    '<div class="sub">' + sub.join(' · ') + '</div>' +
    (h.items.length ? (h.canStart ? list(h) : '<details><summary>Show the checklist</summary>' + list(h) + '</details>')
      : '<div class="noitems">No checklist in the issue; open it for details.</div>') + '</div>';
}
function renderActions() {
  const who = $('who').value;
  const showWaiting = $('show-waiting').checked;
  try { localStorage.setItem('tracker-who', who); localStorage.setItem('tracker-waiting', showWaiting ? '1' : '0'); } catch {}
  const mine = DATA.hitl.filter((h) => !who || (who === '(unassigned)' ? !h.assignees.length : h.assignees.includes(who)));
  const now = mine.filter((h) => h.canStart), later = mine.filter((h) => !h.canStart);
  const openItems = (list) => list.reduce((n, h) => n + h.items.filter((i) => !i.done).length, 0);
  $('stats').innerHTML = [
    ['you', now.length, 'can do now'],
    ['you', openItems(now), 'open checklist items now'],
    ['blocked', later.length, 'waiting on something'],
  ].map(([k, n, label]) => '<div class="stat ' + k + '"><b>' + n + '</b><span>' + label + '</span></div>').join('');
  // Most urgent first: what holds up the most open issues, directly or down the chain.
  const order = (a, b) => b.holdsUp - a.holdsUp || b.unblocks.length - a.unblocks.length || a.number - b.number;
  const groups = (who ? [who] : people).map((p) => {
    const list = mine.filter((h) => p === '(unassigned)' ? !h.assignees.length : h.assignees.includes(p));
    const n = list.filter((h) => h.canStart).sort(order), l = list.filter((h) => !h.canStart).sort(order);
    if (!n.length && !(showWaiting && l.length)) return '';
    return '<div class="person"><h2>' + esc(p.startsWith('(') ? p : '@' + p) + '<span class="meta">' + n.length + ' to do now · ' + l.length + ' waiting</span></h2>' +
      '<div class="group-label">Do now · most blocking first</div>' + (n.map(hitlCard).join('') || '<div class="empty">Nothing you can start right now.</div>') +
      (showWaiting && l.length ? '<div class="group-label">Waiting</div>' + l.map(hitlCard).join('') : '') + '</div>';
  }).join('');
  $('people').innerHTML = groups || '<div class="empty">No action items.</div>';
}
$('who').addEventListener('change', renderActions);
$('show-waiting').addEventListener('change', renderActions);
renderActions();

// ---- Specs to validate
function specCard(sp) {
  const e = epicByNum[sp.epic];
  const low = sp.decisions.filter((d) => d.pct !== null && d.pct < 75).length;
  const assumed = sp.decisions.filter((d) => d.assumed).length;
  const stageText = { review: 'Waiting for your approval', revising: 'Agent is revising your changes', approved: 'Approved; tickets being cut', done: 'Validated' }[sp.stage];
  const cmd = 'gh issue edit ' + sp.number + ' --add-label spec-approved';
  return '<div class="spec ' + sp.stage + '"><div class="top"><span class="title">' + (e ? esc(e.title) : esc(sp.title)) + '</span>' +
    '<span class="pill ' + (sp.stage === 'review' ? 'you' : sp.stage === 'approved' ? 'done' : 'queued') + '">' + stageText + '</span></div>' +
    '<div class="meta">Spec ' + ref(sp.number) + (e ? ' · epic ' + ref(e.number) : '') + ' · ' + sp.decisions.length + ' decisions taken on autopilot' +
    (low ? ' · <b>' + low + ' below 75%</b>' : '') + (assumed ? ' · ' + assumed + ' assumed' : '') + '</div>' +
    (sp.openForReview.length ? '<h4>Flagged for your review</h4><ul>' + sp.openForReview.map((l) => '<li><span>' + md(l) + '</span></li>').join('') + '</ul>' : '') +
    (sp.decisions.length ? '<h4>Decisions to check, least confident first</h4><ol>' + sp.decisions.map((d) =>
      '<li><span class="conf' + (d.pct === null ? ' na' : d.pct < 75 ? ' low' : '') + '">' + (d.pct !== null ? d.pct + '%' : d.research ? 'research' : '?') + '</span>' +
      (d.assumed ? '<span class="tag">assumed</span>' : '') + '<span>' + md(d.text) + '</span></li>').join('') + '</ol>' : '') +
    (sp.stage === 'review' ? '<div class="approve"><span>Looks right?</span> <code>' + esc(cmd) + '</code> <button class="copy" data-cmd="' + esc(cmd) + '">Copy</button>' +
      '<span class="meta">or <a href="' + sp.url + '#issue-comment-box" target="_blank">comment what to change</a></span></div>' : '') + '</div>';
}
function renderSpecs() {
  const by = (st) => DATA.specs.filter((sp) => sp.stage === st);
  const review = by('review'), revising = by('revising'), approved = by('approved');
  const done = by('done').sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
  $('spec-count').innerHTML = review.length ? '<span class="badge">' + review.length + '</span>' : '';
  const next = DATA.epics.filter((e) => e.status === 'planning' || e.status === 'ready');
  let html = '<h2>Waiting for your approval</h2>' + (review.map(specCard).join('') ||
    '<div class="empty">No spec waits for you. ' + (next.length ? 'Being planned now: ' + next.map((e) => ref(e.number) + ' ' + esc(e.title)).join(', ') + '.' :
      'The loop only plans an epic once the epics before it are done, so the next spec arrives after ' + DATA.epics.filter((e) => e.status === 'building').map((e) => ref(e.number) + ' ' + esc(e.title)).join(', ') + ' closes.') + '</div>');
  if (revising.length) html += '<h2>Agent revising your changes</h2>' + revising.map(specCard).join('');
  if (approved.length) html += '<h2>Approved, tickets being cut</h2>' + approved.map(specCard).join('');
  if (done.length) html += '<h2>Validated</h2>' + done.map((sp) => '<details class="spec done"><summary>' + esc(epicByNum[sp.epic]?.title ?? sp.title) + ' · spec ' + ref(sp.number) +
    (sp.closedAt ? ' · ' + new Date(sp.closedAt).toLocaleDateString() : '') + '</summary>' + specCard(sp) + '</details>').join('');
  $('specs-body').innerHTML = html;
  document.querySelectorAll('button.copy').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.cmd); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy it'; }
  }));
}
renderSpecs();

// ---- Backlog
function renderBacklog() {
  const list = DATA.backlog;
  $('backlog-count').innerHTML = list.length ? ' <span class="meta">' + list.length + '</span>' : '';
  const groups = [['initiative', 'Initiatives'], ['epic', 'Epics'], ['issue', 'Issues']];
  let html = '';
  for (const [kind, label] of groups) {
    const rows = list.filter((b) => b.kind === kind).sort((a, b) => a.number - b.number);
    if (!rows.length) continue;
    html += '<h2>' + label + ' <span class="meta">' + rows.length + '</span></h2><div class="table-scroll"><table><tr><th>Issue</th><th>What</th><th>Area</th>' +
      (kind === 'issue' ? '<th>Epic</th>' : '') + '<th>Opened</th></tr>' +
      rows.map((b) => '<tr><td>' + ref(b.number) + ' ' + esc(b.title) + '</td><td>' + (b.what ? '<span class="pill backlog">' + esc(b.what) + '</span>' : '<span class="meta">—</span>') +
        '</td><td>' + (b.areas.length ? esc(b.areas.join(', ')) : '<span class="meta">—</span>') + '</td>' +
        (kind === 'issue' ? '<td>' + (b.epic ? ref(b.epic) + ' ' + esc(epicName(b.epic)) : '<span class="meta">—</span>') + '</td>' : '') +
        '<td class="meta">' + new Date(b.createdAt).toLocaleDateString() + '</td></tr>').join('') + '</table></div>';
  }
  $('backlog-body').innerHTML = html || '<div class="empty">Nothing is parked. Add the <code>backlog</code> label to an issue to park it here.</div>';
}
renderBacklog();

// ---- Test suites
const SUITE_STATE = { working: 'Agent running it', queued: 'Run queued', blocked: 'Red: waits on its bugs', you: 'Your run', stale: 'Stale', fresh: 'Fresh', never: 'Never run', unknown: 'Last run unknown' };
const SUITE_PILL = { working: 'working', queued: 'queued', blocked: 'blocked', you: 'you', stale: 'stale', fresh: 'fresh', never: 'never', unknown: 'unknown' };
function suiteCard(s) {
  const run = s.open[0];
  const last = s.last ? 'last green run ' + ref(s.last.number) + (s.last.epic ? ' (' + esc(epicName(s.last.epic)) + ')' : '') + ' on ' + new Date(s.last.closedAt).toLocaleDateString() + (s.last.sha ? ' at <code>' + s.last.sha.slice(0, 7) + '</code>' : '') : 'no green run yet';
  const since = s.since ? (s.since.touchedCount ? s.since.touchedCount + ' covered file(s) changed in ' + s.since.commits + ' commit(s) since' + (s.since.truncated ? ' (compare truncated)' : '') : s.since.commits + ' commit(s) since, none on what it covers') : (s.last && !s.last.sha ? 'the closing comment names no commit' : '');
  return '<div class="suite-card ' + s.state + '"><div class="top"><a class="title" href="' + s.url + '" target="_blank">' + esc(s.name) + '</a>' +
    '<span class="pill ' + SUITE_PILL[s.state] + '">' + SUITE_STATE[s.state] + '</span>' +
    (run ? '<span class="meta">' + ref(run.number) + (run.epic ? ' in ' + esc(epicName(run.epic)) : ' against ' + esc(DATA.branch)) + (run.blockedBy.length ? ', blocked by ' + run.blockedBy.map(ref).join(', ') : '') + '</span>' : '') + '</div>' +
    (s.about ? '<div class="about">' + md(s.about) + '</div>' : '') +
    '<div class="facts"><span>takes ' + esc(s.takes || '?') + '</span><span>runs via ' + esc(s.runsVia) + '</span><span>covers ' + s.covers.map((c) => '<code>' + esc(c) + '</code>').join(' ') + '</span></div>' +
    '<div class="facts" style="margin-top:6px"><span>' + last + '</span>' + (since ? '<span>' + since + '</span>' : '') + '</div>' +
    (s.since && s.since.touched.length ? '<details><summary class="meta">Changed files it covers</summary><ul>' + s.since.touched.map((f) => '<li><code>' + esc(f) + '</code></li>').join('') + (s.since.touchedCount > s.since.touched.length ? '<li class="meta">and ' + (s.since.touchedCount - s.since.touched.length) + ' more</li>' : '') + '</ul></details>' : '') +
    (!run ? '<div class="run"><span class="meta">File a run against ' + esc(DATA.branch) + ':</span> <code>' + esc(s.fileCmd) + '</code> <button class="copy" data-cmd="' + esc(s.fileCmd) + '">Copy</button></div>' : '') + '</div>';
}
function renderSuites() {
  if (!DATA.suites) return;
  const stale = DATA.suites.filter((s) => s.state === 'stale').length;
  $('suites-count').innerHTML = stale ? '<span class="badge">' + stale + '</span>' : '';
  const order = ['stale', 'blocked', 'you', 'working', 'queued', 'unknown', 'never', 'fresh'];
  const list = [...DATA.suites].sort((a, b) => order.indexOf(a.state) - order.indexOf(b.state) || a.name.localeCompare(b.name));
  $('suites-body').innerHTML = list.map(suiteCard).join('') || '<div class="empty">No suite files in <code>test-suites/</code> yet. Add one per slow suite (see its README).</div>';
  document.querySelectorAll('#suites button.copy').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.cmd); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy it'; }
  }));
}
renderSuites();

// ---- Roadmap
const EPIC_COLORS = { done: 'done', brief: 'you', spec: 'you', merge: 'you', held: 'blocked', waiting: 'blocked', planning: 'queued', building: 'working', ready: 'queued', backlog: 'backlog' };
// A manual epic's colour and wording say it's the person's: nothing on it is the agent's turn.
const MANUAL_COLORS = { planning: 'you', building: 'you', ready: 'you' };
const epicColor = (e) => (e.manual && MANUAL_COLORS[e.status]) || EPIC_COLORS[e.status];
const epicStatusText = (e) => (e.manual && DATA.manualStatus[e.status]) || DATA.epicStatus[e.status];
const manualPill = (e) => e.manual ? ' <span class="pill manual" title="Planned and built by you; the agent loop never touches this epic or its tickets">manual</span>' : '';
// The epic's area: a loop started with --area=<it> builds this epic and nothing outside its areas.
const areaPill = (e) => e.area ? ' <span class="pill area" title="Area ' + esc(e.area) + ': npm run agents -- --area=' + esc(e.area.split(':')[0]) + ' runs a loop for this area only">' + esc(e.area) + '</span>' : '';
// The epic's version (its version:* label); red-ish when it has none, since the roadmap can't place it.
const versionPill = (e) => e.version ? ' <span class="pill area" title="Version ' + esc(e.version) + '">' + esc(e.version) + '</span>' : ' <span class="pill version" title="No version label: add version:v1 (or the right one) so the roadmap can place it">no version</span>';
// Progress, every version at once, grouped: each version in order, then the epics still to label.
{
  const groups = DATA.versions.map((v) => [v, DATA.epics.filter((e) => e.version === v)]).concat(DATA.epics.some((e) => !e.version) ? [['No version', DATA.epics.filter((e) => !e.version)]] : []);
  $('epic-table').innerHTML = '<tr><th>Epic</th><th>Status</th><th>Tickets</th><th>Waits on</th></tr>' + groups.map(([name, list]) =>
    (groups.length > 1 ? '<tr><th colspan="4" class="group">' + esc(name) + ' <span class="meta">' + list.filter((e) => e.status === 'done').length + ' of ' + list.length + ' epics done</span></th></tr>' : '') +
    list.map((e) => {
      const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
      const counts = e.total ? Object.entries(e.counts).filter(([s, n]) => n && s !== 'done' && s !== 'dropped').map(([s, n]) => n + ' ' + DATA.ticketStatus[s].toLowerCase()).join(' · ') : '';
      return '<tr><td>' + ref(e.number) + ' ' + esc(e.title) + areaPill(e) + manualPill(e) + (e.version ? '' : versionPill(e)) + '</td>' +
        '<td><span class="pill ' + epicColor(e) + '">' + esc(epicStatusText(e)) + '</span></td>' +
        '<td>' + (e.total ? e.done + ' / ' + e.total + ' done<div class="bar"><i style="width:' + pct + '%"></i></div><div class="meta">' + counts + '</div>' : '<span class="meta">not planned yet</span>') + '</td>' +
        '<td>' + (e.openBlockers.map((n) => ref(n) + (epicByNum[n] && e.version && epicByNum[n].version && verCmp(epicByNum[n].version, e.version) > 0 ? ' <span class="warn">' + esc(epicByNum[n].version) + '!</span>' : '')).join(', ') || '<span class="meta">nothing</span>') + '</td></tr>';
    }).join('')).join('');
}

// ---- Diagrams (mermaid, drawn lazily when their tab is visible)
const label = (s) => s.replace(/"/g, "'").replace(/[<>]/g, '').slice(0, 42) + (s.length > 42 ? '…' : '');
function classDefs() {
  return ['you', 'review', 'working', 'queued', 'blocked', 'done', 'triage'].map((s) => s === 'you' || s === 'review'
    ? 'classDef ' + s + ' fill:' + css('--you') + ',stroke:' + css('--you') + ',color:#fff,stroke-width:2px,font-weight:bold'
    : 'classDef ' + s + ' fill:' + css('--' + s + '-soft') + ',stroke:' + css('--' + s) + ',color:' + css('--text') + ',stroke-width:1.5px').join('\\n');
}
// ---- Roadmap
// One version at a time: the picker holds every version, then Backlog (parked
// epics and tickets, whatever their version) and No version (epics still to
// label). Within a view, epics sit in columns by build order, left to right,
// and an arrow runs from an epic to the epics waiting on it. A blocker outside
// the view (another version) is a stub card in a first column, so the link is
// visible without drawing that version.
const LANE_ORDER = ['you', 'review', 'working', 'queued', 'triage', 'blocked', 'done', 'dropped', 'backlog']; // parked last
const isParked = (e) => e.status === 'backlog';
// Function declarations, not consts: the Progress table above calls verCmp while the page first renders.
function verParts(v) { return String(v).replace(/^v/i, '').split('.').map(Number); }
function verCmp(a, b) { const x = verParts(a), y = verParts(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; } return 0; }
function laterVersion(e, b) { return e.version && b.version && verCmp(b.version, e.version) > 0; } // b is of a later version than e
const inView = (e, view) => view === 'backlog' ? isParked(e) : view === 'none' ? !e.version && !isParked(e) : e.version === view && !isParked(e);
function viewOptions() {
  const opts = DATA.versions.map((v) => [v, v]);
  if (DATA.epics.some(isParked) || outsideTickets().some((t) => t.status === 'backlog')) opts.push(['backlog', 'Backlog']);
  if (DATA.epics.some((e) => !e.version && !isParked(e))) opts.push(['none', 'No version']);
  return opts;
}
// The lowest version with an epic still open; with no versions yet, the
// unlabelled epics (what there is to fix), else the first entry.
function defaultView() {
  const opts = viewOptions().map(([k]) => k);
  return DATA.versions.find((v) => DATA.epics.some((e) => e.version === v && !isParked(e) && e.status !== 'done'))
    ?? (opts.includes('none') ? 'none' : opts[0] ?? 'none');
}
let view = defaultView();
try { const saved = localStorage.getItem('tracker-version'); if (saved && viewOptions().some(([k]) => k === saved)) view = saved; } catch {}
$('rm-version').innerHTML = viewOptions().map(([k, name]) => '<option value="' + k + '"' + (k === view ? ' selected' : '') + '>' + esc(name) + '</option>').join('');
$('rm-version').addEventListener('change', () => { view = $('rm-version').value; try { localStorage.setItem('tracker-version', view); } catch {} renderRoadmap(); });

// Ticket chips, your tickets first, coloured by who acts next.
const isDone = (t) => t.status === 'done' || t.status === 'dropped';
function chipsOf(ts, hideDone, row) {
  const shown = ts.filter((t) => !(hideDone && isDone(t)))
    .sort((a, b) => LANE_ORDER.indexOf(a.status) - LANE_ORDER.indexOf(b.status) || a.number - b.number);
  return shown.length ? '<div class="chips' + (row ? ' row' : '') + '">' + shown.map((t) => {
    const k = t.status === 'dropped' ? 'done' : t.status;
    const tip = '#' + t.number + ' ' + t.title + ' (' + DATA.ticketStatus[t.status] + (t.openBlockers.length ? '; waits on #' + t.openBlockers.join(', #') : '') + ')';
    const mine = k === 'you' || k === 'review' ? '<span class="you-tag">' + (k === 'review' ? 'Review' : 'You') + '</span>' : '';
    return '<a class="chip ' + k + '" style="--k:var(--' + k + ');--ks:var(--' + k + '-soft)" href="' + t.url + '" target="_blank" title="' + esc(tip) + '">' + mine + '<span class="cn">#' + t.number + '</span><span class="ct">' + esc(t.title) + '</span></a>';
  }).join('') + '</div>' : '';
}
// Tickets with no epic: standalone bugs and small changes from triage, each
// shipped as its own PR to main. Open and parked ones, and ones closed in the
// last two weeks (they'd pile up forever otherwise).
const RECENT_DAYS = 14;
const outsideTickets = () => DATA.tickets.filter((t) => !t.epic &&
  (!isDone(t) || (t.closedAt && Date.now() - Date.parse(t.closedAt) < RECENT_DAYS * 86_400_000)));
// Grouped by what they are, in a strip above the roadmap (the parked ones in
// the Backlog view): bugs and small changes each ship as their own PR to main.
const GROUPS = [
  ['bug', 'Bugs', 'Each reproduced and fixed on its own, as a PR to main.', (t) => t.what === 'bug'],
  ['change', 'Small changes', 'Each built from its brief, as a PR to main.', (t) => t.what === 'enhancement'],
  ['scoping', 'To scope', 'Too big for one ticket: /scope-decomposer turns each into epics.', (t) => t.what === 'needs-scoping'],
  ['info', 'Waiting on the reporter', 'Triage asked a question; it triages again on the reply.', (t) => t.what === 'needs-info'],
  ['wontfix', 'Not doing', 'Already built, a duplicate or rejected; a person closes each.', (t) => t.what === 'wontfix'],
  ['triage', 'Not sorted', 'Waiting for triage to say what each is and who acts.', (t) => !t.what],
];
const groupOf = (t) => t.status === 'backlog' ? 'backlog' : (GROUPS.find(([, , , m]) => m(t)) ?? GROUPS.at(-1))[0];
const stripOpen = new Set();
function outsideStrip(hideDone) {
  const ts = outsideTickets();
  const groups = view === 'backlog' ? [['backlog', 'Parked tickets', 'Parked for later, of any kind: no agent touches them.']] : GROUPS;
  return groups.map(([key, name, what]) => {
    const g = ts.filter((t) => groupOf(t) === key);
    const open = g.filter((t) => !isDone(t));
    if (!open.length && (hideDone || !g.length)) return '';
    const mine = open.filter((t) => t.status === 'you' || t.status === 'review').length;
    const closed = g.length - open.length;
    const c = key === 'backlog' ? 'backlog' : key === 'triage' ? 'triage' : mine ? 'you' : open.some((t) => t.status === 'working') ? 'working' : open.length ? 'queued' : 'done';
    return '<details class="strip" data-key="' + key + '"' + (stripOpen.has(key) || mine ? ' open' : '') + ' style="--c:var(--' + c + ')"><summary><b>' + name + '</b><span class="meta">' + open.length + ' open' +
      (mine ? ' · <b class="needs">' + mine + ' need you</b>' : '') + (closed ? ' · ' + closed + ' closed in the last ' + RECENT_DAYS + ' days' : '') + '</span><span class="meta what">' + what + '</span></summary>' +
      chipsOf(g, hideDone, true) + '</details>';
  }).join('');
}
// The open epics waiting on this one.
const unblocks = (e) => DATA.epics.filter((x) => x.status !== 'done' && x.blockedBy.includes(e.number)).map((x) => x.number);
// What the roadmap needs you to fix before the version makes sense: epics with
// no version, and an epic that waits on a later version's epic.
function banner() {
  const lines = [];
  const unlabelled = DATA.epics.filter((e) => !e.version && !isParked(e) && e.status !== 'done');
  if (unlabelled.length) lines.push('<b>' + unlabelled.length + ' epic' + (unlabelled.length > 1 ? 's have' : ' has') + ' no version</b>: ' + unlabelled.map((e) => ref(e.number)).join(', ') +
    '. Label each one, e.g. <code>gh issue edit ' + unlabelled[0].number + ' --add-label version:' + (DATA.versions[0] ?? 'v1') + '</code>' + (view !== 'none' ? ' (they are under <i>No version</i> in the picker)' : '') + '.');
  const crossed = DATA.epics.filter((e) => e.status !== 'done').flatMap((e) => e.blockedBy.map((b) => epicByNum[b]).filter((b) => b && laterVersion(e, b)).map((b) => [e, b]));
  if (crossed.length) lines.push('<b>' + crossed.length + ' epic' + (crossed.length > 1 ? 's wait' : ' waits') + ' on a later version</b>: ' + crossed.map(([e, b]) => ref(e.number) + ' (' + esc(e.version) + ') after ' + ref(b.number) + ' (' + esc(b.version) + ')').join('; ') +
    '. Move one of the two to the other version, or drop the dependency: nothing in the earlier version can ship while it holds.');
  return lines.length ? '<div class="rm-banner">' + lines.map((l) => '<div>' + l + '</div>').join('') + '</div>' : '';
}
function stubCard(b, later) {
  const what = isParked(b) ? 'in the backlog' : b.status === 'done' ? 'done' : later ? 'later version' : b.version ? 'earlier version' : 'no version';
  return '<div class="ep stub' + (later ? ' later' : '') + '" id="ep-' + b.number + '" title="' + esc('#' + b.number + ' ' + b.title + (b.version ? ' · ' + b.version : '')) + '">' +
    '<div class="ep-title"><a class="n" href="' + b.url + '" target="_blank">#' + b.number + '</a><span>' + esc(b.title) + '</span></div>' +
    '<div class="ep-meta">' + (b.version ? esc(b.version) + ' · ' : '') + what + '</div></div>';
}
function renderRoadmap() {
  const withTickets = $('rm-tickets').checked, hideDone = $('rm-hide-done').checked;
  $('rm-banner').innerHTML = banner();
  $('rm-outside').innerHTML = outsideStrip(hideDone);
  $('rm-outside').querySelectorAll('details.strip').forEach((d) => d.addEventListener('toggle', () => { if (d.open) stripOpen.add(d.dataset.key); else stripOpen.delete(d.dataset.key); drawRoadmapLines(); }));
  const shown = DATA.epics.filter((e) => inView(e, view));
  const set = new Set(shown.map((e) => e.number));
  // Blockers outside the view become stubs in a first column; levels count from there.
  const stubs = new Map();
  for (const e of shown) for (const b of e.blockedBy) if (!set.has(b) && epicByNum[b]) stubs.set(b, epicByNum[b]);
  const base = stubs.size ? 1 : 0;
  const lvl = {};
  const levelOf = (e) => {
    if (lvl[e.number] !== undefined) return lvl[e.number];
    lvl[e.number] = base;
    const bs = e.blockedBy.filter((b) => set.has(b)).map((b) => epicByNum[b]);
    return (lvl[e.number] = bs.length ? 1 + Math.max(...bs.map(levelOf)) : base);
  };
  const cols = [];
  if (stubs.size) cols[0] = [...stubs.values()].sort((a, b) => a.number - b.number);
  for (const e of shown) (cols[levelOf(e)] ??= []).push(e);
  for (let i = 0; i < cols.length; i++) cols[i] ??= [];
  // Fewer crossings: within a column, order epics by where their blockers sit in the column before.
  const pos = new Map();
  for (let i = 0; i < cols.length; i++) {
    if (i > base) cols[i].sort((a, b) => bary(a) - bary(b) || a.number - b.number);
    cols[i].forEach((e, k) => pos.set(e.number, k));
    function bary(e) { const ps = e.blockedBy.filter((b) => pos.has(b)).map((b) => pos.get(b)); return ps.length ? ps.reduce((s, p) => s + p, 0) / ps.length : 1e6; }
  }
  const stepName = (i) => stubs.size && i === 0 ? 'From elsewhere' : view === 'backlog' ? (i === base ? 'Parked' : 'Parked · step ' + (i - base + 1)) : i === base ? 'Now' : 'Step ' + (i - base + 1);
  $('rm').innerHTML = '<svg class="lines" id="rm-lines"></svg>' + cols.map((list, i) => '<div class="rm-col"><div class="rm-step">' + stepName(i) + '</div>' + list.map((e) => {
    if (i === 0 && stubs.size) return stubCard(e, shown.some((x) => x.blockedBy.includes(e.number) && laterVersion(x, e)));
    const c = epicColor(e);
    const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
    const chips = withTickets ? chipsOf(DATA.tickets.filter((t) => t.epic === e.number), hideDone) : '';
    const vPill = view === 'backlog' || view === 'none' ? versionPill(e) : '';
    // A done epic folds to one line; open it to see its tickets.
    if (e.status === 'done')
      return '<details class="ep done-ep" id="ep-' + e.number + '" style="--c:var(--done);--cs:var(--done-soft)"' + (openDone.has(e.number) ? ' open' : '') + '>' +
        '<summary><a class="n" href="' + e.url + '" target="_blank">#' + e.number + '</a><span>' + esc(e.title) + areaPill(e) + vPill + '</span><span class="ok">✓ Done' + (e.total ? ' · ' + e.total + ' tickets' : '') + '</span></summary>' +
        chips + '</details>';
    // Outlined red when anything in it waits on you; its status is filled red only when the epic itself does (brief, spec, merge).
    const needsYou = c === 'you' || e.counts.you + e.counts.review > 0;
    const after = e.openBlockers.map((n) => ref(n) + (epicByNum[n] && laterVersion(e, epicByNum[n]) ? ' <span class="warn" title="A later version blocks this epic: fix the version or the dependency">' + esc(epicByNum[n].version) + '!</span>' : ''));
    return '<div class="ep' + (needsYou ? ' needs-you' : '') + (c === 'you' ? ' yours' : '') + '" id="ep-' + e.number + '" style="--c:var(--' + c + ');--cs:var(--' + c + '-soft)">' +
      '<div class="ep-title"><a class="n" href="' + e.url + '" target="_blank">#' + e.number + '</a><span>' + esc(e.title) + areaPill(e) + manualPill(e) + vPill + '</span></div>' +
      '<span class="ep-status">' + esc(epicStatusText(e)) + '</span>' +
      (e.total ? '<div class="ep-meta">' + e.done + ' of ' + e.total + ' tickets done' + (e.counts.you + e.counts.review ? ' · ' + (e.counts.you + e.counts.review) + ' need you' : '') + '</div><div class="bar"><i style="width:' + pct + '%"></i></div>' : '') +
      (after.length ? '<div class="ep-meta">after ' + after.join(', ') + '</div>' : '') +
      (unblocks(e).length ? '<div class="ep-meta">then ' + unblocks(e).map(ref).join(', ') + '</div>' : '') +
      (e.total ? chips : '<div class="unplanned">Not planned yet: no tickets.</div>') + '</div>';
  }).join('') + '</div>').join('') || '<div class="empty" style="margin:8px">Nothing in this view.</div>';
  $('rm').querySelectorAll('.ep[id^="ep-"]').forEach((el) => {
    const n = Number(el.id.slice(3));
    el.addEventListener('mouseenter', () => focusEpic(n));
    el.addEventListener('mouseleave', () => focusEpic(null));
  });
  $('rm').querySelectorAll('details.done-ep').forEach((d) => d.addEventListener('toggle', () => {
    const n = Number(d.id.slice(3));
    if (d.open) openDone.add(n); else openDone.delete(n);
    drawRoadmapLines();
  }));
  drawRoadmapLines();
}
const openDone = new Set();
// Every link runs left to right, one column gap at a time. A link to the next
// column is a curve across the gap. A link that skips columns is a bus: down a
// lane in the gap, along a dots row under each skipped column (a dot marks it
// passing through), and up the lane before its target. Nothing crosses a card.
function drawRoadmapLines() {
  const rm = $('rm'), svg = $('rm-lines');
  if (!rm || !svg || $('roadmap').hidden) return;
  const box = rm.getBoundingClientRect();
  // Solid: the blocker is still open, so this is what holds the epic back now.
  // Dashed: the blocker is done. Each link runs from a dot on the blocker to an
  // arrow on the epic that waits for it, anchored at the cards' title rows.
  // Fixed-size arrowheads (not scaled by the line's width); a blue one for a highlighted link.
  const arrow = (id, cls) => '<marker id="' + id + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="' + cls + '"/></marker>';
  let paths = '<defs>' + arrow('arr', 'dot') + arrow('arr-met', 'dot met') + arrow('arr-hot', 'dot hot') + '</defs>';
  const cols = [...rm.querySelectorAll('.rm-col')].map((c) => { const r = c.getBoundingClientRect(); return { left: r.left - box.left, right: r.right - box.left, bottom: r.bottom - box.top }; });
  const colOf = (el) => { const x = el.getBoundingClientRect().left - box.left; return cols.findIndex((c) => x >= c.left - 1 && x < c.right + 1); };
  const lanes = cols.map(() => 0), rows = cols.map(() => 0); // lanes per gap (before column i), dot rows per column
  let bottom = 0;
  for (const e of DATA.epics) for (const b of e.blockedBy) {
    const from = document.getElementById('ep-' + b), to = document.getElementById('ep-' + e.number);
    if (!from || !to || to.classList.contains('stub')) continue; // a stub only ever blocks: what blocks it isn't this view's
    const met = epicByNum[b]?.status === 'done';
    const f = from.getBoundingClientRect(), t = to.getBoundingClientRect();
    const x1 = f.right - box.left, y1 = f.top - box.top + 20, x2 = t.left - box.left - 2, y2 = t.top - box.top + 20;
    const cf = colOf(from), ct = colOf(to);
    let d, dots = '';
    if (cf < 0 || ct < 0 || ct - cf <= 1 || x2 <= x1) {
      const dx = Math.max(32, Math.abs(x2 - x1) / 2);
      d = 'M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2;
    } else {
      d = 'M' + x1 + ',' + y1;
      let y = y1;
      for (let c = cf + 1; c < ct; c++) {
        const gx = cols[c].left - 52 + 7 * (lanes[c]++ % 6);          // a lane in the gap before column c
        const dy = cols[c].bottom + 18 + 10 * (rows[c]++ % 8);         // the dots row under column c's cards
        d += ' H' + gx + ' V' + dy + ' H' + cols[c].right;
        dots += '<circle class="via' + (met ? ' met' : '') + '" cx="' + ((cols[c].left + cols[c].right) / 2) + '" cy="' + dy + '" r="3"/>';
        bottom = Math.max(bottom, dy);
        y = dy;
      }
      const gx = cols[ct].left - 52 + 7 * (lanes[ct]++ % 6);
      d += ' H' + gx + ' V' + y2 + ' H' + x2;
    }
    paths += '<g data-from="' + b + '" data-to="' + e.number + '"><path class="halo" d="' + d + '"/>' +
      '<path class="link' + (met ? ' met' : '') + '" marker-end="url(#' + (met ? 'arr-met' : 'arr') + ')" d="' + d + '"/>' +
      '<circle class="dot' + (met ? ' met' : '') + '" cx="' + x1 + '" cy="' + y1 + '" r="3.5"/>' + dots + '</g>';
  }
  const cardsBottom = Math.max(0, ...cols.map((c) => c.bottom));
  rm.style.paddingBottom = Math.max(16, bottom - cardsBottom + 24) + 'px'; // room for the dots rows
  svg.setAttribute('width', rm.scrollWidth);
  svg.setAttribute('height', Math.max(rm.scrollHeight, bottom + 24));
  svg.innerHTML = paths;
  if (focused !== null) focusEpic(focused);
}
let focused = null;
// Hovering an epic shows only its links: what it waits on and what waits on it.
function focusEpic(n) {
  focused = n;
  const rm = $('rm');
  rm.classList.toggle('focus', n !== null);
  const near = new Set(n === null ? [] : [n]);
  rm.querySelectorAll('svg.lines g').forEach((g) => {
    const hot = n !== null && (Number(g.dataset.from) === n || Number(g.dataset.to) === n);
    g.classList.toggle('hot', hot);
    const link = g.querySelector('.link');
    link.setAttribute('marker-end', 'url(#' + (hot ? 'arr-hot' : link.classList.contains('met') ? 'arr-met' : 'arr') + ')');
    if (hot) { near.add(Number(g.dataset.from)); near.add(Number(g.dataset.to)); }
  });
  rm.querySelectorAll('.ep').forEach((el) => el.classList.toggle('hot', near.has(Number(el.id.slice(3)))));
}
window.addEventListener('resize', drawRoadmapLines);
function epicGraph(epicNum) {
  const ts = epicNum ? DATA.tickets.filter((t) => t.epic === epicNum) : outsideTickets();
  if (!ts.length) return null;
  const inEpic = new Set(ts.map((t) => t.number));
  const lines = ['flowchart LR'];
  for (const t of ts) {
    lines.push('t' + t.number + '["#' + t.number + ' ' + label(t.title) + '"]:::' + (t.status === 'dropped' ? 'done' : t.status));
    lines.push('click t' + t.number + ' "' + t.url + '" _blank');
  }
  for (const t of ts) for (const b of t.blockedBy) if (inEpic.has(b)) lines.push('t' + b + ' --> t' + t.number);
  return lines.concat(classDefs()).join('\\n');
}
// Two keys, one for epics and one for tickets: what each colour asks of you.
const EPIC_KEY = [
  ['you', 'Red', 'Needs you', 'its brief, its spec to approve, or its finished PR to merge. An epic outlined in red has a ticket waiting on you.'],
  ['working', 'Blue', 'Building', 'agents are building its tickets.'],
  ['queued', 'Purple', 'Planning', 'agents are planning it, or plan it next.'],
  ['blocked', 'Grey', 'Waiting', 'on earlier epics: it starts when they finish.'],
  ['done', 'Green', 'Done', 'merged. Folded to one line; click it to see its tickets.'],
];
const TICKET_KEY = [
  ['you', 'Red', 'You', 'answer it, do it, or review its fix. Nothing moves until you act.'],
  ['working', 'Blue', 'Agent on it', 'an agent is building or fixing it now.'],
  ['queued', 'Purple', 'Agent next', 'queued; the loop takes it on its own.'],
  ['triage', 'Amber', 'Not sorted', 'waiting for triage to say what it is and who acts.'],
  ['blocked', 'Grey', 'Waiting', 'on another ticket first. Hover it to see which.'],
  ['done', 'Green', 'Done', 'closed, struck through.'],
  ['backlog', 'Grey', 'Backlog', 'parked for later; always last in a list.'],
];
const keyBox = (title, rows, how) => '<div class="key"><div class="key-title">' + title + '</div>' + rows.map(([k, colour, name, what]) =>
  '<div class="row"><span class="sw ' + k + '" style="--k:var(--' + k + ');--ks:var(--' + k + '-soft)">' + colour + '</span><span><b>' + name + '</b>: <span class="what">' + what + '</span></span></div>').join('') +
  (how ? '<div class="how">' + how + '</div>' : '') + '</div>';
function legend(id, boxes) { $(id).innerHTML = '<div class="keys">' + boxes.join('') + '</div>'; }
legend('roadmap-legend', [
  keyBox('Epics', EPIC_KEY, 'One version at a time (the picker; Backlog and No version are entries of their own). Columns run left to right in build order. An arrow goes from an epic to the epics waiting on it: solid while it holds them back, dashed once it is done; a link that skips columns runs under the cards, with a dot where it passes a column. A dashed stub in the first column is a blocker from another version: amber when that version is later than this one, which you should fix. Hover an epic to see only its links; each card also says <i>after</i> and <i>then</i> in words. <span class="pill manual">manual</span>: planned and built by you, outside the loop. <span class="pill area">mobile</span>: the area of the epic; <code>npm run agents -- --area=mobile</code> runs a loop on that area alone, so loops on other machines can take the other areas.'),
  keyBox('Tickets', TICKET_KEY, 'Inside each epic, and in the strip above the roadmap for the tickets in no epic: bugs, small changes, to scope, waiting on the reporter, not sorted (the parked ones under Backlog). Click a ticket to open it on GitHub.'),
]);
['rm-tickets', 'rm-hide-done'].forEach((id) => {
  try { const v = localStorage.getItem('tracker-' + id); if (v !== null) $(id).checked = v === '1'; } catch {}
  $(id).addEventListener('change', () => { try { localStorage.setItem('tracker-' + id, $(id).checked ? '1' : '0'); } catch {} renderDiagrams(); });
});
legend('epic-legend', [keyBox('Tickets', TICKET_KEY, 'An arrow goes from a ticket to the tickets waiting on it. Click a box to open the issue.')]);

let drawn = {};
async function draw(id, src) {
  const el = $(id);
  if (!window.mermaid) { el.textContent = 'Diagram needs a network connection (mermaid loads from jsDelivr).'; return; }
  if (drawn[id] === src) return;
  drawn[id] = src;
  if (!src) { el.innerHTML = '<div class="empty">No tickets yet: this epic has not been planned.</div>'; return; }
  const { svg, bindFunctions } = await mermaid.render(id + '-svg-' + Date.now(), src);
  el.innerHTML = svg;
  bindFunctions?.(el);
}
function renderDiagrams() {
  if (!$('roadmap').hidden) renderRoadmap();
  if (!$('epic').hidden) draw('epic-graph', epicGraph(Number($('epic-pick').value)));
}
if (window.mermaid) mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: 'base', themeVariables: { fontSize: '15px', lineColor: css('--muted') }, flowchart: { htmlLabels: true, curve: 'basis', useMaxWidth: false } });

// ---- Epic board
const planned = DATA.epics.filter((e) => e.total);
$('epic-pick').innerHTML = '<option value="0">Not in an epic (bugs, small changes, backlog)</option>' +
  planned.concat(DATA.epics.filter((e) => !e.total)).map((e) => '<option value="' + e.number + '">#' + e.number + ' ' + esc(e.title) + (e.total ? '' : ' (not planned)') + '</option>').join('');
// Open an epic by default; the outside entry when there's no epic, or when you last picked it.
if (planned.length) $('epic-pick').value = String(planned[0].number);
const LANES = [['you', 'Your turn', ['you', 'review']], ['working', 'Agent working', ['working']], ['queued', 'Agent queue', ['queued', 'triage']], ['blocked', 'Blocked', ['blocked']], ['backlog', 'Backlog', ['backlog']], ['done', 'Done', ['done', 'dropped']]];
function renderBoard() {
  const n = Number($('epic-pick').value);
  const e = epicByNum[n];
  const ts = n ? DATA.tickets.filter((t) => t.epic === n) : outsideTickets();
  $('epic-summary').innerHTML = e
    ? esc(DATA.epicStatus[e.status]) + (e.total ? ' · ' + e.done + ' of ' + e.total + ' tickets done' : '') + ' · ' + ref(n)
    : 'Tickets in no epic, each shipped as its own PR to main · done: the last ' + RECENT_DAYS + ' days';
  $('board').innerHTML = LANES.map(([k, name, statuses]) => {
    let items = ts.filter((t) => statuses.includes(t.status));
    if (k === 'done') items = items.sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
    return '<div class="lane ' + k + '"><h3><span>' + name + '</span><span>' + items.length + '</span></h3>' +
      (items.map((t) => '<div class="card"><div class="top"><span class="num">' + ref(t.number) + '</span><span class="title">' + esc(t.title) + '</span></div>' +
        (t.status === 'blocked' ? '<div class="sub">waits on ' + t.openBlockers.map(ref).join(', ') + '</div>' : t.status === 'review' ? '<div class="sub">' + pill('review') + '</div>' : '') + '</div>').join('') || '<div class="empty">None</div>') + '</div>';
  }).join('');
  try { localStorage.setItem('tracker-epic', String(n)); } catch {}
  renderDiagrams();
}
$('epic-pick').addEventListener('change', renderBoard);
try { const saved = localStorage.getItem('tracker-epic'); if (saved && (saved === '0' || epicByNum[saved])) $('epic-pick').value = saved; } catch {}
renderBoard();

// Follow the loop's rebuilds: reload when coming back to the tab, or every
// few minutes while idle, keeping the scroll position.
const loadedAt = Date.now();
let lastInput = Date.now();
['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true }));
function reload() {
  try { sessionStorage.setItem('tracker-scroll', String(scrollY)); } catch {}
  location.reload();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - loadedAt > 60_000) reload(); });
setInterval(() => { if (Date.now() - loadedAt > 180_000 && Date.now() - lastInput > 60_000) reload(); }, 30_000);
try { const y = sessionStorage.getItem('tracker-scroll'); if (y) { sessionStorage.removeItem('tracker-scroll'); requestAnimationFrame(() => scrollTo(0, Number(y))); } } catch {}

let startTab = 'roadmap';
try { const t = localStorage.getItem('tracker-tab'); if (['actions', 'specs', 'roadmap', 'epic', 'backlog'].includes(t) || (t === 'suites' && DATA.suites)) startTab = t; } catch {}
showTab(startTab);
</script>
</body>
</html>
`;

return { html, count: issues.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { html, count } = await render();
  writeFileSync(OUT, html);
  console.log(`Wrote ${OUT} (${count} issues)`);
  if (!process.argv.includes("--no-open")) {
    try { execFileSync(process.platform === "darwin" ? "open" : "xdg-open", [OUT]); } catch {}
  }
}
