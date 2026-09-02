# MiniAgentOS Coder Example Workspaces

These fixtures are intentionally small, local, and dependency-light so they can be opened directly from the Workbench during demos or manual testing.

| Workspace | Best Mode | Baseline | What It Demonstrates |
| --- | --- | --- | --- |
| `python-bugfix` | Bugfix | failing unittest | Classic calculator repair, patch approval, test repair loop |
| `deepseek-bugfix` | Bugfix | failing pytest | Decimal rounding bug with external model routing demo |
| `feature-contact-book` | Feature | passing unittest | Completed contact import behavior with normalized merge and CSV export |
| `review-auth-service` | Review | passing unittest | Read-only code review with security findings and no patch |
| `skill-invoice-rules` | Bugfix | failing unittest | Project Skill, optional Hook/MCP catalog, domain rule context |
| `spec-cache-ttl` | Spec | failing unittest | OpenSpec-style change implementation with acceptance tests |

Recommended demo flow:

1. Open one workspace from this directory in the Workbench.
2. Paste the task from that workspace's `TASK.md`.
3. Use the matching mode in the table.
4. For `skill-invoice-rules`, open Run settings before launch to show the project Skill, Hook, and MCP catalog.
