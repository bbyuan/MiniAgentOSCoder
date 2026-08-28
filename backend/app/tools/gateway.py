from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from app.guards import check_required_params, check_tool_budget
from app.models import ActionIR, AgentContract, ApprovalPolicy, ToolDescriptor, ToolHandler, ToolResult


class ToolNotFound(KeyError):
    pass


class ToolPolicyDenied(PermissionError):
    pass


@dataclass(slots=True)
class ToolApprovalDecision:
    approved: bool
    reason: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


ToolPreflight = Callable[[dict[str, Any]], ToolResult]
ToolApprovalHandler = Callable[[ActionIR, ToolDescriptor, ToolResult | None], ToolApprovalDecision]
ToolResultHandler = Callable[[ActionIR, ToolResult], None]


@dataclass
class ToolGateway:
    workspace_root: Path
    contract: AgentContract
    used_tool_calls: int = 0
    handlers: dict[str, ToolHandler] = field(default_factory=dict)
    descriptors: dict[str, ToolDescriptor] = field(default_factory=dict)
    preflight_handlers: dict[str, ToolPreflight] = field(default_factory=dict)
    approval_handler: ToolApprovalHandler | None = None
    result_handler: ToolResultHandler | None = None

    def register(
        self,
        descriptor: ToolDescriptor,
        handler: ToolHandler,
        preflight: ToolPreflight | None = None,
    ) -> None:
        self.descriptors[descriptor.name] = descriptor
        self.handlers[descriptor.name] = handler
        if preflight is not None:
            self.preflight_handlers[descriptor.name] = preflight

    def list_tools(self) -> list[ToolDescriptor]:
        return list(self.descriptors.values())

    def call(self, action: ActionIR) -> ToolResult:
        descriptor = self.descriptors.get(action.type)
        handler = self.handlers.get(action.type)
        if descriptor is None or handler is None:
            raise ToolNotFound(action.type)

        self._check_effects(descriptor)
        check_tool_budget(self.used_tool_calls, self.contract.cost_envelope.max_tool_calls)
        check_required_params(action.params, descriptor.input_schema)

        approval_metadata: dict[str, Any] = {}
        if descriptor.approval_policy == ApprovalPolicy.APPROVAL_REQUIRED:
            preflight = self.preflight_handlers.get(action.type)
            preview = preflight(action.params) if preflight is not None else None
            if preview is not None and not preview.ok:
                return preview
            if self.approval_handler is None:
                raise ToolPolicyDenied(f"Tool requires approval before execution: {descriptor.name}")
            decision = self.approval_handler(action, descriptor, preview)
            if not decision.approved:
                return ToolResult(
                    ok=False,
                    tool=action.type,
                    error=decision.reason or "Tool approval was denied",
                    metadata={"approval_denied": True, **decision.metadata},
                )
            approval_metadata = decision.metadata

        result = handler(action.params)
        if approval_metadata:
            result.metadata.update(approval_metadata)
        self.used_tool_calls += 1
        if self.result_handler is not None:
            self.result_handler(action, result)
        return result

    def _check_effects(self, descriptor: ToolDescriptor) -> None:
        effect = descriptor.effect
        if effect in self.contract.effects.deny:
            raise ToolPolicyDenied(f"Effect is denied by contract: {effect}")
        if effect not in self.contract.effects.allow:
            raise ToolPolicyDenied(f"Effect is not allowed by contract: {effect}")
