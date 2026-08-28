# MiniAgentOS Coder Project Spec

## Purpose

MiniAgentOS Coder turns a local coding agent into a managed runtime: actions are represented, checked, executed, traced, and reviewed through a desktop workbench.

## Product Claim

```text
Contract-first, context-aware, traceable coding-agent runtime.
```

## Non-Goals For The First Release

- Remote multi-tenant AgentPaaS deployment.
- Full IDE extension.
- Large-scale knowledge-base RAG.
- Fully concurrent multi-agent execution.
- Arbitrary remote tool execution without local approval and effect checks.

## Core Capabilities

- Compile each run into an `AgentContract`.
- Force model decisions through Action IR.
- Execute tools only through Tool Gateway.
- Apply code changes through Patch Pipeline.
- Maintain Context Pack, Memory, Budget, RunState, Checkpoints, Trace, and Report.
- Provide a desktop workbench for observation and approval.
- Support OpenSpec, AGENTS.md, and SKILL.md as development-time constraints.

## Success Criteria

- A user can open an example project and submit a bugfix task.
- The agent scans the project, plans, reads code, generates a patch, asks for approval, applies it, runs tests, repairs if needed, and produces a report.
- The run produces `trace.jsonl`, `patch.diff`, and `report.md`.
- The workbench can display plan, action, context, diff, tests, budget, contract, and trace.
- A small benchmark can compare baseline and full runtime behavior.

