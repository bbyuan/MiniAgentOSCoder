from __future__ import annotations

import time
from collections.abc import Callable

from app.models import (
    ActiveSkill,
    ActionIR,
    ActionObservation,
    AgentContract,
    CompletionAssessment,
    ContextPack,
    RunLoopResult,
    RunPhase,
    SkillManifest,
)
from app.runtime.action_executor import ActionExecutor
from app.runtime.action_parser import ActionParseError
from app.runtime.capability_menu import build_capability_menu
from app.runtime.completion_guard import evaluate_completion
from app.runtime.model_client import ModelClient
from app.runtime.planner import plan_next_action
from app.runtime.prompt_cache import PromptCache
from app.runtime.role_board import review_planned_action, verify_observation
from app.runtime.tracer import TraceWriter
from app.tools import ToolGateway


MAX_TRANSIENT_MODEL_RETRIES = 2
RETRYABLE_MODEL_ERROR_MARKERS = (
    "timed out",
    "timeout",
    "network request failed",
    "temporarily unavailable",
    "rate limit",
    "429",
    "502",
    "503",
    "504",
)


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
        prompt_cache: PromptCache | None = None,
        skill_loader: Callable[[str], ActiveSkill] | None = None,
    ) -> None:
        self.run_id = run_id
        self.gateway = gateway
        self.model_client = model_client
        self.tracer = tracer
        self.clock = clock
        self.should_cancel = should_cancel
        self.take_steering = take_steering
        self.on_step = on_step
        self.prompt_cache = prompt_cache
        self.skill_loader = skill_loader
        self.model_cache_hits = 0

    def run(
        self,
        *,
        task: str,
        contract: AgentContract,
        context_pack: ContextPack | None = None,
        skills: list[ActiveSkill] | None = None,
        skill_cards: list[SkillManifest] | None = None,
        mode: str | None = None,
        initial_steps: int = 0,
        initial_model_calls: int = 0,
        initial_token_usage: dict[str, int] | None = None,
        initial_model_cache_hits: int = 0,
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
        self.model_cache_hits = max(0, initial_model_cache_hits)
        initial_tool_calls = self.gateway.used_tool_calls
        started_at = self.clock()
        max_steps = max(0, min(contract.program.max_steps, contract.cost_envelope.max_steps))
        starting_step = max(0, initial_steps)
        completion_attempts = 0
        transient_model_failures = 0
        last_completion: CompletionAssessment | None = None
        active_mode = mode or contract.program.mode
        active_task = task
        loaded_skills = list(skills or [])
        available_skill_cards = list(skill_cards or [])

        self.tracer.event(
            self.run_id,
            "run.loop.started",
            {
                "task": task,
                "limits": contract.cost_envelope.to_dict(),
                "effective_max_steps": max_steps,
                "resumed_from_step": starting_step,
                "initial_model_calls": model_calls,
                "initial_model_cache_hits": self.model_cache_hits,
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
            capability_menu = build_capability_menu(
                self.gateway.list_tools(),
                mode=active_mode,
                allowed_effects=contract.effects.allow,
                observations=observations,
                active_skills=loaded_skills,
            )
            self.tracer.event(
                self.run_id,
                "capability.menu.built",
                {"step": step, **capability_menu.trace_payload()},
                role="Orchestrator",
            )
            model_calls += 1
            try:
                decision = plan_next_action(
                    run_id=self.run_id,
                    task=active_task,
                    contract=contract,
                    tools=capability_menu.tools,
                    model_client=self.model_client,
                    tracer=self.tracer,
                    context_pack=context_pack,
                    observations=observations,
                    skills=loaded_skills,
                    skill_cards=available_skill_cards,
                    prompt_cache=self.prompt_cache,
                    capability_phase=capability_menu.phase,
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
                if (
                    _is_retryable_model_error(exc)
                    and transient_model_failures < MAX_TRANSIENT_MODEL_RETRIES
                ):
                    transient_model_failures += 1
                    observation = ActionObservation(
                        step=step,
                        action_type="model_call",
                        ok=False,
                        error=str(exc),
                        metadata={
                            "error_type": type(exc).__name__,
                            "retryable": True,
                            "retry_attempt": transient_model_failures,
                            "max_retries": MAX_TRANSIENT_MODEL_RETRIES,
                        },
                    )
                    observations.append(observation)
                    self.tracer.event(
                        self.run_id,
                        "model.retry_scheduled",
                        {
                            "error": str(exc),
                            "error_type": type(exc).__name__,
                            "attempt": transient_model_failures,
                            "max_retries": MAX_TRANSIENT_MODEL_RETRIES,
                        },
                        role="Planner",
                    )
                    self.tracer.event(
                        self.run_id,
                        "observation.recorded",
                        {"observation": observation.to_dict()},
                        role="Planner",
                    )
                    continue
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

            transient_model_failures = 0
            _add_usage(token_usage, decision.response.usage)
            if decision.cache_hit:
                self.model_cache_hits += 1
            review = review_planned_action(
                decision.action,
                contract=contract,
                phase=capability_menu.phase,
                observations=observations,
            )
            self.tracer.event(
                self.run_id,
                "agent.review.completed",
                {"phase": capability_menu.phase, "assessment": review.to_dict()},
                role=review.role,
            )
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
            if decision.action.type == "use_skill":
                observation = self._load_skill(
                    decision.action,
                    step=step,
                    available=available_skill_cards,
                    loaded=loaded_skills,
                )
                observations.append(observation)
                self.tracer.event(
                    self.run_id,
                    "observation.recorded",
                    {"observation": observation.to_dict()},
                    role=decision.action.role,
                )
                continue

            if decision.action.type == "finish":
                self.tracer.event(
                    self.run_id,
                    "action.parsed",
                    {"phase": capability_menu.phase, "action": decision.action.to_dict(), "control_action": True},
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
                    {"phase": capability_menu.phase, "assessment": last_completion.to_dict()},
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
                        {"phase": capability_menu.phase, "action": decision.action.to_dict(), "assessment": last_completion.to_dict()},
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
                    {"phase": capability_menu.phase, "assessment": last_completion.to_dict()},
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
                phase=capability_menu.phase,
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
            verification = verify_observation(observation, phase=capability_menu.phase)
            self.tracer.event(
                self.run_id,
                "agent.verification.completed",
                {"phase": capability_menu.phase, "assessment": verification.to_dict()},
                role=verification.role,
            )
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

    def _load_skill(
        self,
        action: ActionIR,
        *,
        step: int,
        available: list[SkillManifest],
        loaded: list[ActiveSkill],
    ) -> ActionObservation:
        self.tracer.event(
            self.run_id,
            "action.parsed",
            {"action": action.to_dict(), "control_action": True},
            role=action.role,
        )
        skill_id = action.params.get("skill_id")
        available_ids = {skill.id for skill in available}
        if not isinstance(skill_id, str) or skill_id not in available_ids:
            error = "Skill is not enabled for this run"
            self.tracer.event(
                self.run_id,
                "skill.load_failed",
                {"skill_id": skill_id if isinstance(skill_id, str) else "", "error": error},
                role=action.role,
            )
            return ActionObservation(
                step=step,
                action_type="use_skill",
                ok=False,
                error=error,
                metadata={"skill_id": skill_id, "error_type": "SkillNotAvailable"},
            )
        existing = next((skill for skill in loaded if skill.id == skill_id), None)
        if existing is not None:
            return ActionObservation(
                step=step,
                action_type="use_skill",
                ok=True,
                output=f"Skill already loaded: {skill_id}",
                metadata={"skill_id": skill_id, "already_loaded": True},
            )
        if self.skill_loader is None:
            error = "Skill loader is unavailable"
            self.tracer.event(
                self.run_id,
                "skill.load_failed",
                {"skill_id": skill_id, "error": error},
                role=action.role,
            )
            return ActionObservation(
                step=step,
                action_type="use_skill",
                ok=False,
                error=error,
                metadata={"skill_id": skill_id, "error_type": "SkillLoaderUnavailable"},
            )
        try:
            skill = self.skill_loader(skill_id)
        except (OSError, TypeError, ValueError) as exc:
            error = str(exc)
            self.tracer.event(
                self.run_id,
                "skill.load_failed",
                {"skill_id": skill_id, "error": error},
                role=action.role,
            )
            return ActionObservation(
                step=step,
                action_type="use_skill",
                ok=False,
                error=error,
                metadata={"skill_id": skill_id, "error_type": type(exc).__name__},
            )
        loaded.append(skill)
        self.tracer.event(
            self.run_id,
            "skill.activated",
            {
                "skill_id": skill.id,
                "name": skill.name,
                "path": skill.path,
                "digest": skill.digest,
                "default_tools": skill.default_tools,
            },
            role=action.role,
        )
        return ActionObservation(
            step=step,
            action_type="use_skill",
            ok=True,
            output=f"Loaded Skill instructions: {skill.name}",
            metadata={"skill_id": skill.id, "digest": skill.digest},
        )

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
            model_cache_hits=self.model_cache_hits,
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


def _is_retryable_model_error(exc: Exception) -> bool:
    error_type = type(exc).__name__.lower()
    message = str(exc).lower()
    if "modelprovidererror" not in error_type and not isinstance(exc, TimeoutError):
        return False
    return any(marker in message for marker in RETRYABLE_MODEL_ERROR_MARKERS)


def _terminal_payload(result: RunLoopResult) -> dict[str, object]:
    return {
        "status": result.status.value,
        "termination_reason": result.termination_reason,
        "steps": result.steps,
        "model_calls": result.model_calls,
        "model_cache_hits": result.model_cache_hits,
        "tool_calls": result.tool_calls,
        "token_usage": result.token_usage,
        "final_message": result.final_message,
        "completion": result.completion.to_dict() if result.completion is not None else None,
    }
