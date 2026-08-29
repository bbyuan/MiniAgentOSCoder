# Agent Runtime Delta

## ADDED Requirements

### AR-019 Governed Model Routing

The runtime SHALL resolve each Planner request to an explicit configured model Profile using trusted Run mode, capability phase, Context size, and deterministic fallback policy before cache lookup or Provider invocation.

#### Scenario: Route inspection and repair differently

- GIVEN routing maps `inspect` to an economy Profile and `repair` to a primary Profile
- WHEN an Agent Loop moves from initial inspection to repair after failed validation
- THEN each Planner request SHALL use the Profile mapped to its current capability phase
- AND Trace SHALL identify the selected Profile, concrete model, phase, and reason

#### Scenario: Preserve single-model configuration

- GIVEN the project declares only the legacy root model configuration
- WHEN a Run is prepared and started
- THEN the Daemon SHALL synthesize one `default` Profile for every phase
- AND behavior SHALL remain compatible with the existing model client

#### Scenario: Use only an explicit fallback

- GIVEN a preferred Profile is unavailable or cannot fit selected Context
- WHEN routing is compiled
- THEN candidates SHALL be checked only in configured fallback order
- AND selection SHALL report the fallback reason
- AND launch SHALL be blocked if no declared candidate is feasible

#### Scenario: Isolate routed cache entries

- GIVEN two Planner requests have identical messages but resolve to different Profiles or models
- WHEN Prompt Cache keys are computed
- THEN the requests SHALL use different model namespaces
- AND neither response SHALL be reused across the route boundary
