---
"imick-skills": minor
---

Triage now splits an issue that bundles several asks into one issue per ask. You can paste a client's long email into an issue as is, without reading it.

- **What it does:** when an issue asks for several separate things (three bugs, a bug plus two small changes, feedback mixed with requests), triage creates one child issue per ask. Each child quotes the client's own words, says `Split from #n`, and is triaged on its own:
  - a bug goes to the debugging queue, where the loop reproduces and fixes it;
  - a small change gets an agent brief;
  - a big feature becomes `needs-scoping`;
  - an unclear ask becomes `needs-info`.
- **The original issue** gets a summary comment: a task list of its children, plus any feedback with nothing to act on. It's labelled `split`, a new role that, like `backlog`, sits in nobody's inbox. You close it once the children are done.
- **Limits:**
  - Only separate asks are split. Two sentences about the same problem stay one issue, and a single big ask still goes to `needs-scoping`.
  - With more than ten asks, the whole issue goes to `needs-scoping` instead.
  - In manual `/triage`, the split is recommended first and waits for your go.
- **Workflow:** the triage workflow (and the loop's triage) may now run `gh issue create`, and creates the `split` label. No new secret, and the caller workflow is unchanged.
- **Other skills:** the tracker and `/why-sleeping` treat a split issue as a summary, not a ticket.

For a project already set up, `/update-imick-skills` adds the `split` row to `docs/agents/triage-labels.md` and creates the label.
