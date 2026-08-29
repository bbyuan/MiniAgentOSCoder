# Design: Run Admission Forecast

## Three resource semantics

- `forecast`: expected demand plus a low/high range. It is an estimate, not a guarantee.
- `ceiling`: an AgentContract limit enforced during execution.
- `admission`: deterministic checks performed before launch. Only a failed hard check blocks execution.

The API and Workbench must label these separately.

## Forecast inputs

The estimator uses only bounded structured data:

- task mode and length class;
- current Context Pack token count;
- enabled Skill, MCP, and Hook counts;
- project test-command availability;
- numeric metrics from recent terminal Runs in the same project and mode.

It does not read old task text, prompts, source code, Trace payloads, or credentials from history.

## Calibration

With at least three usable historical Runs, the estimator uses deterministic quantiles for low, expected, and high demand. With one or two samples, it blends those values with mode defaults and reports `hybrid` confidence. With no samples, it reports `heuristic` confidence.

Forecast demand may exceed a ceiling; it is not silently clamped. This produces a warning while preserving the distinction between expected demand and the maximum execution the runtime will permit.

## Admission checks

- Context input must fit the hard input-token ceiling.
- Forecast model, tool, token, and time demand should retain headroom; low headroom warns but does not block.
- Bugfix, Feature, and Spec Runs should have a detected test command; absence warns.
- Contract ceilings must be positive and internally usable; invalid hard limits block.

## Pricing

Model configuration may declare `input_price_per_million` and `output_price_per_million`. When both are present, the estimator returns expected/high USD cost and a contract token ceiling cost. Missing prices produce a null cost forecast and never block execution.

## Lifecycle

The Daemon snapshots an admission forecast during Run preparation and refreshes it before launch. Trace records only numeric estimates, check identifiers and states, confidence, and sample size. Starting a Run with a blocked deterministic check returns a conflict instead of invoking the model.
