# Spec Implement Skill

## When To Use

Use this skill when the user asks to implement an OpenSpec change or uses `/spec`.

## Process

1. Read `openspec/project.md`.
2. Read the active change's `proposal.md`, `design.md`, `tasks.md`, and nested `spec.md`.
3. Convert unchecked tasks into an implementation plan.
4. Implement one coherent task group at a time.
5. After each patch, run relevant tests or validation.
6. Update `tasks.md` only when a task is genuinely complete.
7. Finish with a report mapping implementation to requirements.

## Completion Criteria

- Every changed behavior maps to a requirement.
- Every completed task is checked in `tasks.md`.
- Tests or validation are recorded.
- The final report explains remaining unchecked tasks.

