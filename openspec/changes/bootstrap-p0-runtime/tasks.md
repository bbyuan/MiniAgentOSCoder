# Tasks

## 1. Project Scaffold

- [x] 1.1 Create backend FastAPI scaffold.
- [x] 1.2 Create frontend React/Vite scaffold.
- [x] 1.3 Add shared daemon API contract notes.
- [x] 1.4 Add basic development commands to README after scaffold exists.
- [x] 1.5 Validate `.agent/config.yaml` and `.agent/skills.yaml` can be loaded.

## 2. Core Models

- [x] 2.1 Define `ActionIR`.
- [x] 2.2 Define `AgentContract`.
- [x] 2.3 Define `RunState`.
- [x] 2.4 Define `ToolDescriptor`.
- [x] 2.5 Define `ContextItem` and `ContextPack`.
- [x] 2.6 Define `TraceEvent`.
- [x] 2.7 Define `ApprovalRequest`.
- [x] 2.8 Add model serialization tests.

## 3. Runtime

- [x] 3.1 Implement AgentContract compiler.
- [x] 3.2 Implement Action IR parser.
- [x] 3.3 Implement Run state machine.
- [x] 3.4 Implement trace JSONL writer.
- [x] 3.5 Implement checkpoint writer interface.
- [x] 3.6 Implement minimal agent loop skeleton.
- [x] 3.7 Implement skill card loading from `.agent/skills.yaml`.

## 4. Tool Gateway

- [ ] 4.1 Implement tool registry.
- [ ] 4.2 Implement guarded tool call flow.
- [ ] 4.3 Implement read file tool.
- [ ] 4.4 Implement search code tool.
- [ ] 4.5 Implement run test command tool.
- [ ] 4.6 Implement Patch Pipeline interfaces.
- [ ] 4.7 Add path, command, budget, and secret guard tests.

## 5. Context

- [ ] 5.1 Implement project scan.
- [ ] 5.2 Generate `.agent/project-profile.json`.
- [ ] 5.3 Implement lightweight workspace index.
- [ ] 5.4 Implement Context Pack Builder skeleton.
- [ ] 5.5 Add context selection explanation output.

## 6. Workbench

- [x] 6.1 Implement workbench shell.
- [x] 6.2 Implement task input and run status display.
- [x] 6.3 Implement Plan panel.
- [x] 6.4 Implement Contract panel.
- [x] 6.5 Implement Context panel.
- [x] 6.6 Implement Diff panel.
- [x] 6.7 Implement Tests panel.
- [x] 6.8 Implement Trace panel.
- [x] 6.9 Implement Approval panel.
- [x] 6.10 Implement API client based on `openspec/api-contract.md`.

## 7. Verification

- [ ] 7.1 Add one example Python bugfix project.
- [ ] 7.2 Add one run-through script or manual demo path.
- [ ] 7.3 Generate trace, patch, test result, and report for the example run.
- [ ] 7.4 Document validation commands and remaining risks.
- [ ] 7.5 Verify every P0 requirement has an observable scenario or test.
