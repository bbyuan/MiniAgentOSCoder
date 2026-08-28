# Change: Connect Workbench To Daemon

## Why

The workbench currently renders a static mock run. To make the product feel real and support demos, it must call the local daemon API to open projects, create runs, and inspect runtime artifacts.

## What Changes

- Add CORS support to the backend daemon for the local Vite workbench.
- Expand the frontend API client to cover project, run, context, trace, replay, and approval endpoints.
- Replace the static workbench state with real async daemon calls.
- Add visible loading, error, connected, and run-created states.
- Keep mock content only as an initial empty-state fallback.

## Capabilities

- **desktop-workbench**: Start a run and display daemon-backed status, contract, context, and trace.
- **agent-runtime**: Expose run state through API in a frontend-friendly shape.

## Out Of Scope

- Streaming SSE/WebSocket updates.
- Full model-driven agent execution.
- Production Electron packaging.

## Impact

- Frontend workbench becomes connected to backend daemon.
- Backend allows local workbench origins.
- README gains a two-terminal local development path.

