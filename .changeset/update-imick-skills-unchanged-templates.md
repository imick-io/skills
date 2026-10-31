---
"imick-skills": patch
---

`/update-imick-skills` fix: a loop file whose template did not change between the installed version and the target is now left alone, whatever the project did to it; and the Dockerfile's block-only merge is used only when every project change sits inside the `# --- project additions ---` block. A Dockerfile customized outside the block (an extra apt package, a pinned Playwright version) is three-way merged instead, so those edits survive. Found on the first real run: the block merge had dropped two such lines.
