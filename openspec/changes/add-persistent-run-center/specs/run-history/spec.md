## ADDED Requirements

### Requirement: Runtime persists a searchable local run catalog
The runtime SHALL persist stable project identities and compact run lifecycle summaries in a local SQLite catalog while retaining reports, traces, and patches as workspace evidence files.

#### Scenario: Opening a known workspace
- **WHEN** a user opens the same canonical workspace path more than once
- **THEN** the runtime SHALL return the same project identifier and update its last-opened metadata without duplicating the project

#### Scenario: Run lifecycle changes
- **WHEN** a run is created, started, waits for approval, changes execution phase, or reaches a terminal state
- **THEN** the runtime SHALL update its searchable summary with the latest status, budget, result, test, and artifact metadata

#### Scenario: Daemon restarts during execution
- **WHEN** the daemon starts with persisted runs that were not terminal
- **THEN** it SHALL mark those runs interrupted while preserving their last phase and evidence paths

### Requirement: Runtime exposes bounded history inspection APIs
The runtime SHALL support filtered run listing, evidence-backed detail, two-run comparison, and reversible archival without deleting workspace artifacts.

#### Scenario: Inspecting persisted evidence
- **WHEN** a client requests a historical run detail
- **THEN** the runtime SHALL validate each artifact path is inside that run directory and report missing files explicitly

#### Scenario: Comparing runs
- **WHEN** a client supplies two distinct known run identifiers
- **THEN** the runtime SHALL return aligned execution metrics and the numeric delta from the first run to the second

#### Scenario: Archiving a run
- **WHEN** a client changes a run's archived state
- **THEN** the runtime SHALL hide or restore it in default history queries without deleting its evidence
