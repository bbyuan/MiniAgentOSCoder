# Change: Add Runtime Supervision Console

## Motivation
The system already records tool policies, Guard decisions, Sandbox executions, and trace events. The Web UI should connect these pieces into a clear runtime supervision surface so users can understand why actions are allowed, denied, delayed, or replayable.

## Proposal
- Add governance signal tiles for tool policies, Guard checks, and Sandbox runs.
- Show approval-required and denied tool policy counts before the detailed tool list.
- Show denied Guard decisions and failed Sandbox executions as first-class status signals.
- Add trace event group counts for model, tools, governance, and extensions before replay.

## Non-Goals
- Do not change policy evaluation, sandbox execution, or replay semantics.
- Do not package or build the desktop shell in this change.
