# Daemon API Contract

This file defines the first shared boundary between backend, frontend workbench, and future CLI companion. P0 can implement these endpoints in a minimal form, but names and payload shapes should remain stable.

## Project APIs

### `POST /projects/open`

Open and scan a workspace.

Request:

```json
{
  "path": "/absolute/path/to/project"
}
```

Response:

```json
{
  "project_id": "proj-001",
  "path": "/absolute/path/to/project",
  "profile_path": ".agent/project-profile.json",
  "status": "ready"
}
```

### `GET /projects/current`

Return the active project profile.

## Run APIs

### `POST /runs`

Create a run.

Request:

```json
{
  "project_id": "proj-001",
  "task": "Fix the failing login test",
  "mode": "Bugfix",
  "parent_run_id": null
}
```

`parent_run_id` is optional. When present, it must identify the latest terminal Run in the same project; the Daemon derives conversation lineage and adds a bounded prior-result item to the new Context Pack.

Response:

```json
{
  "run_id": "run-001",
  "conversation_id": "run-001",
  "parent_run_id": null,
  "turn_index": 0,
  "status": "planning",
  "contract": {},
  "admission": {
    "decision": "ready",
    "can_start": true,
    "basis": "heuristic",
    "confidence": "low",
    "sample_size": 0,
    "resources": {},
    "checks": []
  },
  "completion_expectations": [
    "final_message",
    "applied_change",
    "changed_files",
    "tests_after_change"
  ]
}
```

### `GET /runs/{run_id}/admission`

Refresh and return the pre-execution resource forecast and deterministic admission checks. Resource forecasts contain separate `low`, `expected`, `high`, and enforced `ceiling` values for model calls, tool calls, input/output tokens, and wall time. Cost is returned only when both provider token prices are configured. History calibration reads bounded numeric metrics only.

### `GET /runs/{run_id}/conversation`

Return bounded summaries for all Runs in the same conversation, ordered by `turn_index`. The response includes tasks, final outcomes, changed-file names, test status, and completion evidence; it excludes prompts, Context contents, Trace payloads, and tool outputs.

```json
{
  "conversation_id": "run-001",
  "current_run_id": "run-002",
  "turns": [
    {
      "run_id": "run-001",
      "parent_run_id": null,
      "turn_index": 0,
      "task": "Fix the failing login test",
      "status": "completed",
      "final_message": "Fixed and verified."
    }
  ]
}
```

### `GET /runs/{run_id}`

Return run status, active phase, budget, current plan, latest observation, mode-specific `completion_expectations`, and the final `completion` assessment when available.

```json
{
  "run_id": "run-001",
  "status": "completed",
  "completion": {
    "verdict": "passed",
    "mode": "Bugfix",
    "attempt": 2,
    "summary": "All 4 required completion checks passed",
    "checks": [
      {
        "id": "tests_after_change",
        "required": true,
        "passed": true,
        "evidence": "1 successful test run(s) after the latest patch"
      }
    ]
  }
}
```

### `POST /runs/{run_id}/start`

Refresh admission, validate the active model Provider, and schedule a prepared run on the local worker.

Response:

```json
{
  "run_id": "run-001",
  "status": "running",
  "events_url": "/runs/run-001/events/stream"
}
```

The endpoint returns `409` when a deterministic admission check is blocked, model configuration is incomplete, or the run is already active or terminal. Admission blocking occurs before the model client is created.

### `POST /runs/{run_id}/cancel`

Cancel a running or waiting run.

## Approval APIs

### `GET /runs/{run_id}/approval`

Return the currently pending approval request, or `null` when the run is not waiting:

```json
{
  "approval": {
    "approval_id": "appr-001",
    "run_id": "run-001",
    "action_id": "action-001",
    "risk": "high",
    "effect": "fs.write",
    "reason": "Fix the failing calculation",
    "target": {
      "tool": "apply_patch",
      "files": ["pricing.py"],
      "additions": 3,
      "deletions": 1,
      "patch": "--- a/pricing.py\n+++ b/pricing.py\n..."
    },
    "options": ["approve_once", "deny"]
  }
}
```

### `POST /runs/{run_id}/approve`

Approve a waiting action.

The P0 runtime supports `approve_once`. Approval resumes the exact pending action after checkpoint and snapshot creation.

Request:

```json
{
  "approval_id": "appr-001",
  "mode": "approve_once"
}
```

### `POST /runs/{run_id}/deny`

Deny a waiting action and provide feedback to the agent loop.

Denial does not apply the effect. The reason becomes an Action Observation for the next model step.

Request:

```json
{
  "approval_id": "appr-001",
  "reason": "Patch changes too many unrelated files"
}
```

## Recovery APIs

### `GET /runs/{run_id}/checkpoints`

Return ordered checkpoints with phase, step, trace offset, affected files, snapshot availability, and whether rollback is currently allowed. The response also includes `repair_attempts`, `repair_status`, and `rolled_back_to`.

### `POST /runs/{run_id}/rollback`

Restore workspace files from a patch's pre-apply snapshot. Active runs return `409`; successful rollback preserves the run's terminal execution history and appends `rollback.started` and `rollback.completed` Trace events.

Request:

```json
{
  "checkpoint_id": "before-apply-001"
}
```

## Run Report API

### `GET /runs/{run_id}/report`

Return the deterministic Markdown report generated for a terminal run. Before generation, `available` is false and `content` is empty. A successful response also reports whether `patch.diff` exists, the number of applied patches, and the current changed-file list.

