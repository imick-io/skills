#!/usr/bin/env node
// Upgrade a project to a release of imick-io/skills, for /update-imick-skills.
// Run from the project's repo root:
//
//   node <skill>/scripts/update-imick-skills.mjs plan [--to vX.Y.Z]        what differs, as JSON (changes nothing)
//   node <skill>/scripts/update-imick-skills.mjs apply <plan.json> [--skills a,b] [--env-keys K1,K2] [--no-labels]
//   node <skill>/scripts/update-imick-skills.mjs record --version X.Y.Z    write docs/agents/imick-skills.md
//
// `plan` compares the project with the target release (default: the newest):
// installed skills whose files differ, upstream skills not installed, the
// agent loop's files in .sandcastle/ against the release's templates (telling
// a plain update from a project customization by comparing with the template
// of the *installed* version), the Dockerfile's project-additions block,
// .env.example lines, tracker/build.mjs and tracker/vercel/*, new triage-label
// rows, and the "Existing setups" steps of every changelog entry between the
// installed version and the target.
//
// `apply` does the mechanical half: reinstalls the changed skills and the
// chosen new ones in the layout the repo already uses (copies or symlinks),
// copies uncustomized loop files, three-way merges customized ones with
// `git merge-file` (conflict markers left for the agent to resolve), merges
// the Dockerfile outside its project-additions block, copies the chosen
// .env.example lines, copies the tracker, adds label rows and creates the
// labels, and writes the version record. It never commits, never stops the
// loop, never rebuilds the image.
//
// The installed version lives in docs/agents/imick-skills.md ("Version: X.Y.Z").
// Without it, `plan` reports `installed: null`: the skill asks the person.

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";

const SOURCE = "imick-io/skills";
const RECORD = "docs/agents/imick-skills.md";
const LOOP_TEMPLATES = "skills/engineering/setup-imick-skills/agent-loop";
const LABELS_TEMPLATE = "skills/engineering/setup-imick-skills/triage-labels.md";
const TRACKER = "skills/engineering/tracker";
const ADDITIONS = /^# --- project additions ---$/m;
const ADDITIONS_END = /^# --- end project additions ---$/m;

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : undefined; };
const has = (name) => rest.includes(name);
const positional = rest.filter((a, i) => !a.startsWith("--") && !(i > 0 && rest[i - 1].startsWith("--") && !["--no-labels"].includes(rest[i - 1])));

const run = (c, argv, opts = {}) => {
  try { return { ok: true, out: execFileSync(c, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...opts }).trim() }; }
  catch (e) { return { ok: false, out: String(e.stdout ?? "").trim(), err: String(e.stderr ?? e.message).trim(), status: e.status }; }
};
const must = (c, argv, opts) => { const r = run(c, argv, opts); if (!r.ok) throw new Error(`${c} ${argv.join(" ")}\n${r.err}`); return r.out; };
const json = (o) => console.log(JSON.stringify(o, null, 2));
const stop = (why) => { console.log(`## Stopped\n\n${why}`); process.exit(1); };
const read = (p) => readFileSync(p, "utf8");
const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]);

if (!run("git", ["rev-parse", "--is-inside-work-tree"]).ok) stop("Run this from the project's repo.");
process.chdir(must("git", ["rev-parse", "--show-toplevel"]));
if (!run("gh", ["api", "user", "--jq", ".login"]).ok) stop("`gh` isn't logged in: run `gh auth login`.");

// ---- the record and the layout

const record = () => {
  if (!existsSync(RECORD)) return { version: null, layout: null };
  const s = read(RECORD);
  return { version: s.match(/^Version:\s*v?(\S+)/m)?.[1] ?? null, layout: s.match(/^Layout:\s*(\S+)/m)?.[1] ?? null };
};
const writeRecord = (version, layout) => {
  mkdirSync(dirname(RECORD), { recursive: true });
  writeFileSync(RECORD, `# imick-skills\n\nThe release of [${SOURCE}](https://github.com/${SOURCE}) this project is on, kept by \`/update-imick-skills\` (and written by \`/setup-imick-skills\` on install). The skill reads it to pick the release notes to apply and the templates to merge from.\n\nVersion: ${version}\nLayout: ${layout}\nSource: ${SOURCE}\n`);
};
const skillsDir = [".claude/skills", ".agents/skills"].find((d) => existsSync(d));
const detectLayout = () => {
  if (!skillsDir) return "copies";
  const entries = readdirSync(skillsDir).map((n) => join(skillsDir, n));
  return entries.some((p) => lstatSync(p).isSymbolicLink()) ? "symlinks" : "copies";
};

// ---- releases, and a checkout of a tag in a temp dir

