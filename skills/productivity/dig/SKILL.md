---
name: dig
description: Dig into one grilling question in the background (why it matters, the options, what competitors do) and come back with a sharper recommendation.
disable-model-invocation: true
---

# Dig

A grilling round has a question the user can't settle on instinct: a low-confidence recommendation, a "Hinges on" they want to understand. Dig into it **in the background** while the round goes on, and come back with a **brief** that makes the decision easier: why it matters, the options, what others do, and a revised recommendation.

`/research` establishes what is true; `/dig` helps choose. Dig uses `/research` for its factual legs.

## Run

1. **Pick the question.** `/dig Q3` is question 3 of the current round. A bare `/dig` is the round's lowest-confidence question. Anything else (`/dig how do booking tools handle price overrides?`) is a free question. Restate it in one line, with the decisions already settled that bear on it.

2. **Know the competitors.** Read `docs/agents/competitors.md`. If it doesn't exist, ask the user once for the products to compare against (names, URLs, and why each is relevant), then write the file:

   ```markdown
   # Competitors

   Products to compare against when digging into product decisions.

   | Product | URL | Why it's relevant |
   | --- | --- | --- |
   | <name> | <url> | <what overlaps with us> |
   ```

   With no repo underneath, keep the list in the conversation instead.

3. **Dispatch** one background subagent with a self-contained prompt (it can't see this conversation): the question, the settled decisions and product context that bear on it, the competitor list, and the brief format below. Its legwork:
   - Work out what the answer **changes** downstream: what each option makes easy or hard later.
   - For each competitor, find how they handle it, from what they publish: product docs, help centre, pricing page, changelog, public demos, API docs. Link every claim to where it was seen; mark anything inferred rather than seen.
   - Note comparable products beyond the list when they handle it notably well or differently, as suggestions.
   - For a factual sub-question (an API's limits, a standard's rule), call the Skill tool with "research".

4. **Carry on.** The question is unsettled until the brief lands; tell the user it's being dug into and continue the round with the rest of the frontier.

5. **Deliver** the brief when the subagent reports, then re-ask the question with the revised recommendation and confidence in the grilling format. Offer any suggested new competitors for the user to approve; append the approved ones to `competitors.md`.

## The brief

```markdown
🔎 **Dig: Q<n> - <question title>**

**Why it matters:** <what changes depending on the answer; what each choice makes easy or hard later>

**Options:**
- **<option>**: <trade-offs>
- **<option>**: <trade-offs>

**What others do:**
- **<competitor>**: <how they handle it> ([source](<url>))
- **<competitor>**: <how they handle it> (inferred: <from what>)

**Recommendation:** (<new %>, was <old %>) <recommendation>. <what moved the confidence>
```

Keep it to what bears on the decision: a page the user reads in two minutes, not a report.
