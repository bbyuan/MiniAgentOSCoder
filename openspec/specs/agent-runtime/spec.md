# Agent Runtime Spec

## Requirements

### AR-001 AgentContract Compilation

The runtime SHALL compile each user task, project profile, active mode, and policy config into an `AgentContract` before the agent loop begins.

#### Scenario: Compile a bugfix contract

- GIVEN a user starts a Bugfix run
- AND project profile and `.agent/config.yaml` are available
- WHEN the runtime prepares execution
- THEN it SHALL produce an `AgentContract` with roles, effects, policies, and cost envelope

### AR-002 Action IR Boundary

The model SHALL only request effects by producing structured Action IR. The runtime SHALL reject free-form tool execution.

#### Scenario: Reject a free-form tool request

- GIVEN the model returns text that asks to run a shell command without Action IR
- WHEN the runtime parses the response
- THEN it SHALL reject the response
- AND record a guard failure observation

### AR-003 Run State Machine

The runtime SHALL track run status with explicit states: `created`, `scanning`, `planning`, `running`, `waiting_approval`, `applying_patch`, `testing`, `repairing`, `completed`, `paused`, `cancelled`, and `failed`.

#### Scenario: Move from approval to testing

- GIVEN a run is `waiting_approval`
- WHEN the user approves a patch
- THEN the runtime SHALL move to `applying_patch`
- AND after the patch applies it SHALL move to `testing`

### AR-004 Trace

The runtime SHALL append model calls, parsed actions, guard decisions, tool calls, approvals, observations, checkpoints, and final status to `trace.jsonl`.

#### Scenario: Record a guarded tool call

- GIVEN an action passes guard checks and invokes a tool
- WHEN the tool returns
- THEN the runtime SHALL append action, guard, tool call, and observation events

### AR-005 Checkpoint

The runtime SHALL create checkpoints before patch application, before approval waits, and after context compaction.

#### Scenario: Save before applying patch

- GIVEN a patch has passed dry-run and user approval
- WHEN the runtime is about to apply the patch
- THEN it SHALL create a checkpoint containing run state, context summary, changed files, and trace offset
