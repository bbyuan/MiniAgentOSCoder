# Change: Enhance Context And Memory Console

## Motivation
The runtime already tracks prompt context, compaction state, and memory scopes. The Web UI should make these AgentOS responsibilities visible as a first-class product surface rather than a raw debug list.

## Proposal
- Add context insight tiles for budget health, retained context, and reduced items.
- Add proportional token composition bars to show where the prompt budget is spent.
- Add memory insight tiles for run-local memory, reusable memory, and the latest saved memory.
- Preserve existing compaction and memory editing behavior.

## Non-Goals
- Do not change context selection, compaction, or memory persistence semantics.
- Do not package or build the desktop shell in this change.
