# Add Agent Action Executor

## Why

The current runtime can create runs, compile contracts, build context packs, and expose artifacts to the workbench. The missing middle layer is the actual agent boundary: a model decision must become structured Action IR, pass runtime guards, execute through the Tool Gateway, and be written into the trace.

## What Changes

- Add a `ModelClient` abstraction with deterministic local implementation for tests and demos.
- Add a planner that asks a model client for exactly one Action IR decision.
- Add an action executor that routes parsed actions through the guarded `ToolGateway`.
- Trace model responses, parsed actions, successful tool calls, failed tool calls, and rejected actions.

## Out Of Scope

- Real external model provider calls.
- Multi-step autonomous repair loops.
- Approval continuation after a blocked tool.
