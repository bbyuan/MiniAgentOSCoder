# Change: Bootstrap P0 Runtime

## Why

MiniAgentOS Coder needs to start from enforceable runtime boundaries rather than a loose chat interface. The first runnable version must prove that a coding agent can be represented, checked, executed, traced, and reviewed through a local runtime.

P0 establishes the foundation for later desktop product work: `AgentContract`, Action IR, Tool Gateway, Context Pack, Patch Pipeline, RunState, and Trace.

## What Changes

- Add backend and frontend scaffolds.
- Add core runtime models for actions, contracts, runs, tools, context, trace, and approvals.
- Add the first runtime loop boundary: compile contract, parse action, check guards, execute through gateway, record observation.
- Add project scan and Context Pack skeleton.
- Add Patch Pipeline interfaces and approval boundary.
- Add trace JSONL output and final report output.
- Add shared daemon API contract for backend, workbench, and CLI.
- Add skill registry metadata for loading task skills.
- Add a first-pass workbench shell for task input, status, and runtime panels.

## Capabilities

- **agent-runtime**: Create runs, compile contracts, parse actions, track states, checkpoint, and trace execution.
- **tool-gateway**: Register tools, enforce effects and guards, route built-in tools, and define Patch Pipeline.
- **context-manager**: Scan projects, index workspace files, and build explainable Context Packs.
- **desktop-workbench**: Provide the first UI shell for starting runs, viewing state, and approving actions.

## Out Of Scope

- Production Electron packaging.
- Full MCP ecosystem.
- Full benchmark dashboard.
- Real concurrent subagents.
- Remote AgentPaaS deployment.

## Impact

- Adds `backend/`, `frontend/`, and runtime module structure.
- Adds daemon API boundaries for projects, runs, approvals, context, and trace.
- Adds `.agent/skills.yaml` as the initial Skill Registry source.
- Creates local runtime outputs under `runs/` and `.agent/index/`.
- Sets the implementation path for the first demo-ready coding-agent loop.
