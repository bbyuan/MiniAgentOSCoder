# Agent Runtime Delta

## ADDED Requirements

### AR-018 Pre-Execution Resource Admission

The runtime SHALL produce a structured pre-execution forecast, preserve AgentContract ceilings as separate enforced values, and evaluate deterministic admission checks before model execution.

#### Scenario: Forecast from project history

- GIVEN at least three terminal Runs exist for the same project and mode
- WHEN a new Run is prepared
- THEN the forecast SHALL report history-calibrated low, expected, and high values with sample size
- AND SHALL NOT read prior prompts, task text, code, or Trace payloads
- AND the response SHALL keep each enforced ceiling separate from predicted demand

#### Scenario: Warn when predicted demand approaches a ceiling

- GIVEN the high forecast consumes most or all of a contract resource
- WHEN admission is evaluated
- THEN the matching check SHALL report warning
- AND the Run SHALL remain launchable unless a deterministic hard check fails

#### Scenario: Block impossible context admission

- GIVEN selected Context exceeds the AgentContract input-token ceiling
- WHEN the client starts the Run
- THEN admission SHALL be blocked before the model provider is called
- AND Trace SHALL record the failed check without raw Context content
