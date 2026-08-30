# Add Live Run Status Deck

## Why

The running screen already exposes conversation, progress, trace, and control-plane details, but users need a clearer top-level answer to three questions:

- What is the agent doing now?
- What is likely to happen next?
- Where can I inspect or steer the governed runtime?

## What Changes

- Add a live run status deck to the active session screen.
- Surface current focus, next step, latest event, model/tool counts, guarded-event count, and context use.
- Add a direct control-plane action from the status deck.
- Preserve the existing progress list, activity feed, and steering composer as detailed supporting views.

## Non-Goals

- No change to runtime state transitions.
- No new backend persistence.
- No desktop packaging changes.
