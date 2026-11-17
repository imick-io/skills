---
"imick-skills": minor
---

In fast and supersonic mode, the agent loop now reads a verified epic PR's checks before merging. If any check is red, it files a `ready-for-agent` bug under the epic (once per head commit) with the failing checks, so an agent fixes CI on the epic branch and the epic then re-verifies and merges. Before, the loop tried to merge, GitHub refused, and the loop pinged you once and then waited. The epic sat verified but unmerged until someone noticed. While a check is still pending, the loop waits. A merge GitHub refuses for any other reason, such as a required review, is still asked of you.
