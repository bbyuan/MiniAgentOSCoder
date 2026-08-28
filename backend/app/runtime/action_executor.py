from __future__ import annotations

from dataclasses import dataclass

from app.models import ActionIR, ToolResult
from app.models.base import Serializable
from app.runtime.tracer import TraceWriter
from app.tools import ToolGateway


@dataclass(slots=True)
class ActionExecution(Serializable):
    action: ActionIR
    result: ToolResult


class ActionExecutor:
    def __init__(self, gateway: ToolGateway, tracer: TraceWriter, run_id: str) -> None:
        self.gateway = gateway
        self.tracer = tracer
        self.run_id = run_id

    def execute(self, action: ActionIR) -> ActionExecution:
        self.tracer.event(self.run_id, "action.parsed", {"action": action.to_dict()}, role=action.role)

        try:
            result = self.gateway.call(action)
        except Exception as exc:
            result = ToolResult(
                ok=False,
                tool=action.type,
                error=str(exc),
                metadata={"error_type": type(exc).__name__},
            )
            self.tracer.event(
                self.run_id,
                "action.rejected",
                {"action": action.to_dict(), "result": result.to_dict()},
                role=action.role,
            )
            return ActionExecution(action=action, result=result)

        event_name = "tool.executed" if result.ok else "tool.failed"
        self.tracer.event(
            self.run_id,
            event_name,
            {"action": action.to_dict(), "result": result.to_dict()},
            role=action.role,
        )
        return ActionExecution(action=action, result=result)
