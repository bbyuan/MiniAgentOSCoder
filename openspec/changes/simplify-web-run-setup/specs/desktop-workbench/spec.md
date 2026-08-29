## ADDED Requirements

### Requirement: Workbench distinguishes configuration responsibility

The workbench SHALL separate run setup into required configuration, automatically managed runtime capabilities, and optional enhancements.

#### Scenario: Model Provider is missing

- **WHEN** a prepared Run has no configured model Provider
- **THEN** the Provider SHALL appear as the only blocking configuration
- **AND** the workbench SHALL provide a direct configuration action

#### Scenario: Optional extensions are disabled

- **WHEN** no Skill, MCP Server, or Hook is enabled
- **THEN** the workbench SHALL identify them as optional
- **AND** SHALL allow the Run to launch without a warning

### Requirement: Advanced runtime controls are progressive

The workbench SHALL keep the full Inspector hidden during initial preflight and SHALL reveal it only after an explicit advanced-settings action or after execution starts.

#### Scenario: User first reaches preflight

- **WHEN** a Run enters planning state
- **THEN** required and automatic readiness SHALL occupy the primary layout
- **AND** the full Inspector SHALL NOT compete with the launch decision

### Requirement: Primary workbench text remains readable

The workbench SHALL use readable body and status typography for task setup, preflight, result evidence, and Inspector navigation across desktop and narrow viewports.

#### Scenario: User scans run configuration

- **WHEN** the preflight page is displayed
- **THEN** category, capability, value, and status text SHALL remain legible without relying on dense microcopy
- **AND** rows SHALL reflow without overlap on a narrow viewport
