## ADDED Requirements

### Requirement: Workbench provides a persistent Run Center
The workbench SHALL provide one integrated surface for finding past runs, reading their evidence, archiving entries, and comparing two executions.

#### Scenario: Browsing run history
- **WHEN** a user opens Run Center
- **THEN** the workbench SHALL show compact runs with project, status, text, and archive filters and preserve the active coding workspace behind the surface

#### Scenario: Reading run detail
- **WHEN** a user selects a historical run
- **THEN** the workbench SHALL show its result, resource summary, changed files, report availability, and recent trace evidence

#### Scenario: Comparing two runs
- **WHEN** a user selects exactly two historical runs and requests comparison
- **THEN** the workbench SHALL show both identities and aligned metric values with their differences
