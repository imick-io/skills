---
name: product-design
description: Build an epic's real UI with the user, from a fast mockup on mock data to production tickets, so human and agent share one vision of the product.
disable-model-invocation: true
---

# Product design

Words leave a feature abstract; a screen makes it shared. This skill builds the **UI of an epic** with the user, in the product itself, until both of you see the same thing. Unlike `/prototype`, which is throwaway code answering one question, this UI stays: it starts as a mockup and ends as production code.

It runs in two **phases**, and the epic's **Design section** says which one you're in:

1. **Explore**: a fast mockup on mock data, iterated live with the user until they say the design is agreed.
2. **Productionize**: the agreed mockup becomes a UI spec and production tickets. See [PRODUCTIONIZE.md](PRODUCTIONIZE.md), reached only once the user has said "we agree".

It can be called at any point in an epic's life: before its map to see where it lands, during the map when a decision needs a screen, or after it.

## Start

The input is an epic (issue or local path) or a plain description. A description means no tracker: skip every tracker step below and work on a branch named for the feature.

1. **Load the epic**: its Destination, Notes and Design section; its map's Decisions so far and its spec, if they exist; `CONTEXT.md`; the area and owner in `docs/agents/team.md`. The tracker operations are in the tracker doc; if none has been provided, tell the user to run `/setup-imick-skills`.
2. **Find the phase** in the Design section. No section yet means explore, from scratch. `agreed` or later means the work has moved to tickets: say so and stop unless the user asks to reopen the design.
3. **Check out the epic branch** named in the epic's body. If it doesn't exist yet, create it from the default branch and tell the user.
4. **Learn the UI stack**: the routing convention, the design system and component library, how data is fetched, and how the app is run (the `run` skill covers launching).

## Explore

Build the mockup **at the feature's real route**, in the app's own stack. It is throwaway in quality, never in location: the productionize pass upgrades it in place.

- **Mock data** lives only in a `mocks/` folder next to the feature, typed in the shape the real API will have, each file headed `// MOCK: replaced by the real API before the epic merges`. Nothing else in the feature invents data.
- **Design system first.** Compose from the project's components and tokens. You are free to go beyond them when the product calls for it; every time you do, flag it to the user as `New: <what>, not in the design system` so it is approved consciously, and add it to the Design section's **New** list.
- **Open questions get variants.** When the user can't yet say what they want ("calendar grid or list?"), call the Skill tool with "prototype" to build variants, let the user pick, then build the pick into the mockup.

Iterate with the user live: run the dev server, open the route in the browser, and screenshot after each change to check your work before showing it. The user reacts, you edit, the page reloads. Keep going until the user says the design is agreed; that call is theirs alone.

**Record as you go**, at the end of every session at the latest:

- **Decisions.** When a significant UI decision lands ("prices are edited in a side panel") and the epic has a map, record it on the map: create a `wayfinder:prototype` ticket under the map, post the decision as its resolution, close it, and append it to the map's Decisions so far.
- **Code.** Commit the mockup to the epic branch and push, so the preview updates.
- **Design section**, in the epic body, replacing the previous one:

```markdown
## Design

**Phase:** exploring
**Routes:** <routes, each linked to the preview>
**Preview:** <preview URL of the epic branch, if the project has one>
**New:** <things added beyond the design system, or "none">
**Next:** When the design is agreed, run `/product-design <this epic>` and say "we agree". It commits the agreed screenshots, writes the UI spec with `/to-spec`, then cuts tickets with `/to-tickets`.
```

When the user says the design is agreed, read [PRODUCTIONIZE.md](PRODUCTIONIZE.md) and follow it.
