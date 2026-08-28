# Extension Runtime Spec

## Requirements

### ER-001 Immutable Extension Catalog

Each Run SHALL snapshot validated Skill, stdio MCP Server, and trusted Hook manifests before execution, and SHALL allow extension settings to change only while the Run is prepared.

#### Scenario: Reject an incompatible Skill

- GIVEN a Skill declares only Review mode
- WHEN a client activates it for a Bugfix Run
- THEN the Daemon SHALL reject the setting
- AND the existing Run settings SHALL remain unchanged

### ER-002 Progressive Skill Disclosure

The runtime SHALL inject only activated Skill content into Planner requests and SHALL record activation identity and content digest without copying the full Skill body into Trace.

#### Scenario: Activate a mode Skill

- GIVEN a prepared Bugfix Run selects the Bugfix Skill
- WHEN the Worker starts
- THEN the Planner SHALL receive its bounded `SKILL.md` content
- AND Trace SHALL contain `skill.activated` with id, path, and digest

### ER-003 Governed stdio MCP

The runtime SHALL initialize enabled stdio MCP Servers, discover tools, convert their schemas to ToolDescriptors, and execute calls only through Tool Gateway.

#### Scenario: Call a discovered MCP tool

- GIVEN an enabled MCP Server returns a tool from `tools/list`
- WHEN the Planner requests the corresponding namespaced tool
- THEN Contract, Budget, Schema, Governance, and Approval SHALL run before `tools/call`
- AND the bounded result and MCP lifecycle SHALL be traced

### ER-004 Trusted Hook Lifecycle

Enabled project Hooks SHALL execute as argv through SandboxExecutor at supported run and tool before/after events.

#### Scenario: Block a tool with a before Hook

- GIVEN an enabled `tool.before` Hook has block failure policy
- WHEN its sandboxed process fails
- THEN the tool handler SHALL NOT execute
- AND Hook start, finish, Sandbox, and rejected Action evidence SHALL remain in Trace

### ER-005 Extension Control And Evidence

The Daemon and Workbench SHALL expose the same Run Extension settings and Trace-derived evidence while withholding command arguments and environment values.

#### Scenario: Inspect a terminal Run

- GIVEN a Run activated Skills, discovered MCP tools, or executed Hooks
- WHEN the user opens Extensions after completion
- THEN settings SHALL be read-only
- AND the Workbench SHALL display the catalog, discovery summary, and ordered evidence without exposing command arguments or credentials
