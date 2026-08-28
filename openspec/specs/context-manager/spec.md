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

### CM-005 Explainability

The workbench SHALL show why each context item was selected, compressed, or omitted.

#### Scenario: Inspect selected context

- GIVEN a run has built a Context Pack
- WHEN the user opens the Context panel
- THEN the workbench SHALL show each item with reason, token estimate, priority, and status
