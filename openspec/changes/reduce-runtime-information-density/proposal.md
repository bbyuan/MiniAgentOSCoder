# Change: Reduce Runtime Information Density

## Motivation
The runtime page exposes too many metrics and controls by default. Users should first see the current state, next action, and required decisions, while advanced runtime details remain available on demand.

## Proposal
- Collapse detailed run metrics behind a show-details action.
- Show only the primary AgentOS control signals by default.
- Move secondary control signals behind a more-controls disclosure.

## Non-Goals
- Do not remove runtime capabilities or telemetry.
- Do not package the desktop shell.
