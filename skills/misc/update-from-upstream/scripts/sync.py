#!/usr/bin/env python3
"""Mechanical half of /update-from-upstream: fetching, 3-way file comparison,
map bookkeeping and regeneration. The agent does the judgement half (resolving
conflicts, asking the user)."""

import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import io

REPO = subprocess.run(
    ["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True
).stdout.strip()
MAP_PATH = os.path.join(REPO, "sources.json")
WORK = os.path.join(REPO, ".git", "update-from-upstream")
REPORT = os.path.join(WORK, "report.json")
CACHE = os.path.expanduser("~/.cache/update-from-upstream")
SKILLS_DIR = "skills"
PLUGIN_EXCLUDED_CATEGORIES = {"in-progress"}


# ---------- helpers ----------

def run(cmd, cwd=None, check=True):
    r = subprocess.run(cmd, cwd=cwd, capture_output=True)
    if check and r.returncode != 0:
        sys.exit(f"command failed: {' '.join(cmd)}\n{r.stderr.decode()}")
    return r


def load_map():
    with open(MAP_PATH) as f:
        return json.load(f)


def save_map(m):
    with open(MAP_PATH, "w") as f:
        json.dump(m, f, indent=2)
        f.write("\n")


def load_report():
    if not os.path.exists(REPORT):
        sys.exit("no report: run `prepare` first")
    with open(REPORT) as f:
        return json.load(f)


def save_report(r):
    os.makedirs(WORK, exist_ok=True)
    with open(REPORT, "w") as f:
        json.dump(r, f, indent=2)


def entry_for(m, local_path):
    for e in m["skills"]:
        if e["local_path"] == local_path.rstrip("/"):
            return e
    sys.exit(f"{local_path} is not in sources.json")


def cache_dir(src):
    return os.path.join(CACHE, src["repo"].replace("/", "__"))


def fetch(src):
    """Blobless clone (or update) of the source; returns the head commit."""
    d = cache_dir(src)
    if not os.path.isdir(d):
        os.makedirs(CACHE, exist_ok=True)
        run(["git", "clone", "-q", "--filter=blob:none", "--no-checkout",
             f"https://github.com/{src['repo']}.git", d])
    else:
        run(["git", "fetch", "-q", "origin", src["branch"]], cwd=d)
    return run(["git", "rev-parse", f"origin/{src['branch']}"], cwd=d).stdout.decode().strip()


def read_tree(src, commit, path):
    """{relative file path: bytes} for `path` at `commit`, or None if absent."""
    d = cache_dir(src)
    if run(["git", "cat-file", "-e", f"{commit}:{path}"], cwd=d, check=False).returncode:
        return None
    data = run(["git", "archive", "--format=tar", commit, path], cwd=d).stdout
    files = {}
    with tarfile.open(fileobj=io.BytesIO(data)) as t:
        for mem in t.getmembers():
            if mem.isfile():
                rel = os.path.relpath(mem.name, path)
                files[rel] = t.extractfile(mem).read()
    return files


def changelog_since(src, commits, head, limit=12000):
    """Lines the source added to its changelog since the oldest synced commit."""
    d = cache_dir(src)
    base = commits[0]
    for c in commits[1:]:
        if run(["git", "merge-base", "--is-ancestor", c, base], cwd=d, check=False).returncode == 0:
            base = c
    diff = run(["git", "diff", "--unified=0", base, head, "--", src["changelog_path"]],
               cwd=d, check=False).stdout.decode()
    added = [l[1:] for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++")]
    text = "\n".join(added).strip()
    return text[:limit] + ("\n[…truncated]" if len(text) > limit else "")


def git_show(src, commit, path):
    r = run(["git", "show", f"{commit}:{path}"], cwd=cache_dir(src), check=False)
    return r.stdout.decode() if r.returncode == 0 else None


def list_upstream_skills(src, commit):
    """Every directory under the source's skills_root holding a SKILL.md."""
    out = run(["git", "ls-tree", "-r", "--name-only", commit, src["skills_root"]],
              cwd=cache_dir(src)).stdout.decode().split()
    return sorted(os.path.dirname(p) for p in out if os.path.basename(p) == "SKILL.md")


def rename_rules(m, source_id):
    return [(e["upstream_name"], e["local_name"]) for e in m["skills"]
            if e["source"] == source_id and e["upstream_name"] != e["local_name"]]


def rewrite(files, rules):
    """Apply the user's skill renames to incoming upstream text."""
    if files is None or not rules:
        return files
    out = {}
    for rel, data in files.items():
        try:
            text = data.decode()
        except UnicodeDecodeError:
            out[rel] = data
            continue
        for old, new in rules:
            text = re.sub(rf"(?<![\w-]){re.escape(old)}(?![\w-])", new, text)
        out[rel] = text.encode()
    return out


def read_local(local_path):
    root = os.path.join(REPO, local_path)
    files = {}
    for dirpath, _, names in os.walk(root):
        for n in names:
            if n == ".DS_Store":
                continue
            p = os.path.join(dirpath, n)
            with open(p, "rb") as f:
                files[os.path.relpath(p, root)] = f.read()
    return files


def write_file(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def frontmatter(text, key):
    m = re.search(rf"^{key}:\s*(.+)$", text, re.M)
    return m.group(1).strip().strip('"') if m else ""


def local_skill_dirs():
    out = []
    for dirpath, _, names in os.walk(os.path.join(REPO, SKILLS_DIR)):
        if "SKILL.md" in names:
            out.append(os.path.relpath(dirpath, REPO))
    return sorted(out)


# ---------- commands ----------

def cmd_check(_):
    problems = []
    dirty = run(["git", "status", "--porcelain"], cwd=REPO).stdout.decode().strip()
    if dirty:
        problems.append("working tree has uncommitted changes:\n" + dirty)
    m = load_map()
    mapped = {e["local_path"] for e in m["skills"]}
    on_disk = set(local_skill_dirs())
    for p in sorted(on_disk - mapped):
        problems.append(f"{p} is not in sources.json (unknown origin)")
    for p in sorted(mapped - on_disk):
        problems.append(f"{p} is in sources.json but missing on disk")
    if problems:
        sys.exit("\n".join(problems))
    print("ok")


def cmd_prepare(_):
    """Fetch every source and report structural changes: new, moved and
    deleted upstream skills. Writes nothing to the repo."""
    m = load_map()
    report = {"started": datetime.datetime.now().isoformat(timespec="seconds"),
              "heads": {}, "added": [], "moved": [], "deleted": [], "files": {}, "changelog": {}}
    for sid, src in m["sources"].items():
        head = fetch(src)
        report["heads"][sid] = head
        tracked = [e for e in m["skills"] if e["source"] == sid]
        if src.get("changelog_path") and tracked:
            notes = changelog_since(src, [e["synced_commit"] for e in tracked], head)
            if notes:
                report["changelog"][sid] = notes
        tracked_paths = {e["upstream_path"] for e in tracked}
        upstream = list_upstream_skills(src, head) if src["track"] == "all" else []
        untracked = [p for p in upstream if p not in tracked_paths and p not in src.get("declined", [])]
        for e in tracked:
            if read_tree(src, head, e["upstream_path"]) is not None:
                continue
            base_name = os.path.basename(e["upstream_path"])
            moved_to = [p for p in untracked if os.path.basename(p) == base_name]
            if not moved_to and src["track"] != "all":
                # listed sources: look for the skill anywhere in the repo
                moved_to = [p for p in list_upstream_skills(src, head)
                            if os.path.basename(p) == base_name]
            if moved_to:
                report["moved"].append({"source": sid, "local_path": e["local_path"],
                                        "from": e["upstream_path"], "to": moved_to[0]})
                if moved_to[0] in untracked:
                    untracked.remove(moved_to[0])
            else:
                report["deleted"].append({"source": sid, "local_path": e["local_path"],
                                          "upstream_path": e["upstream_path"]})
        for p in untracked:
            skill = git_show(src, head, f"{p}/SKILL.md") or ""
            report["added"].append({"source": sid, "upstream_path": p,
                                    "name": frontmatter(skill, "name") or os.path.basename(p),
                                    "description": frontmatter(skill, "description")})
    save_report(report)
    print(json.dumps({k: report[k] for k in ("heads", "added", "moved", "deleted")}, indent=2))
    for sid, notes in report["changelog"].items():
        print(f"\n--- {sid} changelog since last sync ---\n{notes}")


def merge_one(base, theirs, ours):
    """3-way merge of one file's bytes (None = absent).
    Returns (action, data): keep | take | merged | conflict."""
    if base == theirs or ours == theirs:
        return "keep", ours
    if base == ours:
        return "take", theirs
    if None in (base, theirs, ours):
        return "conflict", None
    tmp = os.path.join(WORK, "tmp")
    os.makedirs(tmp, exist_ok=True)
    paths = []
    for name, data in (("ours", ours), ("base", base), ("theirs", theirs)):
        p = os.path.join(tmp, name)
        write_file(p, data)
        paths.append(p)
    r = subprocess.run(["git", "merge-file", "-p", "-L", "yours", "-L", "base", "-L", "theirs",
                        *paths], capture_output=True)
    return ("merged" if r.returncode == 0 else "conflict"), r.stdout


def cmd_merge(_):
    """Apply upstream content changes to every tracked skill. Upstream-only
    changes and clean 3-way merges are written; conflicts are staged under
    .git/update-from-upstream/conflicts for the agent to resolve."""
    m = load_map()
    report = load_report()
    shutil.rmtree(os.path.join(WORK, "conflicts"), ignore_errors=True)
    files = {"take": [], "merged": [], "conflict": []}
    pending_moves = {x["local_path"] for x in report["moved"]}
    for e in m["skills"]:
        sid = e["source"]
        if sid == "own" or e["local_path"] in pending_moves:
            continue
        src = m["sources"][sid]
        head = report["heads"][sid]
        rules = rename_rules(m, sid)
        base = rewrite(read_tree(src, e["synced_commit"], e.get("base_path", e["upstream_path"])), rules) or {}
        theirs = read_tree(src, head, e["upstream_path"])
        if theirs is None:
            continue  # reported as deleted
        theirs = rewrite(theirs, rules)
        ours = read_local(e["local_path"])
        for rel in sorted(set(base) | set(theirs) | set(ours)):
            action, data = merge_one(base.get(rel), theirs.get(rel), ours.get(rel))
            target = os.path.join(REPO, e["local_path"], rel)
            label = os.path.join(e["local_path"], rel)
            if action == "keep":
                continue
            files[action].append(label)
            if action in ("take", "merged"):
                if data is None:
                    os.remove(target)
                else:
                    write_file(target, data)
            else:
                stage = os.path.join(WORK, "conflicts", label)
                for name, d in (("base", base.get(rel)), ("theirs", theirs.get(rel)),
                                ("yours", ours.get(rel)), ("merge-attempt", data)):
                    if d is not None:
                        write_file(f"{stage}.{name}", d)
    report["files"] = files
    save_report(report)
    print(json.dumps(files, indent=2))
    if files["conflict"]:
        print(f"\nconflict inputs staged in {os.path.join(WORK, 'conflicts')}")


def cmd_accept_new(a):
    m = load_map()
    report = load_report()
    src = m["sources"][a.source]
    head = report["heads"][a.source]
    files = rewrite(read_tree(src, head, a.upstream_path), rename_rules(m, a.source))
    if files is None:
        sys.exit(f"{a.upstream_path} not found at {head}")
    local_path = a.local_path or os.path.join(SKILLS_DIR, *a.upstream_path.split("/")[-2:])
    if os.path.exists(os.path.join(REPO, local_path)):
        sys.exit(f"{local_path} already exists; pass --local-path")
    for rel, data in files.items():
        write_file(os.path.join(REPO, local_path, rel), data)
    name = os.path.basename(a.upstream_path)
    m["skills"].append({"local_path": local_path, "local_name": os.path.basename(local_path),
                        "source": a.source, "upstream_path": a.upstream_path,
                        "upstream_name": name, "synced_commit": head})
    save_map(m)
    print(f"added {local_path}")


def cmd_decline(a):
    m = load_map()
    declined = m["sources"][a.source].setdefault("declined", [])
    if a.upstream_path not in declined:
        declined.append(a.upstream_path)
        declined.sort()
    save_map(m)


def cmd_move(a):
    """Follow an upstream move: record the new upstream path (the old one stays
    as the merge base until finalize) and optionally relocate the local copy."""
    m = load_map()
    e = entry_for(m, a.local_path)
    e.setdefault("base_path", e["upstream_path"])
    e["upstream_path"] = a.to
    if a.new_local_path:
        dest = os.path.join(REPO, a.new_local_path)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.move(os.path.join(REPO, e["local_path"]), dest)
        e["local_path"] = a.new_local_path
    save_map(m)
    report = load_report()
    report["moved"] = [x for x in report["moved"] if x["local_path"] != a.local_path.rstrip("/")]
    save_report(report)
    print(f"{e['local_path']} now follows {a.to}")


def cmd_remove(a):
    m = load_map()
    e = entry_for(m, a.local_path)
    shutil.rmtree(os.path.join(REPO, e["local_path"]))
    m["skills"].remove(e)
    save_map(m)
    print(f"removed {e['local_path']}")


def cmd_detach(a):
    """Keep a skill its source deleted, as your own from now on."""
    m = load_map()
    e = entry_for(m, a.local_path)
    if "upstream_path" in e:
        # The original would otherwise come back as a "new" upstream skill.
        declined = m["sources"][e["source"]].setdefault("declined", [])
        if e["upstream_path"] not in declined:
            declined.append(e["upstream_path"])
            declined.sort()
    for k in ("upstream_path", "upstream_name", "synced_commit", "base_path"):
        e.pop(k, None)
    e["source"] = "own"
    save_map(m)
    print(f"{e['local_path']} is now your own")


def cmd_finalize(_):
    m = load_map()
    report = load_report()
    marked = run(["git", "grep", "-l", "-E", "^(<<<<<<<|>>>>>>>) ", "--", SKILLS_DIR],
                 cwd=REPO, check=False).stdout.decode().split()
    if marked:
        sys.exit("conflict markers left in:\n" + "\n".join(marked))
    if report["moved"]:
        sys.exit("undecided moves: " + ", ".join(x["local_path"] for x in report["moved"]))
    for e in m["skills"]:
        if e["source"] in report["heads"]:
            e["synced_commit"] = report["heads"][e["source"]]
            e.pop("base_path", None)
    save_map(m)
    regenerate(m)
    shutil.rmtree(WORK, ignore_errors=True)
    print("finalized")


def cmd_add(a):
    """Import a skill from a new (or known) GitHub source."""
    m = load_map()
    sid = a.source_id or a.repo.split("/")[0].lower()
    src = m["sources"].get(sid)
    if src is None:
        default_branch = json.loads(run(["gh", "api", f"repos/{a.repo}"]).stdout)["default_branch"]
        src = {"repo": a.repo, "branch": default_branch, "display": a.display or a.repo.split("/")[0],
               "license_path": a.license_path or "LICENSE", "track": "listed", "declined": []}
        m["sources"][sid] = src
    head = fetch(src)
    if git_show(src, head, src["license_path"]) is None:
        sys.exit(f"no license at {src['license_path']} in {a.repo}; pass --license-path")
    files = read_tree(src, head, a.path)
    if files is None or "SKILL.md" not in files:
        sys.exit(f"{a.path} has no SKILL.md in {a.repo}@{head[:7]}")
    name = os.path.basename(a.path)
    local_name = a.name or name
    local_path = os.path.join(SKILLS_DIR, a.category, local_name)
    if os.path.exists(os.path.join(REPO, local_path)):
        sys.exit(f"{local_path} already exists")
    for rel, data in files.items():
        write_file(os.path.join(REPO, local_path, rel), data)
    m["skills"].append({"local_path": local_path, "local_name": local_name, "source": sid,
                        "upstream_path": a.path, "upstream_name": name, "synced_commit": head})
    save_map(m)
    regenerate(m)
    print(f"added {local_path} from {a.repo}@{head[:7]}")


def cmd_regen(_):
    regenerate(load_map())


# ---------- regeneration ----------

def regenerate(m):
    m["skills"].sort(key=lambda e: e["local_path"])
    save_map(m)
    regen_plugin(m)
    regen_readme(m)
    regen_notices(m)


def regen_plugin(m):
    p = os.path.join(REPO, ".claude-plugin", "plugin.json")
    with open(p) as f:
        plugin = json.load(f)
    plugin["skills"] = ["./" + e["local_path"] for e in m["skills"]
                        if e["local_path"].split("/")[1] not in PLUGIN_EXCLUDED_CATEGORIES
                        and e.get("plugin", True)]
    with open(p, "w") as f:
        json.dump(plugin, f, indent=2)
        f.write("\n")


CATEGORY_TITLES = {"engineering": "Engineering", "productivity": "Productivity",
                   "misc": "Misc", "in-progress": "In progress (not in the plugin)"}


def regen_readme(m):
    by_cat = {}
    for e in m["skills"]:
        by_cat.setdefault(e["local_path"].split("/")[1], []).append(e)
    order = [c for c in CATEGORY_TITLES if c in by_cat] + sorted(set(by_cat) - set(CATEGORY_TITLES))
    lines = []
    for cat in order:
        lines += [f"### {CATEGORY_TITLES.get(cat, cat.title())}", "",
                  "| Skill | Source | What it does |", "| --- | --- | --- |"]
        for e in sorted(by_cat[cat], key=lambda e: e["local_name"]):
            with open(os.path.join(REPO, e["local_path"], "SKILL.md")) as f:
                desc = frontmatter(f.read(), "description")
            first = desc.split(". ")[0].rstrip(".") + "." if desc else ""
            source = m["owner"] if e["source"] == "own" else m["sources"][e["source"]]["display"]
            lines.append(f"| [`{e['local_name']}`]({e['local_path']}/SKILL.md) | {source} | "
                         f"{first.replace('|', chr(92) + '|')} |")
        lines.append("")
    p = os.path.join(REPO, "README.md")
    with open(p) as f:
        readme = f.read()
    start, end = "<!-- skills:start -->", "<!-- skills:end -->"
    i, j = readme.index(start) + len(start), readme.index(end)
    with open(p, "w") as f:
        f.write(readme[:i] + "\n\n" + "\n".join(lines) + "\n" + readme[j:])


def regen_notices(m):
    out = ["# Third-party notices", "",
           "Skills in this repo that come from other authors, and the licenses they are used under.",
           "`sources.json` maps each one to its upstream path and the commit it was last synced from.", ""]
    for sid, src in m["sources"].items():
        skills = [e for e in m["skills"] if e["source"] == sid]
        if not skills:
            continue
        fetch(src)
        commit = skills[-1]["synced_commit"]
        license_text = git_show(src, commit, src["license_path"]) or "(license not found)"
        out += [f"## {src['display']}", "", f"From https://github.com/{src['repo']}:", ""]
        out += [f"- `{e['local_name']}` ← `{e['upstream_path']}` @ `{e['synced_commit'][:7]}`"
                for e in skills]
        out += ["", "```", license_text.rstrip(), "```", ""]
    with open(os.path.join(REPO, "THIRD_PARTY_NOTICES.md"), "w") as f:
        f.write("\n".join(out))


# ---------- cli ----------

def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check", help="clean tree, and every skill folder is in the map")
    sub.add_parser("prepare", help="fetch sources, report new/moved/deleted skills")
    sub.add_parser("merge", help="apply upstream content changes, stage conflicts")
    s = sub.add_parser("accept-new"); s.add_argument("source"); s.add_argument("upstream_path")
    s.add_argument("--local-path")
    s = sub.add_parser("decline"); s.add_argument("source"); s.add_argument("upstream_path")
    s = sub.add_parser("move"); s.add_argument("local_path"); s.add_argument("to")
    s.add_argument("--new-local-path")
    s = sub.add_parser("remove"); s.add_argument("local_path")
    s = sub.add_parser("detach"); s.add_argument("local_path")
    sub.add_parser("finalize", help="bump synced commits, regenerate derived files")
    s = sub.add_parser("add"); s.add_argument("repo"); s.add_argument("path")
    s.add_argument("--category", required=True); s.add_argument("--name")
    s.add_argument("--source-id"); s.add_argument("--display"); s.add_argument("--license-path")
    sub.add_parser("regen", help="regenerate plugin.json, README tables, notices")
    a = p.parse_args()
    globals()["cmd_" + a.cmd.replace("-", "_")](a)


if __name__ == "__main__":
    main()
