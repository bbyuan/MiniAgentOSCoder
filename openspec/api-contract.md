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
  "mode": "Bugfix"
}
```

Response:

```json
{
  "run_id": "run-001",
  "status": "created",
  "contract": {}
}
```

### `GET /runs/{run_id}`

Return run status, active phase, budget, current plan, and latest observation.

### `POST /runs/{run_id}/start`

Validate the active model Provider and schedule a prepared run on the local worker.

Response:

```json
{
  "run_id": "run-001",
  "status": "running",
  "events_url": "/runs/run-001/events/stream"
}
```

The endpoint returns `409` when model configuration is incomplete or the run is already active or terminal.

### `POST /runs/{run_id}/cancel`

Cancel a running or waiting run.

## Approval APIs

### `POST /runs/{run_id}/approve`

Approve a waiting action.

Request:

```json
{
  "approval_id": "appr-001",
  "mode": "approve_once"
}
```

### `POST /runs/{run_id}/deny`

Deny a waiting action and provide feedback to the agent loop.

Request:

```json
{
  "approval_id": "appr-001",
  "reason": "Patch changes too many unrelated files"
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

Replay trace events without executing tools.

## Context APIs

### `GET /runs/{run_id}/context`

Return the latest `ContextPack` with required, selected, compressed, omitted, and budget sections.

### `POST /runs/{run_id}/context/compact`

Request manual context compaction.

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
