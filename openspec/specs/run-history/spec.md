# Run History Spec

## Requirements

### RH-001 Stable Local Project Catalog

The Daemon SHALL map each canonical workspace path to one stable Project identity and persist its profile and last-opened time in a local SQLite catalog.

#### Scenario: Reopen a workspace

- GIVEN a workspace has been opened before
- WHEN the same canonical path is opened again
- THEN the Daemon SHALL return the existing Project id
- AND update the same catalog entry

### RH-002 Persisted Run Lifecycle

The Daemon SHALL persist compact Run state, result, budget, test, change, and artifact metadata at creation and every material lifecycle transition.

#### Scenario: Restart during an active run

- GIVEN a persisted Run is not terminal when the Daemon exits
- WHEN the Daemon starts again
- THEN the Run SHALL be marked interrupted
- AND its last execution phase and evidence paths SHALL remain inspectable

### RH-003 Evidence-Bounded Detail

The Daemon SHALL treat SQLite as a searchable index and workspace files as execution evidence, and SHALL validate artifact paths before reading them.

#### Scenario: Evidence file is missing

- GIVEN a catalog entry refers to a report or Trace that no longer exists
- WHEN Run detail is requested
- THEN the response SHALL mark that artifact unavailable
- AND SHALL NOT synthesize evidence content

### RH-004 Run Comparison And Archival

The Daemon SHALL compare exactly two distinct known Runs using aligned metrics and SHALL support reversible archival without deleting evidence.

#### Scenario: Archive a run

- GIVEN a Run exists in the local catalog
- WHEN the client archives it
- THEN default queries SHALL omit it
- AND queries that include archived Runs SHALL still return it

### RH-005 Persisted Completion Evidence

The Daemon SHALL persist the final CompletionAssessment as structured JSON and SHALL return it with Run summaries and details without reconstructing it from model prose.

#### Scenario: Migrate an existing catalog

- GIVEN a local history database predates Completion Guard
- WHEN the Daemon opens it
- THEN the schema SHALL add completion storage without deleting existing Runs
- AND older Runs SHALL return a null assessment

#### Scenario: Inspect a verified run

- GIVEN a terminal Run has a CompletionAssessment
- WHEN history detail is requested
- THEN the response SHALL include its verdict, mode, attempt, checks, and evidence
- AND the deterministic Markdown report SHALL contain the same final assessment
