# Change: Add Run Artifacts

## Why

The daemon can create runs, but the workbench still relies on placeholder plan, diff, and test data. A coding-agent workbench should display concrete runtime artifacts produced by the backend.

## What Changes

- Add structured run artifact storage for plan, diff summary, test summary, context explanation, and trace summary.
- Generate an initial plan when a run is created.
- Build context candidates from user task and project profile.
- Expose artifacts through a daemon endpoint.
- Render real plan and artifact summaries in the workbench.

## Capabilities

- **agent-runtime**: Produce inspectable run artifacts at run creation time.
- **desktop-workbench**: Display daemon-backed plan, context explanation, diff/test summary, and trace.

## Out Of Scope

- Full LLM planning.
- Real-time streaming artifact updates.
- Automatic patch generation from model output.

