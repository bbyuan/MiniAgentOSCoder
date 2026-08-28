# Test Repair Skill

## When To Use

Use this skill when tests fail after a patch or when the task starts from test output.

## Process

1. Preserve the failing command and output as an Observation.
2. Identify the smallest failing test.
3. Read the test before editing production code.
4. Determine whether the failure indicates a product bug, test expectation issue, environment issue, or incomplete implementation.
5. Patch through Patch Pipeline.
6. Re-run the focused test.
7. Broaden test scope after the focused test passes.

## Completion Criteria

- The failing test result changed from fail to pass, or the reason it cannot pass is explained.
- The final report includes the failing command, the fix, and verification.

