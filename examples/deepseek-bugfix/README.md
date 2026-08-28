# DeepSeek Bugfix Demo

This intentionally broken Python project exercises the currently available MiniAgentOS Coder flow: workspace scanning, context selection, planning, guarded file reads, test execution, diagnosis, and trace reporting.

Run the baseline test to confirm the fixture starts in a failing state:

```bash
pytest
```

Use the review task in `TASK.md` when starting a run from the workbench. The fixture can later be reused for end-to-end patching once write approval is connected to the Run Worker.
