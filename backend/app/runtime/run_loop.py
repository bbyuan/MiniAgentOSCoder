from __future__ import annotations

import time
from collections.abc import Callable

from app.models import (
    ActiveSkill,
    ActionObservation,
    AgentContract,
    CompletionAssessment,
    ContextPack,
    RunLoopResult,
    RunPhase,
)
from app.runtime.action_executor import ActionExecutor
from app.runtime.action_parser import ActionParseError
from app.runtime.completion_guard import evaluate_completion
from app.runtime.model_client import ModelClient
from app.runtime.planner import plan_next_action
from app.runtime.tracer import TraceWriter
from app.tools import ToolGateway


class AgentRunLoop:
    def __init__(
        self,
        *,
        run_id: str,
        gateway: ToolGateway,
        model_client: ModelClient,
        tracer: TraceWriter,
        clock: Callable[[], float] = time.monotonic,
        should_cancel: Callable[[], bool] = lambda: False,
        take_steering: Callable[[], list[str]] = lambda: [],
        on_step: Callable[[int], None] = lambda step: None,
    ) -> None:
        self.run_id = run_id
        self.gateway = gateway
        self.model_client = model_client
        self.tracer = tracer
        self.clock = clock
        self.should_cancel = should_cancel
        self.take_steering = take_steering
        self.on_step = on_step

    def run(
        self,
        *,
        task: str,
        contract: AgentContract,
        context_pack: ContextPack | None = None,
        skills: list[ActiveSkill] | None = None,
        mode: str | None = None,
        initial_steps: int = 0,
        initial_model_calls: int = 0,
        initial_token_usage: dict[str, int] | None = None,
    ) -> RunLoopResult:
        observations: list[ActionObservation] = []
        previous_usage = initial_token_usage or {}
        token_usage = {
            "input_tokens": max(0, int(previous_usage.get("input_tokens", 0))),
            "output_tokens": max(0, int(previous_usage.get("output_tokens", 0))),
            "total_tokens": max(0, int(previous_usage.get("total_tokens", 0))),
        }
        token_usage["total_tokens"] = max(
            token_usage["total_tokens"],
            token_usage["input_tokens"] + token_usage["output_tokens"],
        )
        model_calls = max(0, initial_model_calls)
        initial_tool_calls = self.gateway.used_tool_calls
        started_at = self.clock()
        max_steps = max(0, min(contract.program.max_steps, contract.cost_envelope.max_steps))
        starting_step = max(0, initial_steps)
        completion_attempts = 0
        last_completion: CompletionAssessment | None = None
        active_mode = mode or contract.program.mode
        active_task = task

        self.tracer.event(
            self.run_id,
            "run.loop.started",
            {
                "task": task,
                "limits": contract.cost_envelope.to_dict(),
                "effective_max_steps": max_steps,
                "resumed_from_step": starting_step,
                "initial_model_calls": model_calls,
                "initial_tool_calls": initial_tool_calls,
                "initial_token_usage": dict(token_usage),
            },
        )

        for step in range(starting_step + 1, max_steps + 1):
            self.on_step(step)
            if self.should_cancel():
                return self._cancelled_result(
                    steps=step - 1,
                    model_calls=model_calls,
                    initial_tool_calls=initial_tool_calls,
                    token_usage=token_usage,
                    observations=observations,
                    completion=last_completion,
                )
            active_task, _ = self._apply_steering(active_task, observations, step)
            budget_reason = self._preflight_budget_reason(
                contract=contract,
                model_calls=model_calls,
                started_at=started_at,
            )
            if budget_reason is not None:
                return self._budget_result(
                    reason=budget_reason,
                    steps=step - 1,
                    model_calls=model_calls,
                    initial_tool_calls=initial_tool_calls,
                    token_usage=token_usage,
                    observations=observations,
                    completion=last_completion,
                )

            self.tracer.event(
                self.run_id,
                "run.step.started",
                {"step": step, "model_calls": model_calls, "tool_calls": self.gateway.used_tool_calls},
            )
            model_calls += 1
            try:
                decision = plan_next_action(
                    run_id=self.run_id,
                    task=active_task,
                    contract=contract,
                    tools=self.gateway.list_tools(),
                    model_client=self.model_client,
                    tracer=self.tracer,
                    context_pack=context_pack,
                    observations=observations,
                    skills=skills,
                )
            except ActionParseError as exc:
                return self._failed_result(
                    reason="invalid_action_ir",
                    error=str(exc),
                    steps=step,
                    model_calls=model_calls,
                    initial_tool_calls=initial_tool_calls,
                    token_usage=token_usage,
                    observations=observations,
                    completion=last_completion,
                )
            except Exception as exc:
                return self._failed_result(
                    reason="model_error",
                    error=str(exc),
                    steps=step,
                    model_calls=model_calls,
                    initial_tool_calls=initial_tool_calls,
                    token_usage=token_usage,
                    observations=observations,
                    completion=last_completion,
                )

            _add_usage(token_usage, decision.response.usage)
            if self.should_cancel():
                return self._cancelled_result(
                    steps=step,
                    model_calls=model_calls,
                    initial_tool_calls=initial_tool_calls,
                    token_usage=token_usage,
                    observations=observations,
                    completion=last_completion,
                )
            active_task, superseded = self._apply_steering(active_task, observations, step)
            if superseded:
                self.tracer.event(
                    self.run_id,
                    "action.superseded",
                    {"action": decision.action.to_dict(), "reason": "user_guidance"},
                    role="user",
                )
                continue
            token_reason = _token_budget_reason(contract, token_usage)
            if token_reason is not None:
                return self._budget_result(
                    reason=token_reason,
                    steps=step,
                    model_calls=model_calls,
                    initial_tool_calls=initial_tool_calls,
                    token_usage=token_usage,
                    observations=observations,
                    completion=last_completion,
                )

            if decision.action.type == "finish":
                self.tracer.event(
                    self.run_id,
                    "action.parsed",
                    {"action": decision.action.to_dict(), "control_action": True},
                    role=decision.action.role,
                )
                final_message = decision.action.params.get("message")
                if not isinstance(final_message, str) or not final_message.strip():
                    final_message = decision.action.rationale
                completion_attempts += 1
                last_completion = evaluate_completion(
                    mode=active_mode,
                    final_message=final_message,
                    observations=observations,
                    attempt=completion_attempts,
                )
                self.tracer.event(
                    self.run_id,
                    "completion.evaluated",
                    {"assessment": last_completion.to_dict()},
                    role=decision.action.role,
                )
                active_task, superseded = self._apply_steering(active_task, observations, step)
                if superseded:
                    self.tracer.event(
                        self.run_id,
                        "action.superseded",
                        {"action": decision.action.to_dict(), "reason": "user_guidance"},
                        role="user",
                    )
                    continue
                if last_completion.verdict != "passed":
                    failed_checks = [check.id for check in last_completion.checks if check.required and not check.passed]
                    observation = ActionObservation(
                        step=step,
                        action_type="finish",
                        ok=False,
                        error=last_completion.summary,
                        metadata={
                            "policy": "completion_guard",
                            "failed_checks": failed_checks,
                            "assessment": last_completion.to_dict(),
                        },
                    )
                    observations.append(observation)
                    self.tracer.event(
                        self.run_id,
                        "completion.rejected",
                        {"action": decision.action.to_dict(), "assessment": last_completion.to_dict()},
                        role=decision.action.role,
                    )
                    self.tracer.event(
                        self.run_id,
                        "action.rejected",
                        {
                            "action": decision.action.to_dict(),
                            "reason": "completion_guard",
                            "failed_checks": failed_checks,
                        },
                        role=decision.action.role,
                    )
                    self.tracer.event(
                        self.run_id,
                        "observation.recorded",
                        {"observation": observation.to_dict()},
                        role=decision.action.role,
                    )
                    continue
                self.tracer.event(
                    self.run_id,
                    "completion.passed",
                    {"assessment": last_completion.to_dict()},
                    role=decision.action.role,
                )
                result = self._result(
                    status=RunPhase.COMPLETED,
                    reason="finish",
                    steps=step,
                    model_calls=model_calls,
                    initial_tool_calls=initial_tool_calls,
                    token_usage=token_usage,
                    observations=observations,
                    final_message=final_message,
                    completion=last_completion,
                )
                self.tracer.event(
                    self.run_id,
                    "run.finished",
                    _terminal_payload(result),
                )
                return result

            execution = ActionExecutor(
                gateway=self.gateway,
                tracer=self.tracer,
                run_id=self.run_id,
            ).execute(decision.action)
            observation = ActionObservation(
                step=step,
                action_type=execution.action.type,
                ok=execution.result.ok,
                output=execution.result.output,
                error=execution.result.error,
                metadata=execution.result.metadata,
            )
            observations.append(observation)
            self.tracer.event(
                self.run_id,
                "observation.recorded",
                {"observation": observation.to_dict()},
                role=execution.action.role,
            )

            if execution.result.metadata.get("error_type") == "BudgetExceeded":
                return self._budget_result(
                    reason="max_tool_calls",
                    steps=step,
                    model_calls=model_calls,
                    initial_tool_calls=initial_tool_calls,
                    token_usage=token_usage,
                    observations=observations,
                    completion=last_completion,
                )

        return self._budget_result(
            reason="max_steps",
            steps=max_steps,
            model_calls=model_calls,
            initial_tool_calls=initial_tool_calls,
            token_usage=token_usage,
            observations=observations,
            completion=last_completion,
        )

    def _apply_steering(
        self,
        active_task: str,
        observations: list[ActionObservation],
        step: int,
    ) -> tuple[str, bool]:
        messages = self.take_steering()
        if not messages:
            return active_task, False
        for message in messages:
            active_task = f"{active_task}\n\nLatest user guidance:\n{message}"
            observation = ActionObservation(
                step=step,
                action_type="user_guidance",
                ok=True,
                output=message,
                metadata={"source": "user", "applied_at": "safe_boundary"},
            )
            observations.append(observation)
            self.tracer.event(
                self.run_id,
                "user.guidance.applied",
                {"message": message, "step": step, "applied_at": "safe_boundary"},
                role="user",
            )
        return active_task, True

    def _cancelled_result(
        self,
        *,
        steps: int,
        model_calls: int,
        initial_tool_calls: int,
        token_usage: dict[str, int],
        observations: list[ActionObservation],
        completion: CompletionAssessment | None = None,
    ) -> RunLoopResult:
        result = self._result(
            status=RunPhase.CANCELLED,
            reason="user_cancelled",
            steps=steps,
            model_calls=model_calls,
            initial_tool_calls=initial_tool_calls,
            token_usage=token_usage,
            observations=observations,
            completion=completion,
        )
        self.tracer.event(self.run_id, "run.cancelled", _terminal_payload(result))
        return result

    def _preflight_budget_reason(
        self,
        *,
        contract: AgentContract,
        model_calls: int,
        started_at: float,
    ) -> str | None:
        if model_calls >= contract.cost_envelope.max_model_calls:
            return "max_model_calls"
        if self.clock() - started_at >= contract.cost_envelope.max_wall_time_seconds:
            return "max_wall_time_seconds"
        return None

    def _budget_result(
        self,
        *,
        reason: str,
        steps: int,
        model_calls: int,
        initial_tool_calls: int,
        token_usage: dict[str, int],
        observations: list[ActionObservation],
        completion: CompletionAssessment | None = None,
    ) -> RunLoopResult:
        result = self._result(
            status=RunPhase.FAILED,
            reason=reason,
            steps=steps,
            model_calls=model_calls,
            initial_tool_calls=initial_tool_calls,
            token_usage=token_usage,
            observations=observations,
            completion=completion,
        )
        self.tracer.event(self.run_id, "run.budget_exceeded", _terminal_payload(result))
        return result

    def _failed_result(
        self,
        *,
        reason: str,
        error: str,
        steps: int,
        model_calls: int,
        initial_tool_calls: int,
        token_usage: dict[str, int],
        observations: list[ActionObservation],
        completion: CompletionAssessment | None = None,
    ) -> RunLoopResult:
        result = self._result(
            status=RunPhase.FAILED,
            reason=reason,
            steps=steps,
            model_calls=model_calls,
            initial_tool_calls=initial_tool_calls,
            token_usage=token_usage,
            observations=observations,
            completion=completion,
        )
        self.tracer.event(
            self.run_id,
            "run.failed",
            {**_terminal_payload(result), "error": error},
        )
        return result

    def _result(
        self,
        *,
        status: RunPhase,
        reason: str,
        steps: int,
        model_calls: int,
        initial_tool_calls: int,
        token_usage: dict[str, int],
        observations: list[ActionObservation],
        final_message: str = "",
        completion: CompletionAssessment | None = None,
    ) -> RunLoopResult:
        return RunLoopResult(
            run_id=self.run_id,
            status=status,
            termination_reason=reason,
            steps=steps,
            model_calls=model_calls,
            tool_calls=self.gateway.used_tool_calls,
            token_usage=dict(token_usage),
            observations=list(observations),
            final_message=final_message,
            completion=completion,
        )


def _add_usage(total: dict[str, int], usage: dict[str, int]) -> None:
    input_tokens = usage.get("input_tokens", usage.get("prompt_tokens", 0))
    output_tokens = usage.get("output_tokens", usage.get("completion_tokens", 0))
    total["input_tokens"] += max(0, input_tokens)
    total["output_tokens"] += max(0, output_tokens)
    total["total_tokens"] = total["input_tokens"] + total["output_tokens"]


def _token_budget_reason(contract: AgentContract, usage: dict[str, int]) -> str | None:
    if usage["input_tokens"] > contract.cost_envelope.max_input_tokens:
        return "max_input_tokens"
    if usage["output_tokens"] > contract.cost_envelope.max_output_tokens:
        return "max_output_tokens"
    return None


def _terminal_payload(result: RunLoopResult) -> dict[str, object]:
    return {
        "status": result.status.value,
        "termination_reason": result.termination_reason,
        "steps": result.steps,
        "model_calls": result.model_calls,
        "tool_calls": result.tool_calls,
        "token_usage": result.token_usage,
        "final_message": result.final_message,
        "completion": result.completion.to_dict() if result.completion is not None else None,
    }