const releases = () => JSON.parse(must("gh", ["api", `repos/${SOURCE}/releases?per_page=50`, "--jq", "[.[] | {tag: .tag_name, at: .published_at}]"]));
const semver = (v) => v.replace(/^v/, "").split(".").map(Number);
const cmpVer = (a, b) => { const [x, y] = [semver(a), semver(b)]; for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0); return 0; };
const checkouts = new Map();
const checkout = (tag) => {
  if (checkouts.has(tag)) return checkouts.get(tag);
  const dir = mkdtempSync(join(tmpdir(), `imick-skills-${tag}-`));
  const r = run("git", ["clone", "--quiet", "--depth", "1", "--branch", tag, `https://github.com/${SOURCE}.git`, dir]);
  if (!r.ok) stop(`Couldn't fetch ${SOURCE} at ${tag}:\n\n\`\`\`\n${r.err}\n\`\`\``);
  checkouts.set(tag, dir);
  return dir;
};
const cleanup = () => { for (const d of checkouts.values()) rmSync(d, { recursive: true, force: true }); };
process.on("exit", cleanup);

const same = (a, b) => existsSync(a) && existsSync(b) && read(a) === read(b);

// ---- the plan

const plan = () => {
  const rec = record();
  const rels = releases();
  if (!rels.length) stop(`${SOURCE} has no releases.`);
  const target = flag("--to") ?? rels[0].tag;
  if (!rels.find((r) => r.tag === target)) stop(`No release ${target}; newest is ${rels[0].tag}.`);
  const installed = rec.version ? `v${rec.version}` : null;
  if (installed && cmpVer(installed, target) >= 0) { json({ installed, target, upToDate: true }); return; }
  const next = checkout(target);
  const base = installed && rels.find((r) => r.tag === installed) ? checkout(installed) : null;
  const layout = rec.layout ?? detectLayout();

  // Skills: installed (skills-lock.json) vs the target; new upstream skills.
  const lock = existsSync("skills-lock.json") ? JSON.parse(read("skills-lock.json")).skills ?? {} : {};
  const mine = Object.entries(lock).filter(([, s]) => s.source === SOURCE);
  const changedSkills = [], missingSkills = [];
  for (const [name, s] of mine) {
    const up = join(next, dirname(s.skillPath));
    const local = skillsDir && join(skillsDir, name);
    if (!existsSync(up)) { missingSkills.push(name); continue; }
    if (!local || !existsSync(local)) { changedSkills.push({ name, why: "missing locally" }); continue; }
    const theirs = listFiles(up).map((f) => relative(up, f)).sort();
    const ours = listFiles(local).map((f) => relative(local, f)).sort();
    const differs = theirs.join("\n") !== ours.join("\n") || theirs.some((f) => read(join(up, f)) !== read(join(local, f)));
    if (differs) changedSkills.push({ name, why: "differs upstream" });
  }
  const plugin = JSON.parse(read(join(next, ".claude-plugin/plugin.json"))).skills.map((p) => p.replace(/^\.\//, ""));
  const tracked = new Set(mine.map(([, s]) => dirname(s.skillPath)));
  const newSkills = plugin.filter((p) => !tracked.has(p)).map((p) => {
    const md = read(join(next, p, "SKILL.md"));
    return { name: p.split("/").pop(), path: p, description: (md.match(/^description:\s*"?(.*?)"?\s*$/m)?.[1] ?? "").split(/\. Use when/)[0].slice(0, 200) };
  });

  // Loop files: new template vs project file vs old template.
  const loop = [];
  const tmplDir = join(next, LOOP_TEMPLATES);
  if (existsSync(".sandcastle") && existsSync(tmplDir)) {
    for (const f of readdirSync(tmplDir)) {
      const mineF = join(".sandcastle", f), newT = join(tmplDir, f), oldT = base && join(base, LOOP_TEMPLATES, f);
      if (!existsSync(mineF)) { loop.push({ file: f, state: "missing", action: "copy" }); continue; }
      if (same(mineF, newT)) { loop.push({ file: f, state: "same", action: "none" }); continue; }
      // The template didn't change between the installed version and the target:
      // whatever differs is the project's own, and there is nothing to bring over.
      if (oldT && existsSync(oldT) && same(oldT, newT) && f !== ".env.example") { loop.push({ file: f, state: "customized, template unchanged", action: "none" }); continue; }
      if (f === "Dockerfile") {
        const ours = read(mineF), theirs = read(newT);
        const blocked = (x) => ADDITIONS.test(x) && ADDITIONS_END.test(x);
        const outside = (x) => x.replace(/# --- project additions ---[\s\S]*?# --- end project additions ---/, "");
        // The block-only merge is safe only when every project change sits inside
        // the block, i.e. the rest of the file still equals the installed template.
        const onlyBlock = blocked(ours) && blocked(theirs) && oldT && existsSync(oldT) && outside(ours) === outside(read(oldT));
        loop.push({ file: f, state: onlyBlock ? "customized inside the project-additions block only" : "customized outside the project-additions block", action: onlyBlock ? "merge-outside-block" : (oldT && existsSync(oldT) ? "merge3" : "by-hand") });
        continue;
      }
      if (f === ".env.example") {
        const keys = (s) => new Map(s.split("\n").filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l) || /^#\s*[A-Z_][A-Z0-9_]*=/.test(l)).map((l) => [l.replace(/^#\s*/, "").split("=")[0], l]));
        const theirs = keys(read(newT)), ours = keys(read(mineF));
        loop.push({ file: f, state: "diff only", action: "ask", newKeys: [...theirs.keys()].filter((k) => !ours.has(k)) });
        continue;
      }
      if (oldT && existsSync(oldT) && same(mineF, oldT)) { loop.push({ file: f, state: "uncustomized (equals the installed version's template)", action: "copy" }); continue; }
      loop.push({ file: f, state: oldT && existsSync(oldT) ? "customized" : "differs (no installed version to compare with)", action: oldT && existsSync(oldT) ? "merge3" : "by-hand" });
    }
  }

  // Tracker.
  const tracker = [];
  if (existsSync("tracker/build.mjs")) {
    if (!same("tracker/build.mjs", join(next, TRACKER, "build.mjs"))) tracker.push({ file: "tracker/build.mjs", action: "copy" });
    if (existsSync("tracker/api/index.mjs")) for (const f of ["api/index.mjs", "vercel.json", ".vercelignore"]) {
      const t = join(next, TRACKER, "vercel", f);
      if (existsSync(t) && !same(join("tracker", f), t)) tracker.push({ file: `tracker/${f}`, action: "copy" });
    }
  }

  // Triage labels: rows in the template whose Role isn't in the project's table.
  const labels = [];
  if (existsSync("docs/agents/triage-labels.md") && existsSync(join(next, LABELS_TEMPLATE))) {
    const rows = (s) => s.split("\n").filter((l) => /^\|\s*`/.test(l)).map((l) => { const c = l.split("|").map((x) => x.trim().replace(/`/g, "")); return { role: c[1], line: l, label: c[3] }; });
    const ours = new Set(rows(read("docs/agents/triage-labels.md")).map((r) => r.role));
    for (const r of rows(read(join(next, LABELS_TEMPLATE)))) if (!ours.has(r.role)) labels.push({ role: r.role, label: r.label, line: r.line });
  }

  // Changelog: the entries between the installed version and the target, with their "Existing ..." steps.
  const log = read(join(next, "CHANGELOG.md"));
  const sections = log.split(/^## (?=\d)/m).slice(1).map((s) => { const [head, ...body] = s.split("\n"); return { version: head.trim(), body: body.join("\n") }; });
  const between = sections.filter((s) => cmpVer(`v${s.version}`, target) <= 0 && (!installed || cmpVer(`v${s.version}`, installed) > 0));
  const steps = between.flatMap((s) => [...s.body.matchAll(/(Existing (?:setups|projects)|In a project already running the loop|To add it to a project)[^\n]*/g)].map((m) => ({ version: s.version, step: m[0].trim() })));

  json({
    installed, target, layout, skillsDir,
    skills: { changed: changedSkills, goneUpstream: missingSkills, new: newSkills },
    loop, tracker, labels,
    loopRunning: existsSync(".sandcastle/loop.pid"),
    changelog: { versions: between.map((s) => s.version), steps },
    note: installed ? undefined : `No ${RECORD}: ask which version is installed (the newest release whose "Existing setups" steps are already applied), then re-run with it recorded (\`record --version X.Y.Z\`). Without it, loop files can only be copied or merged by hand.`,
  });
};

// ---- apply

const apply = (file) => {
  if (!file || !existsSync(file)) stop("Usage: apply <plan.json>");
  const p = JSON.parse(read(file));
  if (p.upToDate) { json({ applied: false, reason: "up to date" }); return; }
  const next = checkout(p.target);
  const base = p.installed ? checkout(p.installed) : null;
  const done = [], manual = [];
  const agent = skillsDir === ".agents/skills" ? "*" : "claude-code";
  const copyFlag = p.layout === "copies" ? ["--copy"] : [];

  // Skills.
  const chosen = (flag("--skills") ?? "").split(",").filter(Boolean);
  const toInstall = [...p.skills.changed.map((s) => s.name), ...chosen];
  for (const name of toInstall) {
    if (p.layout === "copies" && skillsDir) { const l = join(skillsDir, name); if (existsSync(l) && lstatSync(l).isSymbolicLink()) rmSync(l); }
    const r = run("npx", ["-y", "skills@latest", "add", SOURCE, "--skill", name, "-a", agent, ...copyFlag, "-y"], { timeout: 600_000 });
    (r.ok ? done : manual).push(r.ok ? `skill ${name} installed` : `skill ${name}: install failed: ${r.err.slice(-300)}`);
  }
  if (p.layout === "copies" && existsSync(".agents") && !existsSync(".agents/skills/.keep")) {
    // The CLI may have created the universal dir even with --copy; a copies repo doesn't keep it.
    const stray = readdirSync(".agents/skills").every((n) => lstatSync(join(skillsDir, n)).isSymbolicLink() === false);
    if (stray) rmSync(".agents", { recursive: true, force: true });
  }

  // Loop files.
  for (const l of p.loop) {
    const mineF = join(".sandcastle", l.file), newT = join(next, LOOP_TEMPLATES, l.file), oldT = base && join(base, LOOP_TEMPLATES, l.file);
    if (l.action === "none") continue;
    if (l.action === "copy") { copyFileSync(newT, mineF); done.push(`.sandcastle/${l.file} copied from ${p.target}`); continue; }
    if (l.action === "merge3") {
      const r = run("git", ["merge-file", "-L", "project", "-L", p.installed, "-L", p.target, mineF, oldT, newT]);
      if (r.ok || r.status > 0) done.push(`.sandcastle/${l.file} three-way merged${r.status > 0 ? ` with ${r.status} conflict(s) to resolve (markers in the file)` : ""}`);
      else manual.push(`.sandcastle/${l.file}: merge failed: ${r.err}`);
      continue;
    }
    if (l.action === "merge-outside-block") {
      const ours = read(mineF), theirs = read(newT);
      const block = (s) => s.slice(s.search(ADDITIONS), s.search(ADDITIONS_END) + s.match(ADDITIONS_END)[0].length);
      const merged = theirs.replace(block(theirs), block(ours));
      writeFileSync(mineF, merged);
      done.push(`.sandcastle/${l.file}: template from ${p.target} with the project-additions block kept (rebuild the image)`);
      continue;
    }
    if (l.action === "ask") {
      const keys = (flag("--env-keys") ?? "").split(",").filter(Boolean);
      if (!keys.length) continue;
      // A key's line plus the comment lines that continue it (indented `#` lines
      // that introduce no other key), so a two-line note arrives whole.
      const all = read(newT).split("\n");
      const lines = [];
      all.forEach((line, i) => {
        if (!keys.some((k) => line.replace(/^#\s*/, "").startsWith(k + "="))) return;
        lines.push(line);
        for (let j = i + 1; j < all.length && /^#\s{2,}/.test(all[j]) && !/^#\s*[A-Z_][A-Z0-9_]*=/.test(all[j]); j++) lines.push(all[j]);
      });
      writeFileSync(mineF, read(mineF).replace(/\n*$/, "\n") + lines.join("\n") + "\n");
      done.push(`.sandcastle/${l.file}: added ${keys.join(", ")}`);
      continue;
    }
    manual.push(`.sandcastle/${l.file}: ${l.state}; bring the ${p.target} template's changes over by hand (diff: \`diff ${newT} ${mineF}\`)`);
  }

  // Tracker.
  for (const t of p.tracker) {
    const src = t.file === "tracker/build.mjs" ? join(next, TRACKER, "build.mjs") : join(next, TRACKER, "vercel", t.file.replace(/^tracker\//, ""));
    copyFileSync(src, t.file); done.push(`${t.file} copied`);
  }

  // Labels.
  if (!has("--no-labels") && p.labels.length) {
    const path = "docs/agents/triage-labels.md";
    writeFileSync(path, read(path).replace(/\n*$/, "\n") + p.labels.map((l) => l.line).join("\n") + "\n");
    for (const l of p.labels) {
      const r = run("gh", ["label", "create", l.label, "--force"]);
      (r.ok ? done : manual).push(r.ok ? `label ${l.label} created, row added` : `label ${l.label}: ${r.err}`);
    }
  }

  writeRecord(p.target.replace(/^v/, ""), p.layout);
  done.push(`${RECORD}: Version ${p.target.replace(/^v/, "")}`);
  const conflicts = run("git", ["grep", "-l", "^<<<<<<< project", "--", ".sandcastle"]).out.split("\n").filter(Boolean);
  json({ applied: true, done, manual, conflicts, steps: p.changelog.steps, loopRunning: p.loopRunning, imageRebuild: p.loop.some((l) => l.file === "Dockerfile" && l.action !== "none") });
};

if (cmd === "plan") plan();
else if (cmd === "apply") apply(positional[0]);
else if (cmd === "record") { const v = flag("--version"); if (!v) stop("Usage: record --version X.Y.Z"); writeRecord(v.replace(/^v/, ""), record().layout ?? detectLayout()); json({ recorded: v }); }
else stop("Usage: plan [--to vX.Y.Z] | apply <plan.json> [--skills a,b] [--env-keys K1,K2] [--no-labels] | record --version X.Y.Z");
