# Proposal: Add Run Admission Forecast

## Why

MiniAgentOS enforces model, tool, token, step, and wall-time ceilings during execution, but preflight only shows those maximum values. Users cannot tell whether a task is expected to fit comfortably, approach a limit, or start without a usable validation command. The product therefore exposes budget controls without providing an AgentOS-style scheduling decision.

## What Changes

- Add a deterministic pre-execution resource forecaster for model calls, tool calls, input/output tokens, and wall time.
- Calibrate forecasts from bounded numeric history for the same project and mode when enough samples exist.
- Keep forecasts distinct from enforced AgentContract ceilings and report confidence and sample size.
- Add deterministic admission checks for context fit, budget headroom, and validation readiness.
- Support optional provider input/output prices for USD estimates without hard-coding vendor pricing.
- Expose forecast and admission evidence through the Daemon API, Trace, and Web preflight.

## Scope

This change modifies the local runtime and Web workbench only. It does not add remote scheduling, provider billing reconciliation, dynamic vendor-price lookup, or desktop packaging.
