from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from app.guards import (
    GuardFailure,
    check_command,
    check_required_params,
    check_tool_budget,
    evaluate_guard,
    resolve_workspace_path,
    skipped_guard,
)
from app.models import (
    ActionIR,
    AgentContract,
    ApprovalPolicy,
    DecisionStatus,
    GovernanceSettings,
    GuardDecision,
    PolicyEvaluation,
    ToolDescriptor,
    ToolHandler,
    ToolResult,
)


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
ToolBeforeHandler = Callable[[ActionIR, ToolDescriptor], None]
ToolAfterHandler = Callable[[ActionIR, ToolDescriptor, ToolResult], None]
PolicyAuditHandler = Callable[[PolicyEvaluation], None]
SandboxValidator = Callable[[list[str]], None]


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
    before_handler: ToolBeforeHandler | None = None
    after_handler: ToolAfterHandler | None = None
    policy_handler: PolicyAuditHandler | None = None
    governance: GovernanceSettings = field(default_factory=GovernanceSettings)
    sandbox_validator: SandboxValidator | None = None
    run_id: str = "unmanaged"

    def __post_init__(self) -> None:
        if self.sandbox_validator is None:
            from app.runtime.sandbox import SandboxExecutor

            self.sandbox_validator = SandboxExecutor(
                self.workspace_root,
                self.run_id,
                profile=self.governance.sandbox_profile,
            ).validate_argv

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

        if action.action_id is None:
            action.action_id = f"action-{uuid4().hex[:10]}"

        evaluation = PolicyEvaluation(
            evaluation_id=f"policy-{uuid4().hex[:12]}",
            run_id=self.run_id,
            action_id=action.action_id,
            tool=action.type,
            effect=descriptor.effect,
            risk=descriptor.risk.value,
            sandbox_profile=self.governance.sandbox_profile,
        )
        command_argv: list[str] = []
        try:
            self._guard(
                evaluation,
                "effect_guard",
                "contract.effects",
                lambda: self._check_effects(descriptor),
                f"Effect {descriptor.effect} is allowed",
            )
            self._guard(
                evaluation,
                "budget_guard",
                "cost_envelope.max_tool_calls",
                lambda: check_tool_budget(self.used_tool_calls, self.contract.cost_envelope.max_tool_calls),
                "Tool-call budget is available",
            )
            self._guard(
                evaluation,
                "schema_guard",
                "descriptor.input_schema",
                lambda: check_required_params(action.params, descriptor.input_schema),
                "Action parameters match the descriptor schema",
            )
            self._evaluate_path_guard(evaluation, action, descriptor)
            command_argv = self._evaluate_command_guard(evaluation, action, descriptor)
            effective_policy = self._evaluate_override(evaluation, descriptor)
            evaluation.effective_policy = effective_policy
        except GuardFailure as failure:
            evaluation.decisions.append(failure.decision)
            self._audit(evaluation, "denied")
            raise failure.cause

        approval_metadata: dict[str, Any] = {}
        approval_required = evaluation.effective_policy == ApprovalPolicy.APPROVAL_REQUIRED.value
        if approval_required:
            preflight = self.preflight_handlers.get(action.type)
            preview = preflight(action.params) if preflight is not None else None
            if preview is not None and not preview.ok:
                evaluation.decisions.append(
                    GuardDecision(
                        guard="preflight_guard",
                        status=DecisionStatus.DENY,
                        reason=preview.error or "Tool preflight failed",
                        rule="tool.preflight",
                    )
                )
                self._audit(evaluation, "denied")
                return self._attach_policy(preview, evaluation)
            evaluation.decisions.append(
                skipped_guard("preflight_guard", "tool.preflight", "Tool has no preflight")
                if preview is None
                else GuardDecision(
                    guard="preflight_guard",
                    status=DecisionStatus.ALLOW,
                    reason="Tool preflight passed",
                    rule="tool.preflight",
                )
            )
            if self.approval_handler is None:
                evaluation.decisions.append(
                    GuardDecision(
                        guard="approval_guard",
                        status=DecisionStatus.DENY,
                        reason=f"Tool requires approval before execution: {descriptor.name}",
                        rule="effective_tool_policy",
                    )
                )
                self._audit(evaluation, "denied")
                raise ToolPolicyDenied(f"Tool requires approval before execution: {descriptor.name}")
            decision = self.approval_handler(action, descriptor, preview)
            if not decision.approved:
                evaluation.decisions.append(
                    GuardDecision(
                        guard="approval_guard",
                        status=DecisionStatus.DENY,
                        reason=decision.reason or "Tool approval was denied",
                        rule="effective_tool_policy",
                    )
                )
                self._audit(evaluation, "approval_denied")
                return self._attach_policy(ToolResult(
                    ok=False,
                    tool=action.type,
                    error=decision.reason or "Tool approval was denied",
                    metadata={"approval_denied": True, **decision.metadata},
                ), evaluation)
            evaluation.decisions.append(
                GuardDecision(
                    guard="approval_guard",
                    status=DecisionStatus.ALLOW,
                    reason="User approved this action once",
                    rule="effective_tool_policy",
                )
            )
            approval_metadata = decision.metadata
        else:
            evaluation.decisions.extend(
                [
                    skipped_guard("preflight_guard", "tool.preflight", "Preflight is not required"),
                    skipped_guard("approval_guard", "effective_tool_policy", "Effective policy is automatic"),
                ]
            )

        try:
            self._evaluate_sandbox_guard(evaluation, descriptor, command_argv)
        except GuardFailure as failure:
            evaluation.decisions.append(failure.decision)
            self._audit(evaluation, "denied")
            raise failure.cause

        self._audit(evaluation, "allowed")

        if self.before_handler is not None:
            self.before_handler(action, descriptor)
        result = handler(action.params)
        if self.after_handler is not None:
            self.after_handler(action, descriptor, result)
        if approval_metadata:
            result.metadata.update(approval_metadata)
        self._attach_policy(result, evaluation)
        self.used_tool_calls += 1
        if self.result_handler is not None:
            self.result_handler(action, result)
        return result

    def _evaluate_path_guard(
        self,
        evaluation: PolicyEvaluation,
        action: ActionIR,
        descriptor: ToolDescriptor,
    ) -> None:
        path_params = descriptor.metadata.get("path_params", [])
        if not isinstance(path_params, list) or not path_params:
            evaluation.decisions.append(skipped_guard("path_guard", "workspace_root", "Tool has no path parameter"))
            return
        self._guard(
            evaluation,
            "path_guard",
            "workspace_root",
            lambda: [resolve_workspace_path(self.workspace_root, action.params[name]) for name in path_params],
            "All path parameters remain inside the workspace",
        )

    def _evaluate_command_guard(
        self,
        evaluation: PolicyEvaluation,
        action: ActionIR,
        descriptor: ToolDescriptor,
    ) -> list[str]:
        command_param = descriptor.metadata.get("command_param")
        if not isinstance(command_param, str):
            fixed_argv = descriptor.metadata.get("fixed_argv")
            if isinstance(fixed_argv, list) and fixed_argv and all(isinstance(item, str) for item in fixed_argv):
                evaluation.decisions.append(
                    GuardDecision(
                        guard="command_guard",
                        status=DecisionStatus.ALLOW,
                        reason="Command arguments are fixed by the runtime descriptor",
                        rule="descriptor.fixed_argv",
                    )
                )
                return list(fixed_argv)
            evaluation.decisions.append(skipped_guard("command_guard", "allowed_prefixes", "Tool has no command parameter"))
            return []
        argv: list[str] = []

        def check() -> None:
            allowed = descriptor.metadata.get("allowed_prefixes", [])
            prefixes = [str(item) for item in allowed] if isinstance(allowed, list) else []
            argv.extend(check_command(str(action.params[command_param]), allowed_prefixes=prefixes))

        self._guard(
            evaluation,
            "command_guard",
            "allowed_prefixes",
            check,
            "Command uses an allowed executable and contains no shell operators",
        )
        return argv

    def _evaluate_override(self, evaluation: PolicyEvaluation, descriptor: ToolDescriptor) -> str:
        override = self.governance.tool_overrides.get(descriptor.name, "inherit")
        contract_policy = str(getattr(self.contract.policies, descriptor.name, descriptor.approval_policy.value))

        def check() -> None:
            if contract_policy == "deny":
                raise ToolPolicyDenied(f"Tool is denied by AgentContract policy: {descriptor.name}")
            if override == "deny":
                raise ToolPolicyDenied(f"Tool is denied by run override: {descriptor.name}")
            if override not in {"inherit", "approval_required"}:
                raise ToolPolicyDenied(f"Unsupported tool override: {override}")

        self._guard(
            evaluation,
            "tool_policy_guard",
            "contract.policies + governance.tool_overrides",
            check,
            "Contract policy and run override do not deny the tool",
        )
        if (
            descriptor.approval_policy == ApprovalPolicy.APPROVAL_REQUIRED
            or contract_policy == ApprovalPolicy.APPROVAL_REQUIRED.value
            or override == "approval_required"
        ):
            return ApprovalPolicy.APPROVAL_REQUIRED.value
        return descriptor.approval_policy.value

    def _evaluate_sandbox_guard(
        self,
        evaluation: PolicyEvaluation,
        descriptor: ToolDescriptor,
        command_argv: list[str],
    ) -> None:
        boundary = descriptor.metadata.get("sandbox", "in_process")
        if boundary != "process":
            evaluation.decisions.append(
                skipped_guard("sandbox_guard", "descriptor.metadata.sandbox", f"Tool uses {boundary} boundary")
            )
            return
        if self.sandbox_validator is None:
            raise GuardFailure(
                GuardDecision(
                    guard="sandbox_guard",
                    status=DecisionStatus.DENY,
                    reason="Process sandbox is unavailable",
                    rule="descriptor.metadata.sandbox",
                ),
                ToolPolicyDenied("Process sandbox is unavailable"),
            )
        self._guard(
            evaluation,
            "sandbox_guard",
            "governance.sandbox_profile",
            lambda: self.sandbox_validator(command_argv),
            f"Command is accepted by the {self.governance.sandbox_profile.value} sandbox profile",
        )

    @staticmethod
    def _guard(
        evaluation: PolicyEvaluation,
        guard: str,
        rule: str,
        check: Callable[[], None],
        allow_reason: str,
    ) -> None:
        evaluation.decisions.append(evaluate_guard(guard, rule, check, allow_reason=allow_reason))

    def _audit(self, evaluation: PolicyEvaluation, outcome: str) -> None:
        evaluation.outcome = outcome
        if self.policy_handler is not None:
            self.policy_handler(evaluation)

    @staticmethod
    def _attach_policy(result: ToolResult, evaluation: PolicyEvaluation) -> ToolResult:
        result.metadata["policy_evaluation_id"] = evaluation.evaluation_id
        return result

    def _check_effects(self, descriptor: ToolDescriptor) -> None:
        effect = descriptor.effect
        if effect in self.contract.effects.deny:
            raise ToolPolicyDenied(f"Effect is denied by contract: {effect}")
        if effect not in self.contract.effects.allow:
            raise ToolPolicyDenied(f"Effect is not allowed by contract: {effect}")
