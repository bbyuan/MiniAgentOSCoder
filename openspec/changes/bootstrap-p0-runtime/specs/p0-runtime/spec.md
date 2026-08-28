# P0 Runtime Change Spec

## ADDED Requirements

### Requirement: Start A Run

The daemon SHALL expose an endpoint or internal command that creates a run from a user task and workspace path.

#### Scenario: User starts a bugfix run

- GIVEN a valid workspace path and a user task
- WHEN the user starts a run
- THEN the runtime SHALL create a `RunState`
- AND the run status SHALL become `created`
- AND a run creation event SHALL be written to trace

### Requirement: Compile Before Execute

The runtime SHALL compile an `AgentContract` before any model or tool step executes.

#### Scenario: Runtime prepares the first model step

- GIVEN a created run
- WHEN the runtime prepares execution
- THEN it SHALL load project config and policies
- AND it SHALL compile an `AgentContract`
- AND it SHALL reject model or tool execution if contract compilation fails

### Requirement: Trace Every Step

The runtime SHALL write a `trace.jsonl` event for run creation, scan completion, contract compilation, action parsing, guard result, tool call, observation, approval request, patch event, test result, and final report.

#### Scenario: Tool call completes

- GIVEN a tool call was executed through Tool Gateway
- WHEN the runtime receives the tool result
- THEN it SHALL convert the result into an Observation
- AND append both tool call and observation events to `trace.jsonl`

### Requirement: Patch Approval

The runtime SHALL require approval before applying a patch.

#### Scenario: Agent proposes a code patch

- GIVEN the agent emits a patch action
- WHEN the patch passes parse, dry-run, and DiffGuard
- THEN the runtime SHALL create an `ApprovalRequest`
- AND it SHALL NOT apply the patch until approval is granted

### Requirement: Final Report

The runtime SHALL produce a final report containing task summary, changed files, tests run, approval decisions, budget use, and trace location.

#### Scenario: Run completes successfully

- GIVEN a run has applied an approved patch
- AND relevant tests have passed
- WHEN Completion Guard accepts the result
- THEN the runtime SHALL write `report.md`
- AND the report SHALL include changed files, tests, approvals, budget, and trace path
