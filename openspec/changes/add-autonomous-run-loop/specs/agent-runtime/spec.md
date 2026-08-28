# Agent Runtime Delta

## ADDED Requirements

### AR-008 Bounded Autonomous Run Loop

The runtime SHALL repeatedly request one Action IR, execute effectful actions through the Tool Gateway, and feed structured observations into the next planning request until the model finishes or an AgentContract budget is exhausted.

#### Scenario: Complete a multi-step run

- GIVEN the model first requests an allowed tool and then returns `finish`
- WHEN the autonomous loop executes
- THEN the tool result SHALL be included in the second planning request
- AND the run SHALL complete with the model's final message

#### Scenario: Recover after a failed tool action

- GIVEN a tool action is rejected or returns a failed result
- WHEN execution budget remains
- THEN the runtime SHALL record a failed observation
- AND allow the planner to choose a corrective next action

#### Scenario: Enforce a runtime budget

- GIVEN a run reaches its step, model-call, token, tool-call, or wall-time limit
- WHEN the loop attempts to continue
- THEN it SHALL stop before the next prohibited effect
- AND record the exhausted budget and terminal status in the trace

#### Scenario: Reject malformed output during a run

- GIVEN a model response is not valid Action IR
- WHEN the loop parses the response
- THEN no tool SHALL execute for that response
- AND the run SHALL fail with a structured reason

