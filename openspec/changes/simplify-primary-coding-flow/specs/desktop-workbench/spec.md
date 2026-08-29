## MODIFIED Requirements

### Requirement: Guided workbench flow

The workbench SHALL make project selection, task description, direct execution, necessary approval, and result review the primary coding path.

#### Scenario: User starts a normal coding task

- **WHEN** a project is open, a model is configured, and the user submits a non-empty task
- **THEN** the workbench SHALL prepare and start the Run as one user action
- **AND** SHALL NOT require a separate preflight confirmation

#### Scenario: User needs run-specific settings

- **WHEN** the user chooses to review Run settings before starting
- **THEN** the workbench SHALL create a planning Run without executing tools
- **AND** SHALL show only model readiness, safety permissions, and extension controls

### Requirement: Runtime detail is progressive

The workbench SHALL keep runtime internals out of the default execution canvas while preserving access to complete inspection and evidence.

#### Scenario: Run starts normally

- **WHEN** a Run begins execution
- **THEN** the full Inspector SHALL remain closed by default
- **AND** the user SHALL be able to open it from a clearly labelled Run details action

#### Scenario: Approval is required

- **WHEN** an approval request pauses execution
- **THEN** the workbench SHALL reveal the approval surface automatically
- **AND** SHALL NOT require the user to discover a hidden blocking action
