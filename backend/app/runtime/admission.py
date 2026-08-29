from __future__ import annotations

from datetime import datetime
import math
from typing import Any

from app.models import (
    AdmissionCheck,
    AgentContract,
    ContextPack,
    CostForecast,
    ResourceForecast,
    RunAdmission,
    RunState,
)
from app.runtime.model_provider import ModelProviderConfig


_MODE_DEFAULTS = {
    "chat": {"model_calls": 3, "tool_calls": 2, "output_tokens": 1200, "wall_time_seconds": 40},
    "review": {"model_calls": 6, "tool_calls": 6, "output_tokens": 2400, "wall_time_seconds": 90},
    "bugfix": {"model_calls": 9, "tool_calls": 11, "output_tokens": 3600, "wall_time_seconds": 150},
    "feature": {"model_calls": 11, "tool_calls": 14, "output_tokens": 4400, "wall_time_seconds": 190},
    "spec": {"model_calls": 10, "tool_calls": 12, "output_tokens": 4000, "wall_time_seconds": 170},
}


def build_run_admission(
    *,
    run: RunState,
    contract: AgentContract,
    context_pack: ContextPack,
    project_profile: dict[str, Any],
    model_config: ModelProviderConfig,
    history_samples: list[dict[str, Any]],
    enabled_extensions: int = 0,
) -> RunAdmission:
    context_tokens = context_pack.budget_report.used_tokens if context_pack.budget_report else 0
    defaults = dict(_MODE_DEFAULTS.get(run.mode.lower(), _MODE_DEFAULTS["feature"]))
    task_adjustment = 1 if len(run.task) > 500 else 0
    defaults["model_calls"] += task_adjustment
    defaults["tool_calls"] += min(3, max(0, enabled_extensions))
    defaults["input_tokens"] = max(
        context_tokens,
        context_tokens * defaults["model_calls"] + defaults["model_calls"] * 320,
    )

    usable_samples = [_sample_metrics(sample) for sample in history_samples]
    usable_samples = [sample for sample in usable_samples if sample is not None]
    sample_size = len(usable_samples)
    basis = "history" if sample_size >= 3 else "hybrid" if sample_size else "heuristic"
    confidence = "high" if sample_size >= 8 else "medium" if sample_size >= 3 else "low"
    ceilings = {
        "model_calls": contract.cost_envelope.max_model_calls,
        "tool_calls": contract.cost_envelope.max_tool_calls,
        "input_tokens": contract.cost_envelope.max_input_tokens,
        "output_tokens": contract.cost_envelope.max_output_tokens,
        "wall_time_seconds": contract.cost_envelope.max_wall_time_seconds,
    }
    resources: dict[str, ResourceForecast] = {}
    for key, ceiling in ceilings.items():
        values = [int(sample[key]) for sample in usable_samples]
        if sample_size < 3:
            values.extend([int(defaults[key])] * max(1, 3 - sample_size))
        elif not values:
            values = [int(defaults[key])]
        resources[key] = ResourceForecast(
            low=max(0, _quantile(values, 0.25)),
            expected=max(0, _quantile(values, 0.50)),
            high=max(0, _quantile(values, 0.80)),
            ceiling=max(0, int(ceiling)),
            unit=_unit_for(key),
        )

    checks = _admission_checks(
        contract=contract,
        context_tokens=context_tokens,
        resources=resources,
        has_test_command=bool(project_profile.get("test_commands")),
        mode=run.mode,
        sample_size=sample_size,
    )
    can_start = not any(check.status == "blocked" for check in checks)
    decision = "blocked" if not can_start else "warning" if any(check.status == "warning" for check in checks) else "ready"
    return RunAdmission(
        run_id=run.run_id,
        decision=decision,
        can_start=can_start,
        basis=basis,
        confidence=confidence,
        sample_size=sample_size,
        resources=resources,
        cost=_cost_forecast(resources, model_config),
        checks=checks,
        assumptions=[
            "forecast_not_guarantee",
            "contract_ceilings_enforced",
            "history_numeric_only",
        ],
    )


def _sample_metrics(sample: dict[str, Any]) -> dict[str, int] | None:
    try:
        model_calls = max(0, int(sample.get("model_calls", 0)))
        if model_calls <= 0:
            return None
        return {
            "model_calls": model_calls,
            "tool_calls": max(0, int(sample.get("tool_calls", 0))),
            "input_tokens": max(0, int(sample.get("input_tokens", 0))),
            "output_tokens": max(0, int(sample.get("output_tokens", 0))),
            "wall_time_seconds": _duration_seconds(sample.get("created_at"), sample.get("completed_at")),
        }
    except (TypeError, ValueError):
        return None


