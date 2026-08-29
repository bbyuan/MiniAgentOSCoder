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

The workbench SHALL read model Provider readiness from the local Daemon and SHALL NOT receive credentials from the Daemon, persist them in browser storage, or include them in project files and logs.

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

### DW-015 Extension Workbench

The workbench SHALL provide one Run-scoped surface for Skills, MCP Servers, trusted Hooks, and their execution evidence.

#### Scenario: Configure extensions before launch

- GIVEN a prepared Run has a validated Extension Catalog
- WHEN the user enables compatible Skills, MCP Servers, or Hooks and saves
- THEN the selected ids SHALL be persisted for that Run
- AND invalid entries SHALL remain disabled with diagnostics

#### Scenario: Follow extension activity

- GIVEN the Worker activates or executes an extension
- WHEN the SSE Trace receives Skill, MCP, or Hook events
- THEN the Workbench SHALL refresh discovery and evidence
- AND controls SHALL become read-only after launch

### DW-016 Persistent Run Center

The workbench SHALL provide a localized, theme-aware Run Center for searching persisted runs, inspecting workspace evidence, reversible archival, and aligned comparison of two executions.

#### Scenario: Inspect a historical run

- GIVEN a Run exists in the local catalog
- WHEN the user opens Run Center and selects it
- THEN the workbench SHALL show its status, result, budget, tests, changed files, report, and recent Trace evidence
- AND missing evidence SHALL be distinguished from an empty result

#### Scenario: Compare two runs

- GIVEN the user selects exactly two Runs
- WHEN comparison is requested
- THEN the workbench SHALL align execution metrics and show candidate-minus-baseline deltas
- AND the comparison SHALL not execute a model or tool

### DW-017 Guided Workbench Flow

The workbench SHALL guide the primary journey through project selection, task definition, preflight review, execution observation, and result review, and SHALL reveal runtime detail only when it is relevant to the current state.

#### Scenario: Open the app without a project

- GIVEN no project is active
- WHEN the workbench becomes ready
- THEN the primary action SHALL open a local code project
- AND recent projects SHALL be available without showing inactive Run panels

#### Scenario: Start a normal task

- GIVEN a project and non-empty task are selected
- WHEN the user starts the task
- THEN the workbench SHALL prepare and launch the governed Run as one action
- AND SHALL NOT require a separate preflight confirmation

#### Scenario: Review optional settings

- GIVEN a project and non-empty task are selected
- WHEN the user opens Run settings
- THEN the workbench SHALL create a planning Run without executing tools
- AND SHALL show only model readiness, safety permissions, and extension controls before launch

#### Scenario: Finish a run

- GIVEN a Run reaches a terminal state
- WHEN the result is rendered
- THEN the workbench SHALL summarize outcome, changed files, tests, and retained evidence
- AND SHALL offer a direct action to begin another task

### DW-018 Secure Desktop Model Setup

The desktop host SHALL store model credentials in the operating system credential manager and inject them only into the managed Daemon process.

#### Scenario: Save a desktop credential

- GIVEN Provider status reports a missing API key
- WHEN the user saves a non-empty key through the desktop setup dialog
- THEN the host SHALL persist it under the application credential identity
- AND restart the managed Daemon
- AND reopen the current project before refreshing non-sensitive Provider status

#### Scenario: Configure browser development

- GIVEN the Workbench is running outside Tauri
- WHEN model setup is opened
- THEN it SHALL explain the ignored `.env` development flow
- AND SHALL NOT persist the credential in browser storage

### DW-019 Completion Evidence Workbench

The workbench SHALL explain mode-specific completion expectations before execution and SHALL display the runtime's structured CompletionAssessment for live and historical Runs.

#### Scenario: Review a prepared Bugfix

- GIVEN a Bugfix Run is prepared
- WHEN the user reviews preflight
- THEN the workbench SHALL explain both valid completion paths
- AND SHALL show that an applied change requires changed files and a successful post-change test
- AND SHALL show that an already-correct result requires successful source inspection, a relevant successful test, and a completion explanation

#### Scenario: Review a terminal result

- GIVEN a terminal Run exposes a CompletionAssessment
- WHEN the result is displayed in the live canvas or Run Center
- THEN every check SHALL show its localized state and evidence
- AND an older Run without an assessment SHALL be identified as unavailable rather than passed

### DW-020 Layered Run Configuration

The workbench SHALL distinguish required configuration, automatically managed runtime capabilities, and optional enhancements before launch, and SHALL separate editable preflight settings from runtime inspection.

#### Scenario: User starts without reviewing settings

- GIVEN a model Provider is configured and task text is present
- WHEN the user selects Start task
- THEN Sandbox, Context, Completion Guard, Skills, MCP Servers, and Hooks SHALL NOT become mandatory intermediate decisions
- AND the Run SHALL proceed with its effective defaults

#### Scenario: User opens advanced settings

- GIVEN task text is present
- WHEN the user explicitly opens Run settings
- THEN a wide preflight settings surface SHALL show only Safety and permissions plus Extension capabilities
- AND runtime Context operations, Memory, checkpoints, reports, traces, and execution evidence SHALL remain hidden
- AND the user SHALL be able to close optional settings without discarding the Run

#### Scenario: User follows a running task

- GIVEN a Run has started
- WHEN no approval is waiting
- THEN the full Inspector SHALL remain closed by default
- AND the user SHALL be able to reveal it with the Run details action

#### Scenario: Approval blocks execution

- GIVEN a guarded effect requires user approval
- WHEN the approval request is received
- THEN Run details SHALL open automatically
- AND the approval decision SHALL be visible in the default Inspector tab

#### Scenario: Chinese optional settings are displayed

- GIVEN the workbench locale is Chinese
- WHEN Safety, tool policy, Skills, MCP Servers, or Hooks are rendered
- THEN ordinary risk, effect, approval, and failure-policy terminology SHALL be localized
- AND protocol names, commands, paths, and project-defined identifiers SHALL preserve their technical identity

### DW-021 Local Evaluation Insights

The Run Center SHALL provide a localized overview of aggregate local Run quality, cost, governance, and failure evidence without exposing workspace content.

#### Scenario: Review local insights

- GIVEN one or more persisted Runs exist
- WHEN the user opens Local Insights
- THEN the Workbench SHALL show outcome rates, average budget usage, governance events, and failure categories
- AND clearly state that the values remain local and contain no code

#### Scenario: No evaluation data exists

- GIVEN the selected scope has no persisted Runs
- WHEN Local Insights is opened
- THEN the Workbench SHALL present an empty state
- AND SHALL NOT display invented zero-percent quality claims

### DW-022 Run Forecast Preflight

The Workbench SHALL show expected resource demand, forecast range, confidence basis, contract ceilings, and admission warnings before launch without presenting estimates as guaranteed limits.

#### Scenario: Review a prepared Run

- GIVEN the Daemon has prepared a Run forecast
- WHEN the user reviews Web preflight
- THEN model calls, tool calls, tokens, time, and optional cost SHALL be visible as expected values and ranges
- AND forecast confidence and historical sample count SHALL be visible
- AND blocking, warning, and passing admission checks SHALL have distinct states
