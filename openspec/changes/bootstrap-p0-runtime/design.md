# Design: Bootstrap P0 Runtime

## Context

The repository currently contains the project design and specification scaffold. There is no runnable backend, frontend, daemon, or agent loop yet. This change creates the first implementation skeleton while preserving the system's main idea: model decisions must pass through runtime contracts, structured action parsing, guards, tool gateway, and trace.

## Goals

- Create a backend scaffold that can own the local runtime.
- Create a frontend scaffold that can become the desktop workbench UI.
- Define core models before writing complex orchestration logic.
- Make the run lifecycle observable from the first version.
- Keep P0 local-first and demo-ready.

## Non-Goals

- Do not implement production Electron packaging in this change.
- Do not implement full remote MCP support in this change.
- Do not implement true concurrent subagents in this change.
- Do not implement long-term memory UI in this change.

## Backend Shape

```text
backend/app/
  main.py
  models/
    action.py
    contract.py
    context.py
    run.py
    tool.py
    trace.py
  runtime/
    agent_loop.py
    contract_compiler.py
    state_machine.py
    tracer.py
  tools/
    gateway.py
    builtin.py
    patch_pipeline.py
  guards/
    schema_guard.py
    path_guard.py
    command_guard.py
    budget_guard.py
    secret_sensor.py
  context/
    workspace_scan.py
    indexer.py
    pack_builder.py
  api/
    projects.py
    runs.py
    approvals.py
    trace.py
```

## Frontend Shape

```text
frontend/src/
  app/
  pages/
    Workbench.tsx
  components/
    ChatPanel.tsx
    PlanPanel.tsx
    DiffPanel.tsx
    ContextPanel.tsx
    ContractPanel.tsx
    TracePanel.tsx
    ApprovalPanel.tsx
  api/
    client.ts
  stores/
    runStore.ts
```

## Runtime Boundary

The model never calls tools directly. It emits Action IR. The runtime parses the action, checks the active AgentContract, runs guards, asks for approval if needed, executes through Tool Gateway, and records the result as an Observation.

```text
user_task
  -> compile AgentContract
  -> build ContextPack
  -> call model
  -> parse ActionIR
  -> guard + budget + approval
  -> Tool Gateway
  -> Observation
  -> TraceEvent
```

## Daemon API Boundary

The daemon API is documented in `openspec/api-contract.md`. The frontend workbench and future CLI companion must use this shared boundary instead of importing backend internals.

P0 API groups:

```text
projects: open project, get current project
runs: create run, inspect run, cancel run
approvals: approve or deny waiting action
trace: stream events, fetch trace, replay run
context: inspect and compact Context Pack
```

## Skill Registry

Skill files are stored under `.agent/skills/*/SKILL.md`, but the runtime should first read `.agent/skills.yaml` as the skill card registry.

Startup behavior:

```text
load .agent/skills.yaml
  -> validate skill ids and paths
  -> register skill cards
  -> load full SKILL.md only when selected by mode or action
```

## Key Decisions

### Decision 1: File-backed P0 persistence

P0 stores traces, reports, patches, project profile, and indexes as files. This makes the first version easy to inspect and demo.

### Decision 2: Explicit models before agent intelligence

P0 starts with data models and runtime interfaces. Even if the first model loop is simple, the boundaries must already exist.

### Decision 3: Workbench panels can be first-pass

The first workbench does not need polished desktop packaging, but it must show the runtime objects: plan, contract, context, diff, tests, approvals, and trace.

## Persistence

P0 uses files first:

```text
runs/{run_id}/trace.jsonl
runs/{run_id}/report.md
runs/{run_id}/patch.diff
.agent/project-profile.json
.agent/index/*.json
```

SQLite can be introduced in P1 when run history and memory editing become richer.

## Risks And Trade-offs

| Risk | Mitigation |
|---|---|
| Too much UI before runtime works | Build backend models and trace first, then expose them in basic panels |
| Model loop becomes unsafe | Keep Action IR, Guard, Approval, and Tool Gateway in P0 |
| Context selection is too shallow | Implement file metadata, simple symbol extraction, and ranked snippets before advanced retrieval |
| Patch application breaks user files | Require dry-run, approval, snapshot, and trace |
| Frontend and backend drift | Keep `openspec/api-contract.md` as the shared boundary |
| Skills become prompt clutter | Load `skills.yaml` cards first and progressively disclose full `SKILL.md` |

## Open Questions

- Which OpenAI-compatible model endpoint should be used first during local development?
- Should backend use `uv` or plain `venv + pip` for the first scaffold?
- Should frontend use `npm` or `pnpm` for the first scaffold?
