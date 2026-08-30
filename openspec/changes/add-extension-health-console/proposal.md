# Change: Add Extension Health Console

## Motivation
The extension runtime currently exposes Skills, MCP servers, Hooks, and trace events as separate lists. Users still need to infer whether capabilities are enabled, valid, discovered, or actually used during a run.

## Proposal
- Add a backend extension summary with enabled counts, available counts, diagnostics, discovered MCP tool count, runtime event count, failure count, and activation state.
- Render a compact Web console that highlights enabled capabilities, MCP discovery, and runtime evidence before the detailed extension lists.
- Mark enabled extension rows and show the most recent runtime signal for each Skill, MCP server, or Hook.

## Non-Goals
- Do not change extension execution semantics.
- Do not package or build a desktop application in this change.
