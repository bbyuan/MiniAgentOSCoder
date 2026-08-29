## ADDED Requirements

### Requirement: Runtime validates completion before terminating

The runtime SHALL treat `finish` as a completion request and SHALL transition a Run to `completed` only when deterministic, mode-aware checks pass against recorded execution evidence.

#### Scenario: Code task requests completion without a verified change

- **WHEN** a Bugfix, Feature, or Spec Run requests completion without an applied patch, changed-file evidence, and a successful test after the latest patch
- **THEN** the runtime SHALL reject the completion request
- **AND** SHALL return the failed check ids and evidence gaps to the next planning step

#### Scenario: Model repairs a rejected completion

- **WHEN** a completion request is rejected and Run budget remains
- **THEN** the autonomous loop SHALL continue from the same observations
- **AND** a later request SHALL complete only after all required checks pass

### Requirement: Completion decisions are traceable

The runtime SHALL record every completion evaluation and SHALL attach the final assessment to the Run result.

#### Scenario: Completion passes

- **WHEN** all required checks pass
- **THEN** the trace SHALL contain the assessment and its evidence
- **AND** the terminal result SHALL expose the same assessment

#### Scenario: Completion remains blocked at budget exhaustion

- **WHEN** a rejected completion is followed by budget exhaustion
- **THEN** the Run SHALL fail
- **AND** the terminal result SHALL preserve the last blocked assessment
