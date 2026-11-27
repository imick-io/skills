---
name: brand
description: Choose a product's look with the user, from a few radically different looks on one preview screen to the DESIGN.md every screen is built and reviewed against.
disable-model-invocation: true
---

# Brand

A product built screen by screen on a stock theme ends up looking like the stock theme, and repainting it later is an epic of its own. A **brand** settles the look once, before the first screen is built: the user reacts to real **looks**, picks one, and it is written down as `DESIGN.md`, the one source every UI ticket composes from and every design review judges against.

Run it once per product, right after `/scope-decomposer`. With a `DESIGN.md` already there, a run revises it.

## Run

1. **Load** what is already decided: the stack's ADR, the initiative's Destination, `DESIGN.md` if it exists, the **Design system** epic if `/scope-decomposer` created one, and in the code the UI library and the file its tokens live in.

2. **Grill, briefly.** Call the Skill tool with "grilling" and ask only what shapes a look:
   - who uses it and where (a phone on a shop floor, a desk all day),
   - three words for how it should feel,
   - products whose look they admire, as links or screenshots,
   - what is already fixed (a logo, a colour, a font),
   - light, dark, or both.

   Done when you can brief a designer in five lines. Write those five lines back and have the user confirm them.

3. **Build three looks** of one **preview screen**, by calling the Skill tool with "prototype" (its UI branch). The preview screen holds what every page is made of: a page header with a title and a primary action, a form with a validation error, a table with numbers, a card, an empty state and a dialog, in each theme the user asked for. Each look has a name and a one-line idea, and the three disagree on palette, type, density, shape and depth, not on hue alone.
   - **An app exists**: the preview is a dev-only route in the app's own stack.
   - **No app yet**: one self-contained HTML file with the same switcher.

4. **Iterate live.** Screenshot each look to check your work before showing it. The user picks one or mixes them ("the type from B on A's colours"); rebuild until they say the look is agreed. That call is theirs alone.

5. **Write `DESIGN.md`** at the repo root, in the shape [DESIGN-FORMAT.md](DESIGN-FORMAT.md) gives. Check every text and background pair for WCAG AA contrast in each theme and fix the tokens before writing them down.

6. **Point at it.** Add this section to the project's `CLAUDE.md` (or `AGENTS.md`):

   ```markdown
   ### Design

   `DESIGN.md` is the product's look: tokens, type, components, do's and don'ts. Read it before building or reviewing anything people see.
   ```

7. **Brief the Design system epic.** It is the epic that turns `DESIGN.md` into code, and it blocks every epic that builds screens. Write its Brief in `/brief`'s template:
   - **Must have**: `DESIGN.md`'s tokens, exactly, in the theme file, in each theme; the shared components `DESIGN.md` lists; the preview screen kept as a dev-only route, the living reference; the lint guard in [LINT.md](LINT.md), running in CI.
   - **Must not**: a page styling its own one-off where a shared component exists.

   Then ask `/brief`'s mode question and set its labels as `/brief` does. With no such epic (a product that already has screens), say what one would hold and suggest `/scope-decomposer <initiative>` to add it.

8. **Capture and hand off.** Keep the looks as the prototype skill says (a `prototype/brand` branch, out of main) and commit `DESIGN.md` and the pointer the way this project lands changes. Report the look in three lines, then the next step: `/brief` for the first epic, and `/product-design <epic>` for each epic labelled `needs-design`.
