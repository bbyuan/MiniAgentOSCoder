# Add runtime evidence ledger

## Why

The runtime already records trace, context, policy, extension, test, and completion data, but those signals are scattered across multiple panels. Users and reviewers need one concise place to understand whether a run is explainable, governed, and verifiable.

## What Changes

- Add a `/runs/{run_id}/evidence` endpoint that summarizes runtime evidence without returning prompt, source, model response, or tool-output content.
- Summarize context, model, tools, governance, extensions, tests, and completion guard status.
- Add a control-plane evidence ledger that shows readiness, attention states, sources, and privacy guarantees.
- Refresh the ledger during run preparation, terminal refresh, cancellation, and context compaction.

## Impact

MiniAgentOS becomes easier to demonstrate as an AgentOS-style runtime rather than a plain chat coding tool: every run has a structured evidence account tying together contracts, context, tools, policy, and completion checks.
