# Design: Adaptive Capability Disclosure

## Per-turn capability phase

The runtime derives one of four phases from task mode and typed observations:

- `inspect`: start with workspace-reading and Git-inspection tools.
- `work`: after inspection, expose mode-compatible mutation, command, test, and extension tools.
- `verify`: after a successful patch, prioritize tests, lint, diff, and read tools before another mutation.
- `repair`: after failed validation, restore patching plus focused inspection and verification tools.

The menu controls model disclosure, not execution authority. Every returned Action IR still passes through Tool Gateway and the complete contract/guard pipeline.

## Progressive Skills

Enabled Skills are available cards containing id, name, description, compatible modes, and default tools. Their full content is absent from the prompt until the model emits:

```json
{"type":"use_skill","rationale":"Use the project bugfix workflow","params":{"skill_id":"bugfix"}}
```

The runtime validates the id against the enabled cards, resolves the path inside the agent root, loads bounded content, records a typed observation, and replans. `use_skill` has no workspace effect and does not pass through Tool Gateway.

## Observability

Trace records only Skill ids/digests and menu tool names. The Web workbench derives the current menu and loaded-Skill state from Trace, keeping the display aligned with the evidence used by the runtime.
