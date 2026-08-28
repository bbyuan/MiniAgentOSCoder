# Agent Runtime Delta

## ADDED Requirements

### AR-006 Model Planner Boundary

The runtime SHALL obtain agent decisions through a `ModelClient` abstraction and SHALL parse model output into exactly one `ActionIR` before execution.

#### Scenario: Parse a model action

- GIVEN the planner receives a valid JSON model response
- WHEN the response includes `type`, `rationale`, and `params`
- THEN the runtime SHALL return an `ActionIR`
- AND append model request and model response trace events

#### Scenario: Reject malformed model output

- GIVEN the planner receives free-form text or malformed JSON
- WHEN it attempts to parse the response
- THEN the runtime SHALL reject the response
- AND no tool SHALL execute

### AR-007 Guarded Action Execution

The runtime SHALL execute parsed actions only through the `ToolGateway`.

#### Scenario: Execute an allowed action

- GIVEN an action targets a registered tool
- AND the tool effect is allowed by the active contract
- WHEN the action executor runs the action
- THEN the tool SHALL execute through the gateway
- AND the runtime SHALL append action and tool trace events

#### Scenario: Reject a blocked action

- GIVEN an action targets a missing, denied, over-budget, or approval-required tool
- WHEN the action executor runs the action
- THEN the runtime SHALL return a failed `ToolResult`
- AND append an `action.rejected` trace event
