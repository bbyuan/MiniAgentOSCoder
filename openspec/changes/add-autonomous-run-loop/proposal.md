# Add Autonomous Run Loop

## Why

The runtime can execute one model-selected action, but a coding task requires repeated planning: inspect code, observe tool output, adjust the next action, and stop with a final answer. Without a bounded loop, the orchestrator cannot perform even a deterministic multi-step task or demonstrate that the AgentContract cost envelope is enforced during execution.

## What Changes

- Add a typed autonomous run loop that repeatedly plans and executes Action IR.
- Feed structured tool observations into subsequent model requests.
- Add a reserved `finish` control action for explicit successful termination.
- Enforce step, model-call, token, tool-call, and wall-time budgets from the AgentContract.
- Record loop steps, observations, budget decisions, and terminal status in the trace.
- Add a queued deterministic model client for multi-step runtime tests.

## Out Of Scope

- Calls to an external model provider.
- Resuming approval-required actions.
- Patch generation and repair prompting.
- Persisting an active loop across daemon restarts.

