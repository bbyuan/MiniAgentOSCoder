# Review Auth Service

This fixture has passing tests but intentionally questionable authentication code. It is designed for Review mode so the agent can demonstrate read-only analysis, findings, and evidence without patch approval.

Baseline:

```bash
python3 -m unittest discover -v
```

Expected starting state: tests pass, but review should still find security and robustness issues.
