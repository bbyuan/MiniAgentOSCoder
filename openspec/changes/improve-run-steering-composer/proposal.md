# Improve Run Steering Composer

## Why

Users should not feel locked out after starting a coding task. The running session needs an obvious conversation-style control surface for adding constraints, correcting direction, asking for verification, or stopping at a safe boundary.

## What Changes

- Promote run steering into a visible dialogue control area.
- Make stop and send actions explicit with localized labels.
- Add quick guidance chips for common steering intents.
- Preserve safe-boundary semantics for active runs and approval replacement semantics for approval waits.

## Impact

- Frontend-only change.
- Reuses the existing `/runs/{run_id}/steer` and cancel APIs.
- No changes to runtime state transitions.
