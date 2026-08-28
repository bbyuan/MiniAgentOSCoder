# DeepSeek Bugfix Demo

This intentionally broken Python project exercises the complete MiniAgentOS Coder flow: workspace scanning, context selection, planning, guarded file reads, patch preflight, user approval, snapshot, patch application, test execution, and trace reporting.

Run the baseline test to confirm the fixture starts in a failing state:

```bash
pytest
```

Use the bugfix task in `TASK.md` when starting a run from the workbench. Review the proposed diff in the Inspector and approve it once to let the same Agent Loop apply and validate the change.
