// Issue tracker page: pulls every issue and its blocking edges from GitHub
// with `gh`, and writes tracker/index.html (gitignored) to open in a browser.
// The repo is the one `gh` resolves from the working directory.
//
//   node tracker/build.mjs          build and open
//   node tracker/build.mjs --no-open

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { owner, name } = JSON.parse(execFileSync("gh", ["repo", "view", "--json", "owner,name"], { encoding: "utf8" }));
const REPO = { owner: owner.login, name };
const OUT = join(dirname(fileURLToPath(import.meta.url)), "index.html");

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const QUERY = `query($owner: String!, $name: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    issues(first: 100, after: $after, orderBy: { field: CREATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title body state stateReason url closedAt
        labels(first: 20) { nodes { name } }
        milestone { title }
        assignees(first: 5) { nodes { login } }
        blockedBy(first: 50) { nodes { number } }
        comments(last: 1) { nodes { body createdAt } }
      }
    }
  }
}`;

function fetchIssues() {
  const all = [];
  let after = null;
  do {
    const args = ["api", "graphql", "-f", `query=${QUERY}`, "-F", `owner=${REPO.owner}`, "-F", `name=${REPO.name}`];
    if (after) args.push("-F", `after=${after}`);
    const page = JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })).data.repository.issues;
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

const issues = fetchIssues();
const byNumber = new Map(issues.map((i) => [i.number, i]));
const has = (i, label) => i.labels.includes(label);
const isPlanning = (i) => i.labels.some((l) => l.startsWith("wayfinder:")) || has(i, "spec");
const isTicket = (i) => !has(i, "epic") && !has(i, "initiative") && !isPlanning(i);
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
  if (tickets.length) return "building";
  return "ready";
}

const EPIC_STATUS = {
  done: "Done",
  brief: "Needs your brief",
  spec: "Spec waits for your approval",
  held: "Planned; held until blockers finish",
  waiting: "Waiting on earlier epics",
  planning: "Agent is planning",
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
    autopilot: has(e, "autopilot"),
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

const hitl = issues
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
  });

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

