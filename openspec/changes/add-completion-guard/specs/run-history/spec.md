## ADDED Requirements

### Requirement: Run history preserves completion evidence

The system SHALL persist a Run's final structured completion assessment and expose it through history list and detail APIs.

#### Scenario: Existing history database is opened

- **WHEN** a database created before completion assessments is opened
- **THEN** the history store SHALL add the new field without deleting existing Runs
- **AND** older Runs SHALL return no assessment rather than failing

#### Scenario: User opens a completed historical Run

- **WHEN** the Run has a completion assessment
- **THEN** history SHALL return its verdict, mode, checks, summary, and attempt
- **AND** the generated report SHALL contain matching evidence