```json
{
  "run_id": "run-001",
  "available": true,
  "content": "# MiniAgentOS Coder Run Report...",
  "path": "/workspace/runs/run-001/report.md",
  "generated_at": "2026-08-28T12:00:00+00:00",
  "patch_available": true,
  "patch_count": 2,
  "files": ["pricing.py"]
}
```

## Trace APIs

### `GET /runs/{run_id}/events`

Return the current Trace events as a JSON snapshot for replay and compatibility.

### `GET /runs/{run_id}/events/stream`

Stream ordered Trace events as Server-Sent Events. Pass `after=<event-count>` to resume after an existing snapshot without receiving duplicates. The stream closes after the run reaches a terminal state and all trace events have been sent.

### `GET /runs/{run_id}/trace`

Return `trace.jsonl` metadata and parsed events.

### `POST /runs/{run_id}/replay`

Return an ordered, immutable Trace snapshot without executing models or tools. The response includes `read_only=true`, `event_count`, and the event array used by client-side replay controls.

## Context APIs

### `GET /runs/{run_id}/context`

Return the latest `ContextPack` with required, selected, compressed, omitted, budget, composition, threshold state, compaction count, and per-item explanation sections. Full raw tool output remains internal; the response includes a bounded item summary.

### `POST /runs/{run_id}/context/compact`

Request manual context compaction.

```json
{
  "force": true,
  "target_ratio": 0.55,
  "confirmed": false
}
```

At 95% usage the endpoint returns `status=confirmation_required` until the client repeats the request with `confirmed=true`. Effective compaction returns before/after token counts and creates a Checkpoint and Trace event.

## Memory APIs

### `GET /runs/{run_id}/memory`

Return read-only short-term Run memory plus editable project and long-term entries, grouped by scope with counts.

### `POST /runs/{run_id}/memory`

Create project or long-term memory. `long_term` requires `confirmed=true`; short-term memory is synthesized and cannot be written. Content that resembles a secret is rejected.

```json
{
  "scope": "long_term",
  "kind": "preference",
  "content": "Prefer focused validation before broad test suites",
  "tags": ["workflow"],
  "confirmed": true
}
```

### `PUT /runs/{run_id}/memory/{memory_id}`

Update kind, content, and tags. Updating long-term memory again requires explicit confirmation.

### `DELETE /runs/{run_id}/memory/{memory_id}`

Delete a persisted project or long-term memory entry. Short-term memory remains read-only.

## Governance APIs

### `GET /runs/{run_id}/governance`

Return the Run's editable state, Sandbox profile and Capability Report, AgentContract effects and policies, registered ToolDescriptors, effective tool policies, PolicyEvaluation history, and SandboxExecution history. Histories are reconstructed from `trace.jsonl`.

### `PUT /runs/{run_id}/governance`

Update execution governance before the Run starts:

```json
{
  "sandbox_profile": "strict",
  "tool_overrides": {
    "run_test": "approval_required",
    "search_code": "deny"
  }
}
```

Overrides support `inherit`, `approval_required`, and `deny`. They can raise but never lower the Descriptor or AgentContract safety policy. Active and terminal Runs return `409`.

## Extension APIs

### `GET /runs/{run_id}/extensions`

Return the immutable Extension Catalog snapshot, current Run settings, editability, discovered MCP tools, and Skill/MCP/Hook evidence reconstructed from `trace.jsonl`.

### `PUT /runs/{run_id}/extensions`

Select extensions while the Run is still prepared:

```json
{
  "active_skill_ids": ["bugfix", "test-repair"],
  "enabled_mcp_server_ids": ["github"],
  "enabled_hook_ids": ["preflight-check"]
}
```

Unknown, invalid, duplicated, or mode-incompatible ids return `422`. Active and terminal Runs return `409`. The endpoint never downloads an extension or starts an MCP Server.

## Model APIs

### `GET /models/status`

Return the active project's non-sensitive model Provider configuration status.

Optional query:

```text
project_id=proj-001
```

Response:

```json
{
  "provider": "openai-compatible",
  "model": "gpt-5-mini",
  "api_key_env": "OPENAI_API_KEY",
  "base_url": "https://api.openai.com/v1",
  "configured": true,
  "issues": []
}
```

The response reports only whether the named environment variable exists. It never returns the API key or raw credential-bearing URLs.

## History APIs

### `GET /history/projects`

Return stable local Project identities ordered by most recent open time, including Run count and latest Run status. Reopening the same canonical path updates one Project record.

### `GET /history/runs`

Return compact Run summaries ordered by latest update, including the persisted final `completion` assessment or `null` for legacy and non-terminal Runs. Optional `project_id`, `status`, `query`, and `include_archived` filters can be combined with bounded `limit` and `offset` pagination.

### `GET /history/runs/{run_id}`

Return the persisted summary plus report content, artifact availability, Trace event count, and the twelve most recent valid Trace events. Before reading a file, the Daemon verifies its persisted path remains under the matching workspace `runs/{run_id}/` directory. Missing evidence is represented by `available=false`.

### `POST /history/compare`

Compare exactly two distinct Run ids:

```json
{
  "run_ids": ["run-baseline", "run-candidate"]
}
```

The response aligns steps, model/tool calls, input/output/total tokens, applied patches, and repair attempts, with `delta = candidate - baseline`. It also returns status, test status, duration, and changed files for both Runs.

### `PUT /history/runs/{run_id}/archive`

Set the reversible catalog-only archive state without deleting report, Trace, patch, checkpoint, or snapshot evidence.

```json
{
  "archived": true
}
```
