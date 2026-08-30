# Add Project Protocol Discovery

## Why

MiniAgentOS should make spec-driven and protocol-driven development visible inside the product, not only in documentation. When a user opens a project, the workbench should detect whether the repository contains agent instructions, skills, and OpenSpec assets that can guide future runs.

## What Changes

- Add a read-only project protocol discovery endpoint.
- Detect protocol files without returning their contents:
  - `AGENTS.md`
  - project-local `SKILL.md`
  - `.agent/skills/*/SKILL.md`
  - `openspec/specs/*/spec.md`
  - `openspec/changes/*/proposal.md`
- Surface protocol counts in the project readiness center.
- Show a compact preview of detected protocol paths.
- Add a one-click Spec-mode starter prompt for protocol-driven development.

## Non-Goals

- No protocol file editing.
- No protocol content indexing changes in this step.
- No desktop packaging changes.
