# Tool Gateway Spec

## Requirements

### TG-001 ToolDescriptor

Every tool SHALL be registered as a `ToolDescriptor` containing name, description, input schema, effect, risk, approval policy, timeout, and handler.

#### Scenario: Register a read file tool

- GIVEN the runtime starts
- WHEN built-in tools are registered
- THEN `read_file` SHALL be available with `fs.read`, low risk, input schema, timeout, and handler

### TG-002 Guarded Execution

Every tool call SHALL pass schema validation, effect checks, budget checks, path checks, command checks, and approval checks before execution.

#### Scenario: Block path escape

- GIVEN an action tries to read `../secret.txt`
- WHEN Tool Gateway checks the action
- THEN PathGuard SHALL reject the call
- AND no file read SHALL occur

### TG-003 Patch Pipeline

All code-writing operations SHALL use Patch Pipeline:

```text
generate_patch -> parse_unified_diff -> dry_run_apply -> diff_guard
-> user_approval -> snapshot_before_apply -> apply_patch
-> run_sensors -> update_trace
```

#### Scenario: Apply an approved patch

- GIVEN a patch parses successfully
- AND dry-run and DiffGuard pass
- AND the user approves the patch
- WHEN Tool Gateway applies the patch
- THEN it SHALL create a snapshot first
- AND then apply the patch and record trace events

### TG-004 Minimal MCP Adapter

The first release SHALL support a minimal stdio MCP Adapter that can list MCP tools, convert schemas to `ToolDescriptor`, call tools through Tool Gateway, and record trace events.

#### Scenario: Register MCP tools

- GIVEN a configured stdio MCP server is reachable
- WHEN the MCP Adapter lists its tools
- THEN each tool SHALL be converted into a `ToolDescriptor`
- AND registered into Tool Gateway with effect and approval policy
- AND `tools/call` SHALL occur only after the normal Guard and approval chain

### TG-005 Patch Preflight And One-Time Approval

The Tool Gateway SHALL validate a patch target and dry-run the unified diff before requesting approval, and SHALL execute the write only after one-time user approval.

#### Scenario: Reject an unsafe patch

- GIVEN a patch targets a protected path or escapes the workspace
- WHEN the patch preflight runs
- THEN the tool SHALL return a failed observation
- AND no approval or file mutation SHALL occur

#### Scenario: Apply an approved patch once

- GIVEN a patch passed preflight and is waiting for approval
- WHEN the user approves it once
- THEN the runtime SHALL snapshot the target files
- AND apply the exact pending patch one time

### TG-006 Ordered Policy Evaluation

Every registered tool action SHALL produce an ordered, machine-readable policy evaluation before its handler executes. The evaluation SHALL include effect, budget, schema, path or command, tool override, preflight, approval, and sandbox decisions when applicable.

#### Scenario: Explain a denied command

- GIVEN a command action violates the active command policy
- WHEN Tool Gateway evaluates the action
- THEN execution SHALL stop before the handler
- AND Trace SHALL contain the ordered decisions, rejecting guard, reason, action id, and evaluation id

### TG-007 Portable Sandbox Execution

Process-based tools SHALL execute through the configured Sandbox Executor with argv execution, a fixed workspace, sanitized environment, private runtime directories, timeout handling, process-group termination, and bounded returned output.

#### Scenario: Run a test in strict profile

- GIVEN a prepared run selects the strict sandbox profile
- WHEN an approved test command executes
- THEN the process SHALL use the strict timeout and output limits
- AND Trace SHALL record sandbox start and finish evidence
- AND the API SHALL disclose that kernel network isolation, syscall filtering, and read-only mounts are not provided by the portable backend
