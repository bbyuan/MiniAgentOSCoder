# Desktop Workbench Daemon Connection Spec

## ADDED Requirements

### Requirement: Workbench Opens Project Through Daemon

The workbench SHALL let the user submit a workspace path and SHALL open it through the daemon API before creating a run.

#### Scenario: User starts a local run

- GIVEN the daemon is available
- AND the user enters a workspace path and task
- WHEN the user starts the run
- THEN the workbench SHALL call `POST /projects/open`
- AND then call `POST /runs` with the returned `project_id`

### Requirement: Workbench Displays Runtime Artifacts

The workbench SHALL display daemon-backed run status, contract, context, and trace after a run is created.

#### Scenario: Run is created

- GIVEN `POST /runs` returns a run id and contract
- WHEN the workbench loads run artifacts
- THEN it SHALL request context and trace
- AND display the returned data in the corresponding panels

### Requirement: Workbench Handles Daemon Errors

The workbench SHALL show a clear error state when the daemon is unreachable or returns an error.

#### Scenario: Daemon unavailable

- GIVEN the daemon is not running
- WHEN the user starts a run
- THEN the workbench SHALL show an error message
- AND keep the task input available

