# Design: Connect Workbench To Daemon

## Context

The backend already exposes daemon endpoints and the frontend has a first-pass workbench. This change connects them while keeping the implementation simple enough for the current local runtime stage.

## Goals

- Make the workbench open a workspace path through `POST /projects/open`.
- Make the workbench create a run through `POST /runs`.
- Show returned contract, context, trace, and run status.
- Add graceful error handling when the daemon is not running.
- Preserve the current clean visual style.

## Non-Goals

- Do not add real-time streaming yet.
- Do not implement a full file picker yet.
- Do not add Electron-specific APIs yet.

## API Flow

```text
health check
  -> user enters workspace path and task
  -> POST /projects/open
  -> POST /runs
  -> GET /runs/{run_id}/context
  -> GET /runs/{run_id}/trace
  -> render workbench panels
```

## UI States

```text
idle
  daemon status unknown

connected
  daemon health check succeeded

running
  project/run requests in flight

ready
  run created and panels populated

error
  daemon unavailable or request failed
```

## Trade-offs

| Decision | Reason |
|---|---|
| Manual workspace path input first | Works in browser and future desktop shell can replace it with folder picker |
| Poll-free first version | Simpler and enough to show daemon integration |
| Keep mock plan fallback | Backend does not yet generate real plans |

