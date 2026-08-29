## MODIFIED Requirements

### Requirement: Advanced runtime controls are progressive

The workbench SHALL separate editable preflight settings from runtime inspection and evidence views.

#### Scenario: User opens advanced settings before launch

- **WHEN** a Run is in planning state and the user opens advanced settings
- **THEN** the workbench SHALL show only safety permissions and optional extension controls
- **AND** SHALL NOT show runtime context operations, memory, recovery, reports, traces, or execution evidence

#### Scenario: Execution starts

- **WHEN** the Run leaves planning state
- **THEN** the full runtime Inspector SHALL become available
- **AND** its evidence views SHALL remain separate from preflight configuration

### Requirement: Workbench localization preserves technical identity

The workbench SHALL localize ordinary interface terminology while preserving protocol names, product names, commands, paths, and project-defined identifiers.

#### Scenario: Chinese advanced settings are displayed

- **WHEN** the locale is Chinese
- **THEN** risk, policy, effect, and failure-policy terminology SHALL be shown in Chinese
- **AND** protocol or product names such as Skills, MCP, Hooks, and Sandbox MAY remain unchanged
