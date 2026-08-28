# Desktop Workbench Spec

## Requirements

### DW-001 Unified Product Shell

The system SHALL present the primary user experience as a desktop workbench backed by a local runtime daemon.

#### Scenario: User opens the app

- GIVEN the local daemon can start
- WHEN the user opens MiniAgentOS Coder
- THEN the workbench SHALL connect to the daemon
- AND display project and run controls

### DW-002 Shared Daemon API

The desktop workbench and CLI companion SHALL call the same daemon API for projects, runs, approvals, context, memory, trace, and replay.

#### Scenario: Start a run from the workbench

- GIVEN the workbench submits a task
- WHEN the run is created
- THEN the request SHALL go through the daemon API
- AND the resulting run SHALL be observable through the same API

### DW-003 Core Views

The workbench SHALL expose Chat, Plan, Diff, Tests, Context, Memory, Contract, Budget, Trace, Checkpoints, Evaluation, and Settings views.

#### Scenario: Inspect an active run

- GIVEN a run is in progress
- WHEN the user opens the workbench
- THEN the user SHALL be able to inspect plan, diff, tests, context, contract, budget, and trace panels

### DW-004 Approval UI

The workbench SHALL display approval requests with action, reason, target files or command, risk, effect, and choices: approve once, approve pattern, deny, and edit.

#### Scenario: Approve a patch

- GIVEN a patch approval request is waiting
- WHEN the user opens the Approval panel
- THEN the panel SHALL show action, reason, target, risk, effect, and available approval choices

### DW-005 Run Replay

The workbench SHALL replay a run from trace events without re-executing tools.

#### Scenario: Replay completed run

- GIVEN a completed run has `trace.jsonl`
- WHEN the user starts replay
- THEN the workbench SHALL render trace events in order
- AND no tools SHALL be executed during replay

### DW-006 Model Provider Status

The workbench SHALL read model Provider readiness from the local Daemon and SHALL NOT read or retain API keys in frontend state.

#### Scenario: Report missing model configuration

- GIVEN the active project is missing a model name or API key environment variable
- WHEN the workbench requests model status
- THEN the Daemon SHALL return a non-sensitive issue list
- AND SHALL NOT include any credential value

### DW-007 Live Run Execution

The workbench SHALL start prepared runs through the Daemon and incrementally update runtime state from the SSE Trace stream.

#### Scenario: Render a live run

- GIVEN model configuration is ready and a user submits a task
- WHEN the Daemon starts the run
- THEN the workbench SHALL display running status
- AND append model, action, tool, budget, and terminal events as they arrive
