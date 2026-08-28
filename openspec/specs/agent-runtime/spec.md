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

### AR-006 Model Planner Boundary

The runtime SHALL obtain agent decisions through a provider-neutral model client and parse each response into exactly one Action IR before execution.

#### Scenario: Reject malformed model output

- GIVEN the model returns free-form text or malformed JSON
- WHEN the planner parses the response
- THEN the runtime SHALL reject the response
- AND no tool SHALL execute

### AR-007 Guarded Action Execution

The runtime SHALL execute parsed effectful actions only through the Tool Gateway.

#### Scenario: Execute an allowed action

- GIVEN an action targets a registered tool whose effect is allowed
- WHEN the action executor runs the action
- THEN the tool SHALL execute through the gateway
- AND the runtime SHALL append action and tool trace events

### AR-008 Bounded Autonomous Run Loop

The runtime SHALL repeatedly plan one Action IR, execute it through the guarded runtime, and feed typed observations into the next model request until explicit completion or budget exhaustion.

#### Scenario: Complete a multi-step run

- GIVEN the model requests a tool and then returns `finish`
- WHEN the autonomous loop executes
- THEN the tool observation SHALL be included in the next planning request
- AND the run SHALL complete with a final message

#### Scenario: Stop at a contract budget

- GIVEN a run reaches a step, model-call, token, tool-call, or wall-time limit
- WHEN the loop attempts to continue
- THEN the runtime SHALL stop before the next prohibited effect
- AND append a machine-readable budget event

### AR-009 Model Provider Adapter

The runtime SHALL construct an OpenAI-compatible model client from project configuration and environment variables without exposing credentials through configuration files, traces, errors, or daemon responses.

#### Scenario: Complete a provider request

- GIVEN provider configuration, a model name, and the configured API key environment variable are available
- WHEN the runtime requests the next model action
- THEN the client SHALL send messages to the compatible Chat Completions endpoint
- AND return response content and usage as a `ModelResponse`

#### Scenario: Diagnose missing model configuration

- GIVEN a model name or API key environment variable is missing
- WHEN a client or workbench checks provider readiness
- THEN the runtime SHALL report the missing configuration before any network request
- AND SHALL NOT expose credential values

### AR-010 Daemon Run Worker

The Daemon SHALL execute prepared runs in a background worker and synchronize loop status, budget, observations, and final output to the Run API.

#### Scenario: Start a prepared run

- GIVEN a run is planning and model configuration is valid
- WHEN the client starts the run
- THEN the Daemon SHALL transition it to running
- AND execute its AgentContract through AgentRunLoop and Tool Gateway

#### Scenario: Cancel at a safe boundary

- GIVEN a run is active
- WHEN cancellation is requested
- THEN AgentRunLoop SHALL stop before starting the next model or tool effect
- AND finish with cancelled status

### AR-011 Live Trace Stream

The Daemon SHALL expose an ordered SSE stream of Trace events with cursor-based continuation.

#### Scenario: Close after terminal event

- GIVEN a run is completed, failed, or cancelled
- WHEN all remaining Trace events have been sent
- THEN the SSE stream SHALL close without re-executing any action

### AR-012 Resumable Approval Wait

The Run Worker SHALL retain the active Agent Loop while waiting for approval without blocking the Daemon API, and SHALL continue from the same action after a decision.

#### Scenario: Resume an approved action

- GIVEN a run is waiting for patch approval
- WHEN the matching approval id is approved
- THEN the run SHALL transition through applying patch and testing
- AND prior model and tool calls SHALL NOT be repeated

#### Scenario: Cancel while waiting

- GIVEN a run is waiting for patch approval
- WHEN the user cancels the run
- THEN the approval wait SHALL wake
- AND the run SHALL finish cancelled without applying the patch
