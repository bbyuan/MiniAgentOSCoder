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
