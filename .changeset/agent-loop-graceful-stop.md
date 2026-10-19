---
"imick-skills": minor
---

Agent loop: stop it nicely, and Ctrl-C no longer breaks the next run.

- `npm run agents:stop` (new script, see `setup-imick-skills` section F) asks a running loop to start nothing new, let its in-flight tickets land, then exit and post to Slack, so you can close the machine once the message arrives. Starting the loop clears a leftover stop request.
- Ctrl-C still quits at once, but the loop first releases the tickets it had claimed and the `agent:planning` / `agent:unblocking` labels it had set, so the next start picks the work back up instead of skipping it as "someone's on it".
- The loop now runs on Node's own type stripping instead of `tsx`: tsx ran it in a child process and hard-killed that child on Ctrl-C whenever the loop was inside a `gh` or `git` call, which is why claims kept being left behind. Existing setups: change the `agents` script to `node --env-file-if-exists=.sandcastle/.env .sandcastle/main.mts`, add `agents:stop`, add `STOP` to `.sandcastle/.gitignore`, and copy the new `main.mts`.
- Tracker: a finished epic (every ticket closed, nothing left to plan) now shows as "Built and verified; merge its PR" instead of "Building", and appears in your action items with a link to its PR.
