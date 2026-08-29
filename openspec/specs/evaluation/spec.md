# Evaluation Spec

## Requirements

### EV-001 Local Aggregate Telemetry

The Runtime SHALL derive aggregate quality, cost, governance, and failure metrics from the local Run catalog and validated Trace evidence.

#### Scenario: Inspect local evaluation metrics

- GIVEN persisted Runs exist on the local machine
- WHEN a client requests an Evaluation summary
- THEN the Runtime SHALL return terminal outcomes, completion and test rates, average budget usage, governance event counts, and failure categories
- AND the response SHALL NOT contain task text, project paths, source files, prompts, Trace Payloads, or credentials

#### Scenario: Trace evidence is unavailable

- GIVEN a persisted Run has a missing or malformed Trace
- WHEN metrics are aggregated
- THEN the Runtime SHALL count an evidence gap
- AND continue aggregating valid Run summaries

### EV-002 Isolated Reproducible Benchmark

The Benchmark Harness SHALL execute versioned tasks only in temporary copies of repository-owned fixtures through the governed Runtime path.

#### Scenario: Run an offline benchmark

- GIVEN a valid Benchmark manifest with Fixture Action IR
- WHEN the Fixture Provider runs the suite
- THEN each task SHALL use AgentRunLoop, Tool Gateway, Guard, Sandbox, and Patch Pipeline
- AND the Harness SHALL independently evaluate the declared final test and success condition
- AND write machine-readable JSON and deterministic Markdown summaries

#### Scenario: Compare context variants

- GIVEN the same task set and Provider
- WHEN `full_context` and `task_only` Variants run
- THEN the report SHALL align success, test, model, tool, Token, duration, approval, and Guard metrics
- AND identify the Variant for every task result
- AND neither Variant SHALL bypass execution governance

### EV-003 Honest Evaluation Claims

The product SHALL distinguish deterministic Harness verification from configured-model quality evaluation.

#### Scenario: View Fixture results

- GIVEN a report was produced with the Fixture Provider
- WHEN a user reads the report
- THEN it SHALL label results as runtime reproducibility evidence
- AND SHALL NOT describe them as model quality or general task success
