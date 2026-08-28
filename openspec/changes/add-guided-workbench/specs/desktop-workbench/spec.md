## ADDED Requirements

### Requirement: Workbench guides the first successful run

The workbench SHALL progressively guide a user through project selection, task definition, preflight review, execution observation, and result review without presenting inactive runtime panels before they are useful.

#### Scenario: User opens the workbench without an active project

- **WHEN** the workbench becomes ready and no project is selected
- **THEN** the primary action SHALL be opening a code project
- **AND** inactive budget, activity, and inspector panels SHALL NOT compete with that action

#### Scenario: User prepares a task

- **WHEN** a project is open and the user submits a non-empty task
- **THEN** the workbench SHALL explain that preparation analyzes context without modifying files
- **AND** SHALL present a preflight summary before execution begins

### Requirement: Desktop users can select a project directory

The desktop workbench SHALL open a native single-directory picker and SHALL pass the selected path to the Daemon project API without granting the frontend arbitrary file read or write access.

#### Scenario: User cancels directory selection

- **WHEN** the native directory picker returns no path
- **THEN** the workbench SHALL remain in its current state without creating a project or showing an error

#### Scenario: Workbench runs in a browser

- **WHEN** the Tauri dialog API is unavailable
- **THEN** the workbench SHALL provide an absolute path input suitable for local development

### Requirement: Workbench exposes recent projects

The workbench SHALL show recently persisted projects and SHALL route native selections and recent selections through the same project-opening behavior.

#### Scenario: User chooses a recent project

- **WHEN** the user selects a project returned by the run history API
- **THEN** the workbench SHALL open that path through the Daemon
- **AND** SHALL continue to task definition without creating a Run

### Requirement: Runtime detail follows workflow state

The workbench SHALL reveal runtime metrics, activity, approvals, and inspector views according to the current Run state.

#### Scenario: Prepared run awaits launch

- **WHEN** a Run is in planning state
- **THEN** the workbench SHALL show model readiness, mode, governance boundary, context budget, and extension summary
- **AND** SHALL label the execution action distinctly from preparation

#### Scenario: Run reaches a terminal state

- **WHEN** a Run completes, fails, or is cancelled
- **THEN** the primary canvas SHALL summarize outcome, changed files, tests, and available evidence
- **AND** SHALL provide a clear action to begin another task
