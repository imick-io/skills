# Reproducing in the browser

For a bug the user sees in the UI. You usually can't script it yet: you don't know the exact steps, state or data that trigger it. **Explore in a real browser until it shows up, then freeze what you did into a script.** The frozen script is your Phase 1 loop; the exploration is how you find it.

## 1. Pick a browser

Use the first one that works in this environment, and say which you're using:

1. **Claude in Chrome** (the `mcp__claude-in-chrome__*` tools): the user's real Chrome. Best fidelity, since it sees what the user's browser sees. Work in a **new tab**, and never act on the user's own accounts beyond what reproducing needs.
2. **`agent-browser`**: call the Skill tool with "agent-browser" when Chrome isn't connected or available (an unattended run, a CI box, a remote session).
3. **Playwright MCP** (the `mcp__playwright__*` tools), when neither of the above is available.

If none is available, fall back to writing a Playwright script blind from the reporter's steps (Phase 1, way 4), and say the reproduction was never observed live.

## 2. Get to the bug

- **Run the app**: the project's dev server (call the Skill tool with "run" when you don't know how), or the preview URL of the branch the bug was reported against.
- **Sign in** only with test accounts from the project's seed, fixture or example-config files, and only on a local or preview host. Never use the user's real credentials or a production account; if the bug only shows with real data, stop and ask.
- **Recreate the state** the report implies (the right page, data, role, viewport) before following the steps.

## 3. Follow the reporter's steps

Do exactly what the report says, one step at a time. After each step, take a screenshot and check the console and failed network requests. Watch for the **user's symptom**, not just any error: a nearby failure is a different bug.

When the steps don't trigger it, vary one thing at a time (browser size, account role, data, timing, a hard reload) and note what you tried.

## 4. Capture the evidence

When it shows up, keep, redacted per the main skill:

- the screenshot showing the symptom,
- the console errors and the failing requests (method, URL, status, the relevant lines of the response),
- the exact steps, starting URL and account role that got there.

This is what goes into the bug report, and what the frozen script must match.

## 5. Freeze it into the loop

Turn the steps into a **Playwright script** (or test, if the project already has Playwright tests) that drives the same steps headlessly and **asserts on the symptom**: the wrong text, the missing element, the console error, the failing request. Run it and watch it go red.

That command is your Phase 1 loop: tighten it there (pin data, skip unrelated navigation, wait on the specific request rather than a timeout) and carry on with the main skill.

If the symptom only shows in the live browser and never headlessly, say so: that difference is itself a clue (timing, extensions, cached state, real data), and the HITL script in `scripts/` becomes the fallback loop.