def _duration_seconds(start: Any, end: Any) -> int:
    if not isinstance(start, str) or not isinstance(end, str):
        return 0
    try:
        duration = datetime.fromisoformat(end) - datetime.fromisoformat(start)
    except ValueError:
        return 0
    return max(0, math.ceil(duration.total_seconds()))


def _quantile(values: list[int], quantile: float) -> int:
    ordered = sorted(values)
    if not ordered:
        return 0
    position = (len(ordered) - 1) * quantile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return int(ordered[lower])
    weight = position - lower
    return int(round(ordered[lower] * (1 - weight) + ordered[upper] * weight))


def _unit_for(resource: str) -> str:
    if resource.endswith("tokens"):
        return "tokens"
    if resource == "wall_time_seconds":
        return "seconds"
    return "calls"


def _admission_checks(
    *,
    contract: AgentContract,
    context_tokens: int,
    resources: dict[str, ResourceForecast],
    has_test_command: bool,
    mode: str,
    sample_size: int,
) -> list[AdmissionCheck]:
    limits = contract.cost_envelope
    positive = all(
        value > 0
        for value in (
            limits.max_steps,
            limits.max_model_calls,
            limits.max_tool_calls,
            limits.max_input_tokens,
            limits.max_output_tokens,
            limits.max_wall_time_seconds,
        )
    )
    checks = [
        AdmissionCheck(
            id="contract_limits",
            status="passed" if positive else "blocked",
            summary="Contract limits are usable" if positive else "Contract contains a non-positive hard limit",
            evidence=f"steps={limits.max_steps}; model_calls={limits.max_model_calls}; tool_calls={limits.max_tool_calls}",
        ),
        AdmissionCheck(
            id="context_fit",
            status="passed" if context_tokens <= limits.max_input_tokens else "blocked",
            summary="Selected context fits the input ceiling" if context_tokens <= limits.max_input_tokens else "Selected context exceeds the input ceiling",
            evidence=f"selected={context_tokens}; ceiling={limits.max_input_tokens}",
        ),
    ]
    for key in ("model_calls", "tool_calls", "input_tokens", "output_tokens", "wall_time_seconds"):
        forecast = resources[key]
        ratio = forecast.high / forecast.ceiling if forecast.ceiling else math.inf
        checks.append(
            AdmissionCheck(
                id=f"{key}_headroom",
                status="warning" if ratio >= 0.8 else "passed",
                summary="High forecast approaches or exceeds the ceiling" if ratio >= 0.8 else "Forecast retains contract headroom",
                evidence=f"high={forecast.high}; ceiling={forecast.ceiling}; ratio={round(ratio, 3)}",
            )
        )
    write_mode = mode.lower() in {"bugfix", "feature", "spec"}
    checks.append(
        AdmissionCheck(
            id="validation_ready",
            status="warning" if write_mode and not has_test_command else "passed",
            summary="No project validation command was detected" if write_mode and not has_test_command else "Validation path is available or not required",
            evidence=f"mode={mode}; test_command_detected={str(has_test_command).lower()}",
        )
    )
    checks.append(
        AdmissionCheck(
            id="forecast_confidence",
            status="passed" if sample_size >= 3 else "info",
            summary="Forecast is calibrated from project history" if sample_size >= 3 else "Forecast uses mode heuristics until more Runs complete",
            evidence=f"sample_size={sample_size}",
        )
    )
    return checks


def _cost_forecast(
    resources: dict[str, ResourceForecast],
    model_config: ModelProviderConfig,
) -> CostForecast:
    input_price = model_config.input_price_per_million
    output_price = model_config.output_price_per_million
    if input_price is None or output_price is None:
        return CostForecast()
    input_tokens = resources["input_tokens"]
    output_tokens = resources["output_tokens"]

    def cost(input_value: int, output_value: int) -> float:
        return round((input_value * input_price + output_value * output_price) / 1_000_000, 6)

    return CostForecast(
        configured=True,
        expected=cost(input_tokens.expected, output_tokens.expected),
        high=cost(input_tokens.high, output_tokens.high),
        ceiling=cost(input_tokens.ceiling, output_tokens.ceiling),
    )
