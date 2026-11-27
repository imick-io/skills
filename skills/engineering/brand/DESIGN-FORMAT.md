# The shape of DESIGN.md

`DESIGN.md` has two halves: **tokens** in the frontmatter, exact values a theme file copies, and **prose** below, the reasons and rules no token can carry. A builder reads the tokens; a reviewer reads the prose.

````markdown
---
name: <the look's name>
description: <one sentence: the idea, and the reference it grew from>
colors:
  background: "#f7f4ec"
  foreground: "#142057"
  primary: "#2238c4"
  primary-foreground: "#f7f4ec"
  # every colour role the UI library names: card, popover, secondary, muted,
  # accent, destructive, success, warning, info, border, input, ring,
  # sidebar-*, chart-1 to chart-5
  dark-background: "#080e22"
  # the same roles again, prefixed dark-, when the product has a dark theme
typography:
  display: { family: "<font>", weight: 600, size: "2rem", line: 1.2 }
  title: { ... }
  body: { ... }
  label: { ... }
  mono: { ... }
rounded: { control: "0.25rem", card: "0.25rem", dialog: "0.375rem", pill: "9999px" }
spacing: { unit: "0.25rem", page: "1.5rem", section: "2rem", stack: "0.75rem" }
components:
  button: { height: "2.25rem", radius: "control", weights: "primary, secondary, ghost, destructive" }
  # one line per shared component the product needs: input, table, card,
  # dialog, page-header, empty-state, banner, badge...
---

# <the look's name>

## Overview
<five lines: who uses it, how it should feel, what it is modelled on>

## Colors
<what each role is for, and the rule for mixing new tones>

## Typography
<which face speaks where; numbers; the scale's steps and when to use each>

## Layout
<page width, grid, spacing rhythm, density, the phone viewport>

## Elevation and depth
<borders or shadows, and which surfaces float>

## Shapes
<corner radii by element>

## Components
<one short paragraph per shared component: its variants, states and when to use it>

## States
<how loading, empty, error and read-only look, and what each must say>

## Do's and don'ts
<the judgement calls: pairs of "do this / not that" a reviewer can cite>

## References
<the products and screens the look was drawn from, linked>
````

Every colour the UI library can ask for has a value, in each theme: a role left out is a role some page will invent. **Do's and don'ts** carries only what a lint rule can't check; what one can (a raw `<button>`, a hex colour in a page) belongs in [LINT.md](LINT.md)'s guard instead.
