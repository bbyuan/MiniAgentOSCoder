# Add terminal next actions

## Why

After a run completes, fails, or is cancelled, users should not have to infer what to do next from raw trace, evidence, and status text. The terminal state needs a clear decision surface that turns runtime evidence into practical follow-up actions.

## What Changes

- Add a recommended next-step section to the completion summary.
- Offer different actions for successful runs and recovery cases.
- Let suggested recovery actions populate the follow-up composer directly.
- Add follow-up templates for common post-run tasks.
- Keep all copy bilingual and maintain the existing governed follow-up contract flow.

## Impact

The workbench feels more like a guided coding product: terminal runs now lead naturally into validation, continuation, focused retry, evidence inspection, or a fresh task without hiding the AgentOS trace and completion guard details.
