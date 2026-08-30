# Change: Improve Live Steering Composer

## Motivation
Users need a clear way to interrupt, redirect, or refine an active agent run. The existing runtime supports safe-boundary guidance, but the Web UI still feels more like a status page than an interactive coding assistant.

## Proposal
- Reframe the active-run steering area as a conversational control composer.
- Make the primary affordance a large input for telling the agent what to do next.
- Keep guidance intent controls visible, but move them below the main input as selectable meaning rather than the first thing users must understand.
- Keep stop, queued/applied counts, safe-boundary messaging, and quick guidance suggestions visible.

## Non-Goals
- Do not change backend steering semantics.
- Do not package or build the desktop shell in this change.
