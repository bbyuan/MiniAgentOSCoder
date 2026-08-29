# Proposal: Add Model Call Gate

## Why

The runtime currently sends every planning turn to the configured model provider, even when an identical, read-only planning request has already been answered. This wastes latency, tokens, and provider quota, and the Web workbench cannot explain whether the runtime avoided redundant calls.

## What Changes

- Add a bounded, in-memory Prompt Cache keyed by a digest of the complete planning request.
- Reuse only decisions whose action is read-only; never cache patch, command, test, MCP, or other side-effecting actions.
- Record cache misses, stores, hits, and skipped provider requests as trace evidence without storing raw prompts in telemetry.
- Persist cache-hit counts in the run budget and deterministic run report.
- Surface provider requests and cache savings in the Web AgentOS control plane and local evaluation view.

## Scope

This change affects the local runtime, run evidence, evaluation aggregation, and Web workbench. It does not create or package a desktop application.
