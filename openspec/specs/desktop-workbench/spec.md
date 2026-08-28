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

### DW-008 Localized Workbench

The workbench SHALL support Chinese and English interface copy and persist the selected locale locally.

#### Scenario: Change locale

- GIVEN the workbench is displayed in one supported locale
- WHEN the user selects the other locale
- THEN controls, runtime labels, statuses, plans, and inspector copy SHALL update immediately
- AND the locale SHALL survive a page reload

### DW-009 Light And Dark Themes

The workbench SHALL provide persistent light and dark themes with legible hierarchy and runtime state colors.

#### Scenario: Change theme

- GIVEN the workbench is using the light theme
- WHEN the user selects dark theme
- THEN all workbench surfaces SHALL use dark semantic colors
- AND the preference SHALL survive a page reload

### DW-010 Run Canvas And Inspector

The workbench SHALL present live activity in the primary run canvas and organize plan, contract, context, diff, tests, approval, and trace in a tabbed inspector.

#### Scenario: Reflow on a narrow viewport

- GIVEN the run canvas and inspector cannot fit side by side
- WHEN the viewport narrows
- THEN the inspector SHALL stack below the run canvas
- AND controls and text SHALL remain readable without overlap

### DW-011 Patch Approval Workbench

The workbench SHALL display a real pending patch with its risk, effect, target files, change counts, reason, and unified diff, and SHALL let the user approve it once or deny it with feedback.

#### Scenario: Approve a pending patch

- GIVEN the Daemon emits an approval request for a validated patch
- WHEN the user reviews the diff and approves once
- THEN the workbench SHALL submit the matching approval id
- AND continue rendering the resumed run without starting a duplicate run

#### Scenario: Deny with feedback

- GIVEN a patch is waiting for approval
- WHEN the user enters a reason and denies it
- THEN the reason SHALL be sent to the Daemon
- AND duplicate decisions SHALL be disabled while the request is pending

### DW-012 Context Workbench

The workbench SHALL display Context budget usage, threshold state, token composition, item selection state, and controlled compaction.

#### Scenario: Compact context

- GIVEN a Run has a Context Pack
- WHEN the user selects a target ratio and requests compaction
- THEN the workbench SHALL show before/after token usage and affected state
- AND critical compaction SHALL require a second explicit action

### DW-013 Memory Workbench

The workbench SHALL provide scoped Run, project, and long-term memory views with create, edit, and delete controls for persistent scopes.

#### Scenario: Save long-term memory

- GIVEN the user selects long-term scope
- WHEN the user enters a reusable preference
- THEN the save control SHALL remain disabled until explicit reuse confirmation is selected
- AND the refreshed entry SHALL appear after the Daemon accepts it

### DW-014 Execution Governance Workbench

The workbench SHALL separate run preparation from launch and expose sandbox profile, effective tool policies, per-run tightening controls, ordered Guard decisions, and sandbox execution evidence.

#### Scenario: Configure governance before launch

- GIVEN a newly prepared run is still in planning state
- WHEN the user opens Governance, selects a sandbox profile, and tightens a tool policy
- THEN the workbench SHALL persist the settings before launch
- AND workspace, task, and mode inputs SHALL remain bound to the prepared run

#### Scenario: Inspect execution evidence

- GIVEN the run has evaluated tools or executed a sandboxed process
- WHEN the user opens Governance
- THEN the workbench SHALL show effective policies, decision outcomes and reasons, timings, backend guarantees, limitations, and sandbox execution count
- AND governance controls SHALL be read-only after launch
