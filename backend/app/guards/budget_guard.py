from __future__ import annotations


class BudgetExceeded(RuntimeError):
    pass


def check_tool_budget(used_tool_calls: int, max_tool_calls: int) -> None:
    if used_tool_calls >= max_tool_calls:
        raise BudgetExceeded(f"Tool budget exceeded: {used_tool_calls}/{max_tool_calls}")

