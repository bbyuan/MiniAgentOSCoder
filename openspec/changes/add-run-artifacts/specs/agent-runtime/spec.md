# Run Artifacts Spec

## ADDED Requirements

### Requirement: Run Artifacts Are Available

The daemon SHALL expose display-ready run artifacts for each created run.

#### Scenario: Workbench requests artifacts

- GIVEN a run has been created
- WHEN the workbench calls `GET /runs/{run_id}/artifacts`
- THEN the daemon SHALL return plan, context explanation, diff summary, test summary, and trace summary

### Requirement: Initial Plan Is Backend Generated

The daemon SHALL generate an initial deterministic plan without requiring a model call.

#### Scenario: Bugfix run is created

- GIVEN a user creates a Bugfix run
- WHEN the daemon initializes run artifacts
- THEN the plan SHALL include scan, contract, context, inspect, patch, test, and report steps

