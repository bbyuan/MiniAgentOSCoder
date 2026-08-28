# Bugfix Skill

## When To Use

Use this skill when the user asks to fix a failing behavior, failing test, runtime error, regression, or bug report.

## Process

1. Restate the failure in one sentence.
2. Inspect the smallest relevant files first.
3. Prefer tests, stack traces, and error logs over guessing.
4. Build a focused Context Pack containing the failing test, target code, related imports, and latest observation.
5. Generate a minimal patch.
6. Dry-run the patch and pass DiffGuard.
7. Ask approval before applying the patch.
8. Run the most relevant test first, then broader tests if needed.
9. If tests fail, turn the failure into an Observation and continue repair.
10. Finish only when Completion Guard can explain why the bug is fixed.

## Completion Criteria

- The root cause is identified or a reasonable localized fix is explained.
- The patch is minimal.
- Relevant tests were run or the reason they could not run is recorded.
- The final report includes changed files, tests, and remaining risk.

