# Skills

My agent skills, straight from my `.claude/skills` directory.

## Installation

### Claude Code (plugin)

```
/plugin marketplace add imick-io/skills
/plugin install imick-skills@imick
```

### Any agent (skills.sh)

```bash
npx skills@latest add imick-io/skills
```

## Skills

### Engineering

| Skill | What it does |
| --- | --- |
| [`plan-work`](skills/engineering/plan-work/SKILL.md) | Read-only planning for an issue: fetches it, explores the code, and produces a plan with an explicit Approach (RGR or direct). |
| [`do-work`](skills/engineering/do-work/SKILL.md) | Implements the approved `/plan-work` plan, running typecheck and tests with a capped self-fix loop. Never commits. |
| [`review-work`](skills/engineering/review-work/SKILL.md) | Refactor-only review pass over a recent commit, applying the project's coding standards without changing behaviour. |
| [`thermo-nuclear-code-quality-review`](skills/engineering/thermo-nuclear-code-quality-review/SKILL.md) | An extremely strict maintainability review: abstraction quality, giant files, spaghetti conditions. |

## Adding a skill

1. Create `skills/<category>/<skill-name>/SKILL.md` with `name` and `description` frontmatter.
2. Add its path to `skills` in [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) and a row to the table above.
3. To use it locally before publishing: `ln -s "$PWD/skills/<category>/<skill-name>" ~/.claude/skills/<skill-name>`

## License

MIT
