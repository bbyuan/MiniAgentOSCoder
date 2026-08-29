# Add Preflight Control Deck

## Why

The current Web preflight page exposes admission, model routing, and the AgentOS contract as separate panels. Users can technically inspect the data, but the first impression does not clearly answer: can this run start, what will be bounded, which model routes will be used, and what is optional.

## What Changes

- Add a first-class preflight control deck above detailed audit panels.
- Summarize model readiness, run admission, hard budgets, context usage, governance boundary, extension surface, and optional cost in one decision surface.
- Show phase-aware model routing as an at-a-glance rail while preserving the existing detailed route and admission panels below it.
- Keep Chinese and English copy localized.

## Impact

- Frontend-only change.
- No credential handling changes.
- No Daemon API changes.
