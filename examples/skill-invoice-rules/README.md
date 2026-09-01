# Skill Invoice Rules

This fixture demonstrates project-specific extension surfaces:

- `.agent/skills.yaml` exposes a recommended Bugfix Skill.
- `.agent/hooks.yaml` exposes an optional `run.before` Hook.
- `.agent/mcp.yaml` exposes an optional stdio MCP server with a `lookup_rule` tool.
- `docs/tax_rules.md` provides domain rules that should enter the Context Pack.

Baseline:

```bash
python3 -m unittest discover -v
```

Expected starting state: tests fail because regional tax and exemption rules are wrong.
