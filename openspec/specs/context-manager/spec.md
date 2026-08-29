# Context Manager Spec

## Requirements

### CM-001 Context Items

The runtime SHALL represent prompt inputs as structured `ContextItem` objects with id, type, source, reason, token estimate, priority, and content.

#### Scenario: Create file snippet context

- GIVEN a relevant source file is selected
- WHEN the context manager adds a code snippet
- THEN it SHALL create a `ContextItem` with path, reason, token estimate, priority, and content

### CM-002 Context Pack

The runtime SHALL build a `ContextPack` containing required items, selected items, compressed items, omitted items, and a budget report.

#### Scenario: Build prompt context

- GIVEN a user task, current plan, latest observation, and candidate snippets
- WHEN the runtime builds context
- THEN it SHALL produce a `ContextPack`
- AND include required, selected, compressed, omitted, and budget report sections
- AND include type composition, threshold state, compaction count, and the actual included content

### CM-003 Workspace Index

The runtime SHALL create a lightweight workspace index with file metadata, symbols, import relations, test relations, and snippets.

#### Scenario: Scan a Python project

- GIVEN a workspace with Python files and tests
- WHEN project scan runs
- THEN the index SHALL include file metadata, functions/classes, imports, test files, and snippets

### CM-004 Compaction

When context exceeds budget, the runtime SHALL preserve user task, current plan, latest observation, and current diff, then compress lower-priority history and long tool outputs.

#### Scenario: Compress long test output

- GIVEN context exceeds the token budget
- WHEN compaction runs
- THEN long test output SHALL be summarized
- AND user task, current plan, latest observation, and current diff SHALL remain available

#### Scenario: Reach critical usage

- GIVEN context usage reaches 95 percent
- WHEN compaction is requested without confirmation
- THEN the runtime SHALL return `confirmation_required`
- AND SHALL NOT discard additional context detail

#### Scenario: Audit effective compaction

- GIVEN a manual or automatic compaction reduces context
- WHEN the new Context Pack is saved
- THEN compressed items SHALL remain available to the Planner
- AND the runtime SHALL save token deltas in Trace
- AND manual compaction SHALL create a Checkpoint

### CM-005 Explainability

The workbench SHALL show why each context item was selected, compressed, or omitted.

#### Scenario: Inspect selected context

- GIVEN a run has built a Context Pack
- WHEN the user opens the Context panel
- THEN the workbench SHALL show each item with reason, token estimate, priority, and status

### CM-006 Runtime Observations

The runtime SHALL add the latest guarded tool result to Context and downgrade older observations to compressible history.

#### Scenario: Tool returns a new observation

- GIVEN a guarded tool has completed
- WHEN its result is recorded
- THEN the latest result SHALL be represented as a protected `latest_observation` ContextItem
- AND any previous latest observation SHALL become lower-priority tool history

### CM-007 Project Instruction Discovery

The runtime SHALL discover workspace `AGENTS.md` instructions before execution and represent readable, redacted instructions as protected `project_rules` ContextItems.

#### Scenario: Open a project with agent instructions

- GIVEN a workspace contains a root `AGENTS.md` or `.agent/AGENTS.md`
- WHEN a Run Context Pack is created
- THEN each applicable instruction file SHALL be included with its source path
- AND instruction contents SHALL be redacted and bounded before reaching the model

### CM-008 Task-Aware Code Retrieval

The runtime SHALL use the Workspace Index to select a bounded set of task-relevant source and test snippets using deterministic path, symbol, content, import, and test-relation signals.

#### Scenario: Build context for a targeted bugfix

- GIVEN the task names a symbol or behavior represented in the Workspace Index
- WHEN the initial Context Pack is built
- THEN matching snippets SHALL be ranked ahead of unrelated snippets
- AND selected snippets SHALL include path, line range, score, matched terms, and a human-readable reason
- AND no single file SHALL consume the entire snippet budget

#### Scenario: No direct task match exists

- GIVEN no indexed snippet directly matches the task
- WHEN retrieval runs
- THEN it SHALL select a small deterministic fallback from entrypoint and test files
- AND it SHALL NOT include the entire workspace

### CM-009 Current Diff Context

The runtime SHALL retain the latest applied unified diff as a protected `current_diff` ContextItem for subsequent validation and repair decisions.

#### Scenario: Apply a patch

- GIVEN an approved patch is applied successfully
- WHEN the tool observation is added to Context
- THEN the previous current Diff SHALL be replaced by the newly applied normalized Diff
- AND automatic compaction SHALL preserve the current Diff

### CM-010 Bounded Prior-Run Handoff

The Context Manager SHALL represent conversation inheritance as one bounded, attributable Context Item and SHALL NOT replay prior prompts, Trace payloads, or tool outputs.

#### Scenario: Build follow-up context

- GIVEN a valid terminal parent Run has a final result and structured evidence
- WHEN the Daemon prepares its follow-up Run
- THEN the Context Pack SHALL include a required `prior_run_summary` item
- AND the item SHALL contain bounded outcome, changed-file, test, and completion evidence
- AND its metadata SHALL identify the parent Run and conversation turn