const data = {
  generatedAt: new Date().toISOString(),
  repo: `${REPO.owner}/${REPO.name}`,
  epics: epicData,
  tickets,
  hitl,
  specs,
  titles: Object.fromEntries(issues.map((i) => [i.number, i.title])),
  urls: Object.fromEntries(issues.map((i) => [i.number, i.url])),
  epicStatus: EPIC_STATUS,
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
  --you: #b4530a; --you-soft: #fdf0e3;
  --review: #8a3fb8; --review-soft: #f5ecfb;
  --working: #1f7a4d; --working-soft: #e5f4ec;
  --queued: #2c5fb3; --queued-soft: #e8effa;
  --blocked: #7a7a73; --blocked-soft: #efefea;
  --done: #9a9a93; --done-soft: #f3f3f0;
  --triage: #a8323a; --triage-soft: #fbeaeb;
  --backlog: #7a7a73; --backlog-soft: #ecece7;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161615; --surface: #1f1f1d; --surface-2: #2a2a27; --border: #34342f;
    --text: #ecece8; --muted: #9b9b94; --link: #8db4f2;
    --you: #f0a35e; --you-soft: #3a2817;
    --review: #c99ae8; --review-soft: #2f2238;
    --working: #6fcf9b; --working-soft: #17301f;
    --queued: #8db4f2; --queued-soft: #1b2638;
    --blocked: #9b9b94; --blocked-soft: #2a2a27;
    --done: #6b6b66; --done-soft: #222220;
    --triage: #f08a90; --triage-soft: #3a1c1e;
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
.bar i { display: block; height: 100%; background: var(--working); }
.table-scroll { overflow-x: auto; }
.diagram { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px; overflow-x: auto; }
.diagram svg { max-width: none !important; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 12px; margin: 10px 0 0; font-size: 13px; color: var(--muted); }
.board { display: grid; grid-template-columns: repeat(5, minmax(200px, 1fr)); gap: 12px; overflow-x: auto; }
@media (max-width: 1000px) { .board { grid-template-columns: repeat(5, 240px); } }
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
.conf { flex: 0 0 auto; font-size: 12px; font-weight: 700; padding: 1px 7px; border-radius: 999px; font-variant-numeric: tabular-nums; color: var(--working); background: var(--working-soft); }
.conf.low { color: var(--you); background: var(--you-soft); }
.conf.na { color: var(--muted); background: var(--surface-2); }
.tag { flex: 0 0 auto; font-size: 11px; font-weight: 600; color: var(--triage); border: 1px solid var(--triage); border-radius: 4px; padding: 0 5px; }
.approve { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border); font-size: 14px; }
.approve code { font-size: 12.5px; }
button.copy { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); cursor: pointer; }
.spec.revising { border-left-color: var(--queued); }
.spec.approved { border-left-color: var(--working); }
.spec.done { border-left-color: var(--done); }
details.spec > summary { cursor: pointer; }
details.spec > .spec { border: 0; padding: 0; margin: 10px 0 0; }
.rm-scroll { overflow-x: auto; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; }
.rm { position: relative; display: flex; gap: 64px; align-items: flex-start; padding: 16px; width: max-content; }
.rm svg.lines { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 0; overflow: visible; }
.rm svg.lines path { fill: none; stroke: var(--muted); stroke-width: 1.5; opacity: .7; }
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
.chip.done .ct { text-decoration: line-through; color: var(--muted); }
.ep .unplanned { font-size: 12.5px; color: var(--muted); margin-top: 8px; font-style: italic; }
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
.hitl li.done::before { background: var(--working); border-color: var(--working); }
.hitl details summary { margin: 8px 0 0 46px; font-size: 13px; color: var(--link); cursor: pointer; }
.hitl .noitems { margin: 8px 0 0 46px; font-size: 13px; color: var(--muted); }
@media (max-width: 600px) { .hitl .sub, .hitl ul, .hitl .noitems, .hitl details summary { margin-left: 0; } }
.pill.task { color: var(--you); background: var(--you-soft); }
.pill.backlog { color: var(--backlog); background: var(--backlog-soft); }
.pill.brief, .pill.spec { color: var(--queued); background: var(--queued-soft); }
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
    <button role="tab" data-tab="actions" aria-selected="true">Action items</button>
    <button role="tab" data-tab="specs" aria-selected="false">Specs to validate<span id="spec-count"></span></button>
    <button role="tab" data-tab="roadmap" aria-selected="false">Roadmap</button>
    <button role="tab" data-tab="epic" aria-selected="false">Epic board</button>
  </nav>

  <section id="actions">
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

  <section id="roadmap" hidden>
    <h2>Roadmap</h2>
    <div class="filters">
      <label class="check"><input type="checkbox" id="rm-tickets" checked> Show tickets inside planned epics</label>
      <label class="check"><input type="checkbox" id="rm-hide-done"> Hide done tickets</label>
    </div>
    <div class="legend" id="roadmap-legend" style="margin-bottom:12px"></div>
    <div class="rm-scroll"><div class="rm" id="rm"></div></div>
    <h2>Progress</h2>
    <div class="table-scroll"><table id="epic-table"></table></div>
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
  ['actions', 'specs', 'roadmap', 'epic'].forEach((id) => { $(id).hidden = id !== name; });
  try { localStorage.setItem('tracker-tab', name); } catch {}
  renderDiagrams();
}
tabs.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

function card(t, extra) {
  return '<div class="card"><div class="top"><span class="num">' + ref(t.number) + '</span><span class="title">' + esc(t.title) + '</span></div>' +
    '<div class="sub">' + esc(epicName(t.epic)) + (extra ? ' · ' + extra : '') + '</div></div>';
}

// ---- Action items (HITL, by assignee)
const KIND = { task: 'Task', review: 'Review', brief: 'Epic brief', spec: 'Spec approval' };
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
  return '<div class="hitl' + (h.canStart ? '' : ' waiting') + '"><div class="top"><span class="num">' + ref(h.number) + '</span>' +
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
    '<span class="pill ' + (sp.stage === 'review' ? 'you' : sp.stage === 'approved' ? 'working' : 'queued') + '">' + stageText + '</span></div>' +
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

// ---- Roadmap
const EPIC_COLORS = { done: 'done', brief: 'you', spec: 'you', held: 'blocked', waiting: 'blocked', planning: 'queued', building: 'working', ready: 'queued', backlog: 'backlog' };
$('epic-table').innerHTML = '<tr><th>Epic</th><th>Status</th><th>Tickets</th><th>Waits on</th></tr>' + DATA.epics.map((e) => {
  const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
  const counts = e.total ? Object.entries(e.counts).filter(([s, n]) => n && s !== 'done' && s !== 'dropped').map(([s, n]) => n + ' ' + DATA.ticketStatus[s].toLowerCase()).join(' · ') : '';
  return '<tr><td>' + ref(e.number) + ' ' + esc(e.title) + '</td>' +
    '<td><span class="pill ' + EPIC_COLORS[e.status] + '">' + esc(DATA.epicStatus[e.status]) + '</span></td>' +
    '<td>' + (e.total ? e.done + ' / ' + e.total + ' done<div class="bar"><i style="width:' + pct + '%"></i></div><div class="meta">' + counts + '</div>' : '<span class="meta">not planned yet</span>') + '</td>' +
    '<td>' + (e.openBlockers.map(ref).join(', ') || '<span class="meta">nothing</span>') + '</td></tr>';
}).join('');

