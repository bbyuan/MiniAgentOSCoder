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

The runtime SHALL repeatedly plan one Action IR, execute it through the guarded runtime, and feed typed observations into the next model request until validated completion or budget exhaustion.

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

### AR-013 Per-Run Execution Governance

The runtime SHALL allow a prepared run to select a sandbox profile and tighten registered tool policy to inherited, approval-required, or denied before execution starts. Governance SHALL become read-only after launch.

#### Scenario: Elevate a test command to approval-required

- GIVEN a run is prepared and `run_test` inherits an automatic policy
- WHEN the user changes its run override to approval-required and launches the run
- THEN the matching action SHALL pause with its tool, command, effect, risk, and reason
- AND approval SHALL resume the same pending action without repeating the model call

#### Scenario: Reject a late governance mutation

- GIVEN a run has started or reached a terminal state
- WHEN a client attempts to update its governance settings
- THEN the Daemon SHALL reject the mutation
- AND the execution evidence SHALL remain unchanged

### AR-014 Mode-Aware Completion Guard

The runtime SHALL treat `finish` as a completion request and SHALL only transition a Run to completed after deterministic requirements for its task mode pass against recorded Action Observations.

#### Scenario: Reject an unverified code task

- GIVEN a Bugfix, Feature, or Spec Run has neither an applied verified change nor successful inspection evidence that the requested behavior already exists
- WHEN the model requests finish
- THEN the runtime SHALL append a blocked CompletionAssessment
- AND return failed check ids to the next planning step without ending the Run

#### Scenario: Accept an already-correct Bugfix

- GIVEN a Bugfix Run inspected relevant source without applying a patch
- AND a relevant test completed successfully
- WHEN the model explains that the requested behavior already exists
- THEN Completion Guard SHALL accept the evidence without requiring a synthetic code change
- AND the terminal assessment SHALL identify the verified-existing completion path

#### Scenario: Accept a read-only review

- GIVEN a Review Run has inspected project code and has not applied a patch
- WHEN the model provides a non-empty review result
- THEN Completion Guard SHALL pass
- AND the terminal result SHALL retain every check and its evidence

#### Scenario: Exhaust budget after rejection

- GIVEN Completion Guard rejected the latest finish request
- WHEN the Run exhausts a contract budget before satisfying the missing checks
- THEN the Run SHALL fail
- AND its result SHALL preserve the last blocked assessment

### AR-015 Privacy-Bounded Model Call Gate

The runtime SHALL avoid an identical provider request only when a bounded local Prompt Cache contains a previously parsed read-only planning decision for the same model namespace and complete request digest.

#### Scenario: Reuse a read-only planning decision

- GIVEN an identical planning request previously produced a cacheable read-only action
- WHEN another Run reaches the same request under the same model provider namespace
- THEN the runtime SHALL reuse that Action IR without contacting the provider
- AND SHALL execute the selected read tool against the current workspace
- AND SHALL record the cache hit and skipped provider request without raw prompt content

#### Scenario: Refuse to cache a side effect

- GIVEN a model response requests a patch, command, test, MCP call, or another effectful action
- WHEN the planner considers the response for reuse
- THEN the runtime SHALL NOT store that response in Prompt Cache
- AND a later matching planning turn SHALL require a provider request

### AR-016 Adaptive Capability Disclosure

The runtime SHALL derive a bounded capability phase for every planning turn and SHALL disclose only the registered tools relevant to inspection, work, verification, or repair. Disclosure SHALL reduce model context but SHALL NOT replace Tool Gateway authorization.

#### Scenario: Begin with an inspection menu

- GIVEN a code task has no successful workspace observations
- WHEN the runtime prepares the first Planner request
- THEN the request SHALL disclose read-only workspace and Git inspection tools
- AND mutation and validation tools SHALL remain absent until the task reaches a compatible phase
- AND Trace SHALL record the phase and disclosed tool names

#### Scenario: Reopen repair capabilities after failed validation

- GIVEN the Run has applied a patch and a validation action fails
- WHEN the runtime builds the next capability menu
- THEN the phase SHALL be `repair`
- AND the menu SHALL include focused inspection, mutation, and validation tools allowed by the AgentContract
- AND every selected action SHALL still pass the complete Guard, policy, approval, and Sandbox pipeline

### AR-017 Governed Conversation Continuity

The runtime SHALL represent a follow-up as a new governed Run linked to one terminal parent Run in the same project, and SHALL derive its conversation lineage on the server.

#### Scenario: Continue a completed Run

- GIVEN a completed Run belongs to the current project
- WHEN the user submits a follow-up task with that Run as parent
- THEN the Daemon SHALL create the next turn in the same conversation
- AND SHALL compile a fresh AgentContract and fresh cost envelope
- AND SHALL record the parent, conversation, and turn index in Trace and persistent history

#### Scenario: Reject invalid conversation inheritance

- GIVEN a requested parent belongs to another project or has not reached a terminal state
- WHEN a client attempts to create a follow-up
- THEN the Daemon SHALL reject the request
- AND SHALL NOT create or persist a child Run

### AR-018 Pre-Execution Resource Admission

The runtime SHALL produce a structured pre-execution forecast, preserve AgentContract ceilings as separate enforced values, and evaluate deterministic admission checks before model execution.

#### Scenario: Forecast from project history

- GIVEN at least three terminal Runs exist for the same project and mode
- WHEN a new Run is prepared
- THEN the forecast SHALL report history-calibrated low, expected, and high values with sample size
- AND SHALL NOT read prior prompts, task text, code, or Trace payloads
- AND the response SHALL keep each enforced ceiling separate from predicted demand

#### Scenario: Warn when predicted demand approaches a ceiling

- GIVEN the high forecast consumes most or all of a contract resource
- WHEN admission is evaluated
- THEN the matching check SHALL report warning
- AND the Run SHALL remain launchable unless a deterministic hard check fails

#### Scenario: Block impossible context admission

- GIVEN selected Context exceeds the AgentContract input-token ceiling
- WHEN the client starts the Run
- THEN admission SHALL be blocked before the model provider is called
- AND Trace SHALL record the failed check without raw Context content
