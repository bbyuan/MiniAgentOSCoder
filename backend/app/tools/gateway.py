from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.guards import check_required_params, check_tool_budget
from app.models import ActionIR, AgentContract, ApprovalPolicy, ToolDescriptor, ToolHandler, ToolResult


class ToolNotFound(KeyError):
    pass


class ToolPolicyDenied(PermissionError):
    pass


@dataclass
class ToolGateway:
    workspace_root: Path
    contract: AgentContract
    used_tool_calls: int = 0
    handlers: dict[str, ToolHandler] = field(default_factory=dict)
    descriptors: dict[str, ToolDescriptor] = field(default_factory=dict)

    def register(self, descriptor: ToolDescriptor, handler: ToolHandler) -> None:
        self.descriptors[descriptor.name] = descriptor
        self.handlers[descriptor.name] = handler

    def list_tools(self) -> list[ToolDescriptor]:
        return list(self.descriptors.values())

    def call(self, action: ActionIR) -> ToolResult:
        descriptor = self.descriptors.get(action.type)
        handler = self.handlers.get(action.type)
        if descriptor is None or handler is None:
            raise ToolNotFound(action.type)

        self._check_policy(descriptor)
        check_tool_budget(self.used_tool_calls, self.contract.cost_envelope.max_tool_calls)
        check_required_params(action.params, descriptor.input_schema)

        result = handler(action.params)
        self.used_tool_calls += 1
        return result

    def _check_policy(self, descriptor: ToolDescriptor) -> None:
        effect = descriptor.effect
        if effect in self.contract.effects.deny:
            raise ToolPolicyDenied(f"Effect is denied by contract: {effect}")
        if effect not in self.contract.effects.allow:
            raise ToolPolicyDenied(f"Effect is not allowed by contract: {effect}")
        if descriptor.approval_policy == ApprovalPolicy.APPROVAL_REQUIRED:
            raise ToolPolicyDenied(f"Tool requires approval before execution: {descriptor.name}")

