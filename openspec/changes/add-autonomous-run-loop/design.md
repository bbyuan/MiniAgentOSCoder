# Design

## Loop Boundary

`AgentRunLoop` owns orchestration but never executes a tool directly. Each model response is parsed by the planner. Tool actions are passed to `ActionExecutor`, which preserves the Action IR, Guard, and Tool Gateway boundary. The reserved `finish` action is handled by the loop because it changes runtime control flow and has no external effect.

## Observation Feedback

Every attempted tool action becomes a typed `ActionObservation` containing the step, action type, success state, output, error, and metadata. Recent observations are included in the next planning request so the model can react to search results, file contents, test failures, and guard rejections. Prompt rendering truncates individual outputs to keep tool output from growing the context without limit.

## Budget Enforcement

The loop uses the stricter of `program.max_steps` and `cost_envelope.max_steps`. Before each model call it checks model-call and wall-time limits. After a model response it accumulates provider-reported input and output token usage and stops before executing the returned action if a token limit has been exceeded. Tool-call limits remain enforced by `ToolGateway`.

## Terminal Semantics

- `finish`: complete successfully and expose a final message.
- malformed model output or model client failure: fail the run.
- step, model-call, token, or wall-time exhaustion: fail with a machine-readable budget reason.
- tool failure or guard rejection: record an observation and allow the next planning step to recover while budget remains.

## Trace Contract

The loop adds these observable events around the existing model and tool events:

- `run.loop.started`
- `run.step.started`
- `observation.recorded`
- `run.finished`
- `run.failed`
- `run.budget_exceeded`

