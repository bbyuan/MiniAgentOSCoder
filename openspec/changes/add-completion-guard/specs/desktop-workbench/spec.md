## ADDED Requirements

### Requirement: Workbench explains and displays completion evidence

The workbench SHALL show the active mode's completion expectations before execution and SHALL render the final structured assessment for live and historical Runs.

#### Scenario: User reviews preflight

- **WHEN** a Run is prepared in Bugfix, Feature, Spec, Review, or Chat mode
- **THEN** preflight SHALL summarize the evidence required for that mode

#### Scenario: Run requests completion too early

- **WHEN** Completion Guard rejects a finish request
- **THEN** the live activity SHALL remain active
- **AND** the model SHALL receive the missing checks without the UI reporting success

#### Scenario: User reviews a terminal Run

- **WHEN** a final assessment is available
- **THEN** the result view and Run Center SHALL show its verdict and every required check with evidence
