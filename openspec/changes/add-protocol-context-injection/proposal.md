# Add protocol context injection

## Why

Project protocols are currently discoverable in the workbench, but agent runs still rely mainly on the user task, project profile, AGENTS instructions, memories, and code snippets. OpenSpec changes, accepted specs, and reusable Skill instructions should influence planning and action selection without requiring users to paste them into each task.

## What Changes

- Add a task-aware protocol context retriever for OpenSpec and Skill documents.
- Inject selected protocol candidates into the run Context Pack during artifact preparation.
- Treat selected protocol context as governance context during deterministic compaction.
- Localize the new context type in the workbench inspector.

## Impact

Agent runs can now carry project-specific development protocol, active OpenSpec change guidance, accepted capability specs, and skill instructions as bounded, redacted, high-priority context. This strengthens the AgentOS-style contract layer while keeping the normal coding flow simple for users.
