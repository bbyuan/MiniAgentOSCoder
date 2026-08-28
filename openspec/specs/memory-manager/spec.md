# Memory Manager Spec

## Requirements

### MM-001 Scoped Memory

The runtime SHALL separate read-only Run memory, project memory, and explicitly confirmed long-term memory.

#### Scenario: Inspect run memory

- GIVEN a Run exists
- WHEN the user opens Memory
- THEN the workbench SHALL show task, plan, latest observation, workspace state, and budget as short-term memory
- AND those entries SHALL be read-only

### MM-002 Persistent Project Memory

The runtime SHALL persist concise project entries under the opened workspace's fixed `.agent/memory/project.json` path using atomic replacement.

#### Scenario: Finish a run

- GIVEN a Run reaches a terminal result
- WHEN runtime finalization executes
- THEN it SHALL store a redacted project summary with outcome, changed files, validation, and repair count
- AND add the memory id to RunState before generating the report

### MM-003 Confirmed Long-Term Memory

The runtime SHALL require explicit confirmation for every long-term memory create or update.

#### Scenario: Reject implicit long-term storage

- GIVEN memory scope is `long_term`
- WHEN the request does not include `confirmed=true`
- THEN the Daemon SHALL reject the write
- AND no long-term file content SHALL change

### MM-004 Memory Safety

The runtime SHALL reject empty, oversized, secret-like, short-term, or workspace-escaping persistent writes.

#### Scenario: Attempt to store an API key

- GIVEN memory content matches a Secret Sensor pattern
- WHEN a persistent write is requested
- THEN the Daemon SHALL reject the request
- AND Trace SHALL NOT contain the submitted secret

### MM-005 Context Integration

The runtime SHALL load project and long-term entries into new Runs as structured, lower-priority ContextItems.

#### Scenario: Start another run in a project

- GIVEN the workspace contains valid persistent memory
- WHEN a new Run builds its Context Pack
- THEN the memory ids and contents SHALL be available to the Planner
- AND the Context view SHALL explain their source, priority, tokens, and state

