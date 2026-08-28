# Design

## Runtime Boundary

The runtime treats model output as untrusted text. The planner converts that text into `ActionIR` only through `parse_action_ir`. Any free-form answer, missing field, or malformed JSON fails before tool execution.

## Components

- `ModelClient`: provider-neutral interface for model completion.
- `StaticModelClient`: deterministic model implementation used by tests and demos.
- `Planner`: builds a compact request from task, contract, context, and available tools, then parses one Action IR.
- `ActionExecutor`: receives trusted `ActionIR`, calls `ToolGateway`, converts guard/tool exceptions into structured `ToolResult`, and appends trace events.

## Trace Contract

Every action attempt should be replayable from `trace.jsonl`:

- `model.requested`
- `model.responded`
- `action.parsed`
- `tool.executed`
- `tool.failed`
- `action.rejected`

This keeps AgentOS-style observability close to the real execution path instead of only recording final UI artifacts.
