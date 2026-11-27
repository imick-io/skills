---
"imick-skills": minor
---

**Design comes first.** Until now the loop built whole epics on the stock theme, and the look was repaired afterwards in a redesign epic. This release puts the stack, the look and each epic's screens in front of the build, with you in the loop.

- **New skill `/brand`**, once per product: a few questions on who uses it and how it should feel, three radically different looks of one preview screen to react to, then your pick written as `DESIGN.md` (tokens, type, components, do's and don'ts). It adds a pointer to `DESIGN.md` in `CLAUDE.md` and briefs the Design system epic, which puts the tokens, the shared components and a lint guard in code. The guard fails CI on a raw `<button>` or `<h1>`, a colour literal or an arbitrary utility value outside the shared components.
- **`/scope-decomposer` asks a new product's stack once**, recommends one from the idea itself (with its reason and the strongest alternative, to make you think), and records it as an ADR and in the initiative's new **Stack** line. A product with screens gets a **Design system** epic ahead of every epic that builds screens.
- **New label `needs-design`.** `/brief` asks, on an epic that changes what people see, whether to design its screens with you first. If so the epic keeps `ready-for-human`, and the loop plans nothing on it until `/product-design` reaches "we agree", in every mode. On supersonic, `/scope-decomposer` asks once for the whole set: the look is never assumed. `/whats-next`, `/why-sleeping` and the tracker page show these epics as yours to design.
- **Screens are reviewed as pictures.** In the loop, the builder of a ticket that changes what people see composes from `DESIGN.md` and looks at its screens before finishing, and the reviewer, who didn't build them, screenshots them and judges them against `DESIGN.md`. `/run-design-epic`'s critic reads `DESIGN.md` too.
- **`verify-epic` no longer skips the screens of an epic with no agreed screenshots.** It judges them against `DESIGN.md`; with neither, it asks a person to look.
- Autopilot planning takes an epic's agreed screens as your decisions, at 100%.

**Existing setups.** Run `/update-imick-skills`: it reinstalls the skills, offers `brand`, copies the loop's `main.mts`, `implement-prompt.md` and `review-prompt.md` and the tracker's `build.mjs`, and creates the `needs-design` label (`gh label create needs-design --color 5319e7`). Then, by hand:

1. On a product that has screens and no `DESIGN.md`, run `/brand`, then `/scope-decomposer <initiative>` to add the Design system epic.
2. Add `needs-design` and `ready-for-human` to any open epic whose screens you want to agree before it is planned. Epics already planned or building are untouched.
