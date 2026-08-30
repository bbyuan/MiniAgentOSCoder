# Add Completion Diagnosis

## Why

Terminal run states can expose raw runtime failures or missing evidence in a way that is difficult for users to act on. The workbench should translate stopped runs into a concise diagnosis and a few next actions.

## What Changes

- Add a completion diagnosis card for failed and cancelled runs.
- Classify common stop causes:
  - hard budget limits
  - invalid action contract output
  - model provider failure
  - runtime state transition errors
  - missing completion evidence
- Keep raw details available, but prioritize recovery guidance.
- Add a direct action to inspect the run control plane.

## Non-Goals

- No runtime state-machine changes.
- No automatic retry.
- No desktop packaging changes.