// ---- Diagrams (mermaid, drawn lazily when their tab is visible)
const label = (s) => s.replace(/"/g, "'").replace(/[<>]/g, '').slice(0, 42) + (s.length > 42 ? '…' : '');
function classDefs() {
  return ['you', 'review', 'working', 'queued', 'blocked', 'done', 'triage'].map((s) =>
    'classDef ' + s + ' fill:' + css('--' + s + '-soft') + ',stroke:' + css('--' + s) + ',color:' + css('--text') + ',stroke-width:1.5px').join('\\n');
}
// Roadmap: epics in columns by build order, tickets listed inside planned
// epics, arrows from an epic to the epics waiting on it.
const LANE_ORDER = ['you', 'review', 'working', 'queued', 'triage', 'blocked', 'backlog', 'done', 'dropped'];
const epicLevel = {};
function levelOf(e) {
  if (epicLevel[e.number] !== undefined) return epicLevel[e.number];
  epicLevel[e.number] = 0;
  const bs = e.blockedBy.map((b) => epicByNum[b]).filter(Boolean);
  return (epicLevel[e.number] = bs.length ? 1 + Math.max(...bs.map(levelOf)) : 0);
}
function renderRoadmap() {
  const withTickets = $('rm-tickets').checked, hideDone = $('rm-hide-done').checked;
  const cols = [];
  for (const e of DATA.epics) (cols[levelOf(e)] ??= []).push(e);
  $('rm').innerHTML = '<svg class="lines" id="rm-lines"></svg>' + cols.map((list, i) => '<div class="rm-col"><div class="rm-step">' + (i === 0 ? 'Now' : 'Step ' + (i + 1)) + '</div>' + list.map((e) => {
    const c = EPIC_COLORS[e.status];
    const pct = e.total ? Math.round((e.done / e.total) * 100) : 0;
    let ts = DATA.tickets.filter((t) => t.epic === e.number);
    const shownTs = ts.filter((t) => !(hideDone && (t.status === 'done' || t.status === 'dropped')))
      .sort((a, b) => LANE_ORDER.indexOf(a.status) - LANE_ORDER.indexOf(b.status) || a.number - b.number);
    const chips = withTickets && shownTs.length ? '<div class="chips">' + shownTs.map((t) => {
      const k = t.status === 'dropped' ? 'done' : t.status;
      const tip = '#' + t.number + ' ' + t.title + ' (' + DATA.ticketStatus[t.status] + (t.openBlockers.length ? '; waits on #' + t.openBlockers.join(', #') : '') + ')';
      return '<a class="chip ' + k + '" style="--k:var(--' + k + ');--ks:var(--' + k + '-soft)" href="' + t.url + '" target="_blank" title="' + esc(tip) + '"><span class="cn">#' + t.number + '</span><span class="ct">' + esc(t.title) + '</span></a>';
    }).join('') + '</div>' : '';
    return '<div class="ep" id="ep-' + e.number + '" style="--c:var(--' + c + ');--cs:var(--' + c + '-soft)">' +
      '<div class="ep-title"><a class="n" href="' + e.url + '" target="_blank">#' + e.number + '</a><span>' + esc(e.title) + '</span></div>' +
      '<span class="ep-status">' + esc(DATA.epicStatus[e.status]) + '</span>' +
      (e.total ? '<div class="ep-meta">' + e.done + ' of ' + e.total + ' tickets done' + (e.counts.you + e.counts.review ? ' · ' + (e.counts.you + e.counts.review) + ' need you' : '') + '</div><div class="bar"><i style="width:' + pct + '%"></i></div>' : '') +
      (e.openBlockers.length ? '<div class="ep-meta">after ' + e.openBlockers.map(ref).join(', ') + '</div>' : '') +
      (e.total ? chips : '<div class="unplanned">Not planned yet: no tickets.</div>') + '</div>';
  }).join('') + '</div>').join('');
  drawRoadmapLines();
}
function drawRoadmapLines() {
  const rm = $('rm'), svg = $('rm-lines');
  if (!rm || !svg || $('roadmap').hidden) return;
  const box = rm.getBoundingClientRect();
  svg.setAttribute('width', rm.scrollWidth);
  svg.setAttribute('height', rm.scrollHeight);
  let paths = '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--muted);stroke:none"/></marker></defs>';
  for (const e of DATA.epics) for (const b of e.blockedBy) {
    const from = document.getElementById('ep-' + b), to = document.getElementById('ep-' + e.number);
    if (!from || !to) continue;
    const f = from.getBoundingClientRect(), t = to.getBoundingClientRect();
    const x1 = f.right - box.left, y1 = f.top - box.top + 22, x2 = t.left - box.left, y2 = t.top - box.top + 22;
    const dx = Math.max(30, (x2 - x1) / 2);
    paths += '<path marker-end="url(#arr)" d="M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2 + '"/>';
  }
  svg.innerHTML = paths;
}
window.addEventListener('resize', drawRoadmapLines);
function epicGraph(epicNum) {
  const ts = DATA.tickets.filter((t) => t.epic === epicNum);
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
function legend(id, keys) {
  $(id).innerHTML = keys.map((k) => pill(k)).join(' ') + ' <span>Arrows point from a blocker to what it blocks. Click a box to open the issue.</span>';
}
legend('roadmap-legend', []);
$('roadmap-legend').innerHTML = '<span>Epic:</span> ' + Object.entries({ working: 'Building', queued: 'Planning / ready to plan', you: 'Needs your brief', blocked: 'Waiting on earlier epics', done: 'Done' }).map(([k, v]) => '<span class="pill ' + k + '">' + v + '</span>').join(' ') +
  '<br><span>Ticket:</span> ' + ['you', 'review', 'working', 'queued', 'blocked', 'done'].map((k) => pill(k)).join(' ') +
  '<br><span>Columns run left to right in build order; arrows point to the epics that wait on another. Hover a ticket for what it waits on; click to open it.</span>';
['rm-tickets', 'rm-hide-done'].forEach((id) => {
  try { const v = localStorage.getItem('tracker-' + id); if (v !== null) $(id).checked = v === '1'; } catch {}
  $(id).addEventListener('change', () => { try { localStorage.setItem('tracker-' + id, $(id).checked ? '1' : '0'); } catch {} renderDiagrams(); });
});
legend('epic-legend', ['you', 'review', 'working', 'queued', 'blocked', 'done']);

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
$('epic-pick').innerHTML = planned.concat(DATA.epics.filter((e) => !e.total)).map((e) => '<option value="' + e.number + '">#' + e.number + ' ' + esc(e.title) + (e.total ? '' : ' (not planned)') + '</option>').join('');
const LANES = [['you', 'Your turn', ['you', 'review']], ['working', 'Agent working', ['working']], ['queued', 'Agent queue', ['queued', 'triage']], ['blocked', 'Blocked', ['blocked']], ['backlog', 'Backlog', ['backlog']], ['done', 'Done', ['done', 'dropped']]];
function renderBoard() {
  const n = Number($('epic-pick').value);
  const e = epicByNum[n];
  const ts = DATA.tickets.filter((t) => t.epic === n);
  $('epic-summary').innerHTML = esc(DATA.epicStatus[e.status]) + (e.total ? ' · ' + e.done + ' of ' + e.total + ' tickets done' : '') + ' · ' + ref(n);
  $('board').innerHTML = LANES.map(([k, name, statuses]) => {
    let items = ts.filter((t) => statuses.includes(t.status));
    if (k === 'done') items = items.sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
    return '<div class="lane"><h3><span>' + name + '</span><span>' + items.length + '</span></h3>' +
      (items.map((t) => '<div class="card"><div class="top"><span class="num">' + ref(t.number) + '</span><span class="title">' + esc(t.title) + '</span></div>' +
        (t.status === 'blocked' ? '<div class="sub">waits on ' + t.openBlockers.map(ref).join(', ') + '</div>' : t.status === 'review' ? '<div class="sub">' + pill('review') + '</div>' : '') + '</div>').join('') || '<div class="empty">None</div>') + '</div>';
  }).join('');
  try { localStorage.setItem('tracker-epic', String(n)); } catch {}
  renderDiagrams();
}
$('epic-pick').addEventListener('change', renderBoard);
try { const saved = localStorage.getItem('tracker-epic'); if (saved && epicByNum[saved]) $('epic-pick').value = saved; } catch {}
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

let startTab = 'actions';
try { const t = localStorage.getItem('tracker-tab'); if (['actions', 'specs', 'roadmap', 'epic'].includes(t)) startTab = t; } catch {}
showTab(startTab);
</script>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(`Wrote ${OUT} (${issues.length} issues)`);
if (!process.argv.includes("--no-open")) {
  try { execFileSync(process.platform === "darwin" ? "open" : "xdg-open", [OUT]); } catch {}
}
