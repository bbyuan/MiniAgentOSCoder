# Desktop Workbench Delta

## ADDED Requirements

### DW-023 Explainable Model Route

The Web workbench SHALL show the planned model Profile for each execution phase and distinguish configured policy, explicit fallback, and blocked route states without exposing credentials.

#### Scenario: Review a routed Run before launch

- GIVEN the Daemon compiled a feasible route plan
- WHEN the user reviews Run settings
- THEN inspection, work, verification, and repair SHALL show their selected Profile and model
- AND the workbench SHALL explain whether mode policy, phase policy, default policy, or fallback selected each route

#### Scenario: Review actual route use

- GIVEN a Run has issued routed model requests
- WHEN the user opens runtime details
- THEN the workbench SHALL summarize actual request and token counts by Profile
- AND SHALL derive the evidence from bounded Trace events rather than client-side assumptions
