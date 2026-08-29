# Proposal: Add Governed Conversation Continuity

## Why

The Workbench accepts a follow-up after a terminal Run, but currently creates an unrelated Run. The new screen loses the prior exchange, and the Planner receives no explicit evidence about the previous result. This makes the product look conversational while behaving like disconnected jobs.

## What Changes

- Link follow-up Runs with a stable conversation id, parent Run id, and turn index.
- Persist the lineage in the local Run Center and expose a bounded conversation API.
- Add a compact prior-run handoff to the next Context Pack instead of replaying old prompts or Trace.
- Validate that a parent Run belongs to the same project and has reached a terminal state.
- Show prior turns and inherited evidence in the Web conversation surface.
- Recompile AgentContract, budgets, governance, and extensions for every follow-up Run.

## Scope

This change covers local runtime persistence, Context Pack construction, Daemon APIs, and the Web workbench. It does not package a desktop client, share conversations across projects, or provide remote multi-user chat.
