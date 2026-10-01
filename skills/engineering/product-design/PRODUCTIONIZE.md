# Productionize

The user has said the design is agreed. Turn the mockup into a spec and production tickets. You do not refactor the code yourself: the tickets do, one agent session each.

1. **Freeze the reference.** Screenshot every agreed screen and every state you built. Commit them to the branch `design/NN-<slug>` (the epic's number and slug; for a plain description, `design/<slug>`), a branch that never merges: create it as an orphan holding only the screenshots, using a separate worktree so the epic branch's checkout is untouched, and push it. These screenshots are the acceptance bar every ticket is checked against, so they must outlast the mockup code.

2. **Mark it agreed.** Update the Design section: `**Phase:** agreed`, an **Agreed screenshots** line linking the `design/NN-<slug>` branch, and **Next:** "Writing the UI spec and tickets."

3. **Write the UI spec.** Call the Skill tool with "to-spec". Its input is this design: the agreed behaviours from the conversation (rules, interactions, what happens on save, on error, on leaving with unsaved edits), the mockup's routes and the screenshots. Title it `UI spec: <epic>`, publish it under the epic in its milestone, and link the map's spec when one exists. It stays a separate issue so neither spec grows toward the tracker's size limit.

4. **Cut the tickets.** Call the Skill tool with "to-tickets", reading the UI spec and the mockup. Cut them as:
   1. **Foundation**: the shared components and the data boundary (a hook or client the screens read from, backed by the `mocks/` data for now). Every other UI ticket is blocked by it.
   2. **One ticket per screen or region**: upgraded to production end to end, on the design system, with every state the UI spec lists (empty, loading, error, edge cases).
   3. **Replace mock data with the real API**: deletes the `mocks/` folder and points the data boundary at the real backend. Blocked by the backend tickets that provide that API; if they don't exist yet, say so in its body.

   Every ticket links the agreed route and the `design/NN-<slug>` screenshots, and its acceptance criteria include "matches the agreed screenshots".

5. **Hand off.** Update the Design section: `**Phase:** productionizing`, and **Next:** the first unblocked ticket, by name. Report the UI spec and tickets created, by name with links.
